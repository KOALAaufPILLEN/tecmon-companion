import http from "node:http";
import { readFile, writeFile, mkdir, readdir, stat, open, realpath } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { validateJob, recordingConfig, jobCameras } from "./job.mjs";
import { cameraSql, cleanupSql, runCameraSql } from "./custom-cameras.mjs";
import { matchDownloadRequest, shareCode } from "./share-code.mjs";
import { ensureRecordingPlugin, recordingFailure } from "./recording-engine.mjs";
import { recordInternal, internalReady, cameraSession, ENGINE_CAPABILITY } from "./internal-recorder.mjs";
import { downloadValveDemo, decodeShareCode } from "./valve-download.mjs";
import { ANGLE_CAPABILITY, SCRIPT_CAPABILITY, SESSION_CAPABILITY } from "./camera-script.mjs";
import { needsScript } from "./job.mjs";
import { updateHandoff } from "./update-handoff.mjs";
import { lazyEngine } from "./lazy-engine.mjs";
import { loadBrandingPack } from "./branding-assets.mjs";
import { renderBranding } from "./video-branding.mjs";
import { createBrowserBridge } from "./browser-bridge.mjs";
import { browserDemos } from "./browser-demo.mjs";
import { createGameTips, FEATURES } from "./game-tips.mjs";
import { createInsightsStore } from "./insights.mjs";
import { createGsiSettings, installGsiConfig, removeGsiConfig, gsiConfigPath } from "./gsi-config.mjs";
import { downloadDemo } from "./demo-download.mjs";
import { checkUpdate, downloadUpdate, VERSION } from "./updater.mjs";
import { checkPostgres, postgresEnvironment } from "./postgresql.mjs";
import {
  readInstallation,
  ensureManagedDatabase,
  stopManagedDatabase,
  managedEnvironment,
  csdmInvocation,
  runTool,
} from "./managed-installation.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
export async function detect() {
  const programs = [
    path.join(local, "Programs"),
    path.join(os.homedir(), "AppData", "Programs"),
    process.env.ProgramFiles || "C:\\Program Files",
  ];
  const csdm =
    [
      ...programs.flatMap((p) =>
        ["csdm.exe", "cs-demo-manager.exe"].map((name) => path.join(p, "CS Demo Manager", name)),
      ),
      ...(process.env.PATH || "").split(path.delimiter).map((p) => path.join(p, "csdm.exe")),
    ].find(existsSync) || "";
  const steam = [path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam")];
  try {
    const vdf = await readFile(path.join(steam[0], "steamapps", "libraryfolders.vdf"), "utf8");
    for (const match of vdf.matchAll(/"path"\s+"([^"]+)"/g))
      steam.push(match[1].replaceAll("\\\\", "\\"));
  } catch {
    /* Steam may not be installed. */
  }
  const cs2 =
    steam
      .map((p) =>
        path.join(
          p,
          "steamapps",
          "common",
          "Counter-Strike Global Offensive",
          "game",
          "bin",
          "win64",
          "cs2.exe",
        ),
      )
      .find(existsSync) || "";
  return { csdm, cs2 };
}

async function mp4s(dir, base = dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await mp4s(full, base)));
    else if (entry.isFile() && /\.mp4$/i.test(entry.name) && (await stat(full)).size > 0)
      files.push(path.relative(base, full));
  }
  return files;
}

/** Datei mit dem Standardprogramm öffnen oder im Explorer markieren (nur Windows). */
function openInExplorer(target, select = false) {
  if (process.platform !== "win32") throw new Error("Nur in der Windows-Version verfügbar.");
  // Pfade sind vorher gegen den Datenordner geprüft; Windows-Pfade enthalten keine Anführungszeichen.
  const child = spawn("explorer.exe", [select ? `/select,"${target}"` : `"${target}"`], {
    windowsVerbatimArguments: true,
    windowsHide: false,
    stdio: "ignore",
    detached: true,
  });
  child.on("error", () => {});
  child.unref();
}

const JOB_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createCompanion({
  dataDir = path.join(local, "TecMon", "Companion"),
  runProcess,
  installation = null,
  detectTools = detect,
  loadAssets = loadBrandingPack,
  startDatabase = ensureManagedDatabase,
  stopDatabase = stopManagedDatabase,
  runSql = (sql) => runCameraSql(installation, sql, runTool),
  openPath = openInExplorer,
  onUpdateExit,
  now,
  engineSystem = {},
} = {}) {
  if (installation) dataDir = path.join(installation.dataDir, "Jobs");
  await mkdir(dataDir, { recursive: true });
  const token = randomBytes(32).toString("hex");
  const jobs = new Map();
  const downloads = new Map();
  const browserFiles=browserDemos(path.join(dataDir,"Browser-Demos"));
  let active = false;
  /** Neueste fertige Videos aller Aufträge im Datenordner, auch aus früheren Sitzungen. */
  async function recentVideos(limit = 3) {
    const list = [];
    let entries = [];
    try {
      entries = await readdir(dataDir, { withFileTypes: true });
    } catch {
      return list;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !JOB_DIR.test(entry.name)) continue;
      const dir = path.join(dataDir, entry.name);
      for (const file of await mp4s(dir).catch(() => [])) {
        const info = await stat(path.join(dir, file)).catch(() => null);
        if (!info) continue;
        list.push({
          key: `${entry.name}/${file.split(path.sep).join("/")}`,
          name: path.basename(file),
          size: info.size,
          time: info.mtimeMs,
        });
      }
    }
    return list.sort((a, b) => b.time - a.time).slice(0, limit);
  }
  async function videoPath(key) {
    const parts = typeof key === "string" ? key.split("/") : [];
    if (parts.length < 2 || !JOB_DIR.test(parts[0]) || parts.some((p) => !p || p === "." || p === "..") || !/\.mp4$/i.test(key))
      throw new Error("Video nicht gefunden.");
    const base = await realpath(dataDir);
    const full = await realpath(path.join(dataDir, ...parts)).catch(() => {
      throw new Error("Video nicht gefunden.");
    });
    const relative = path.relative(base, full);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Video nicht gefunden.");
    return full;
  }
  const detected = await detectTools();
  const bridge = await createBrowserBridge(installation?.profileDir || dataDir);
  if (installation) {
    detected.csdm = installation.csdmExe;
    detected.cs2 = installation.cs2Exe || detected.cs2;
  }
  // CS2 Game State Integration: offizielle, rein lesende Schnittstelle für Rundentipps.
  const gsi = await createGsiSettings(installation?.profileDir || dataDir);
  /* Radarbilder bringt CS Demo Manager mit (resources/static/images/maps/cs2/radars). Nur lokal lesen. */
  function radarPath(map) {
    if (!/^de_[a-z0-9_]+$/.test(map) || !detected.csdm) return "";
    const file = path.join(path.dirname(detected.csdm), "resources", "static", "images", "maps", "cs2", "radars", `${map}.png`);
    return existsSync(file) ? file : "";
  }
  const insights = await createInsightsStore(installation?.profileDir || dataDir);
  const tips = createGameTips({
    ...(now ? { now } : {}),
    radarPath,
    enabled: (id) => gsi.feature(id),
    insights: (steamId) => insights.get(steamId),
  });
  let gsiError = "";
  async function syncGsiConfig() {
    gsiError = "";
    try {
      if (gsi.enabled) await installGsiConfig(detected.cs2, gsi.token);
      else await removeGsiConfig(detected.cs2);
    } catch (error) {
      gsiError = error.message;
    }
  }
  if (gsi.enabled) await syncGsiConfig();
  function gsiState() {
    return {
      enabled: gsi.enabled,
      available: !!gsiConfigPath(detected.cs2),
      error: gsiError,
      features: FEATURES.map(({ id, label }) => ({ id, label, enabled: gsi.feature(id) })),
      insights: insights.summary(),
      ...tips.state(),
    };
  }
  async function gsiRequest(req, res) {
    // CS2 schickt weder Origin noch Sitzungstoken; Browser-Anfragen tragen immer ein Origin.
    if (req.method !== "POST" || req.headers.origin)
      return json(res, 403, { error: "Nur für CS2 vorgesehen." });
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 262144) return json(res, 413, { error: "Zu groß." });
    }
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      return json(res, 400, { error: "Ungültige Daten." });
    }
    if (!gsi.matches(payload?.auth?.token)) return json(res, 401, { error: "Falsches Token." });
    // Während einer Demo-Aufnahme sendet CS2 die Daten des aufgenommenen Spielers: ignorieren.
    if (gsi.enabled && !active) tips.ingest(payload);
    return json(res, 200, { ok: true });
  }
  let postgres = installation ? {installed:true,supported:true,ready:false,version:"18",port:installation.port,lazy:true} : await checkPostgres();
  const prepareEngine=lazyEngine(async()=>{
    if(!installation)return;
    await startDatabase(installation);
    postgres={...postgres,ready:true,lazy:false};
  });
  /*
   * Eigene TecMon-Engine: Download und Aufnahme ohne CS-Demo-Manager-Programm
   * und ohne Datenbank. Standardmäßig an; unter „Erweitert“ abschaltbar, dann
   * läuft alles wie bisher über CS Demo Manager.
   */
  const engineFile = path.join(installation?.profileDir || dataDir, "engine.json");
  const engineCache = installation ? path.join(path.dirname(installation.profileDir), "engine") : path.join(dataDir, "engine");
  let ownEngine = true;
  try {
    ownEngine = JSON.parse(await readFile(engineFile, "utf8")).internal !== false;
  } catch {
    /* Standard: eigene Engine */
  }
  const ownDownload = () => ownEngine && !!installation && (process.platform === "win32" || !!engineSystem.download);
  const ownRecording = async (spec) =>
    ownEngine && (engineSystem.recorder ? !!installation : await internalReady(installation, detected.cs2, spec));
  /** Schon geladene Valve-Demo desselben Matches wiederverwenden (gleicher Dateiname aus der Match-ID). */
  async function knownDemo(code) {
    let name;
    try {
      name = `match730_${decodeShareCode(code).matchId}.dem`;
    } catch {
      return "";
    }
    const root = path.join(dataDir, "Downloads");
    for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
      if (!entry.isDirectory() || !JOB_DIR.test(entry.name)) continue;
      const file = path.join(root, entry.name, name);
      if (await stat(file).then((s) => s.isFile() && s.size > 1024, () => false)) return file;
    }
    return "";
  }
  async function fetchDemo({ code, directory, exe, entry }) {
    const known = await knownDemo(code);
    if (known) {
      entry.log += "\nDemo dieses Matches liegt schon auf dem PC.";
      entry.engine = "tecmon";
      return known;
    }
    if (ownDownload()) {
      try {
        const demo = await downloadValveDemo({
          code,
          directory,
          cacheDir: engineCache,
          log: (message) => {
            entry.log += `\n${message}`;
          },
          system: engineSystem.download,
        });
        entry.engine = "tecmon";
        return demo;
      } catch (error) {
        if (!exe) throw error;
        entry.log += `\n${error.message}\nEigener Download fehlgeschlagen, nutze CS Demo Manager …`;
      }
    }
    await prepareEngine();
    entry.engine = "csdm";
    return downloadDemo({ code, directory, exe, run, entry });
  }
  async function csdmIfPresent() {
    try {
      return await engine();
    } catch (error) {
      if (ownDownload()) return "";
      throw error;
    }
  }
  let checkingDatabase = false;
  let pickingFile = false;
  let lastInstallerLaunch = 0;
  const run =
    runProcess ||
    ((exe, args, job) =>
      new Promise((resolve, reject) => {
        const command = csdmInvocation(exe, args, installation);
        const child = spawn(command.exe, command.args, {
          shell: false,
          windowsHide: true,
          env: installation
            ? command.env
            : {
                ...postgresEnvironment(postgres),
                ...(command.env.ELECTRON_RUN_AS_NODE ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
              },
        });
        const timer = setTimeout(
          () => {
            child.kill();
            reject(new Error("Zeitlimit erreicht. Prüfe CS2 und CS Demo Manager."));
          },
          90 * 60 * 1000,
        );
        const log = (b) => {
          job.log = (job.log + b.toString()).slice(-16000);
        };
        child.stdout.on("data", log);
        child.stderr.on("data", log);
        child.once("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.once("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else
            reject(new Error(`CS Demo Manager wurde mit Code ${code} beendet. Siehe Protokoll.`));
        });
      }));
  const json = (res, code, value) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(value));
  };
  async function record(job, input) {
    const exe = typeof input.csdm === "string" ? input.csdm : "";
    const demo = typeof input.demo === "string" ? input.demo : "";
    const own = await ownRecording(job.job);
    if (
      !own &&
      (!path.isAbsolute(exe) ||
        !["csdm.exe", "cs-demo-manager.exe"].includes(path.basename(exe).toLowerCase()) ||
        !(await stat(exe)).isFile())
    )
      throw new Error("Bitte den vollständigen Pfad zur csdm.exe eintragen.");
    if (!path.isAbsolute(demo) || !/\.dem$/i.test(demo) || !(await stat(demo)).isFile())
      throw new Error("Bitte eine entpackte CS2-Demo (.dem) angeben.");
    const handle = await open(demo, "r");
    try {
      const header = Buffer.alloc(8);
      await handle.read(header, 0, 8, 0);
      if (header.toString() !== "PBDEMS2\0") throw new Error("Keine CS2-Demo.");
    } finally {
      await handle.close();
    }
    const branding = job.job.branding.enabled;
    let assets;
    if (branding) {
      if (!installation)
        throw new Error(
          "Video-Branding benötigt den installierten Windows-Companion 0.6 oder neuer. Alternativ Branding im Auftrag deaktivieren.",
        );
      job.status = "preparing";
      job.log += "\nVersionierte TecMon-Visuals laden und feste SHA-256-Prüfsummen prüfen …";
      assets = await loadAssets(path.join(installation.profileDir, "Branding"));
    }
    if (installation && !own)
      await ensureRecordingPlugin(installation, (message) => {
        job.log += `\n${message}`;
      });
    const output = path.join(dataDir, job.id);
    await mkdir(output, { recursive: true });
    const config = path.join(output, "recording.json");
    const cameras = jobCameras(job.job, randomUUID);
    if (cameras.length && !installation)
      throw new Error("Freecam-Kamerapunkte benötigen den installierten Windows-Companion.");
    const recording = recordingConfig(job.job, demo, output, input.quality, cameras);
    if (branding) recording.concatenateSequences = false; // Keep exact scene boundaries for player labels.
    if (installation)
      recording.ffmpegSettings = {
        ...recording.ffmpegSettings,
        customLocationEnabled: true,
        customExecutableLocation: installation.ffmpegExe,
      };
    await writeFile(config, JSON.stringify(recording, null, 2));
    await writeFile(path.join(output, "tecmon-job.json"), JSON.stringify(job.job, null, 2));
    if (own) {
      job.engine = "tecmon";
      job.status = "recording";
      job.log += "\nEigene TecMon-Aufnahme (ohne CS Demo Manager und Datenbank).";
      try {
        await recordInternal({
          recording,
          job: job.job,
          demo,
          installation,
          cs2Exe: detected.cs2,
          cameras,
          cacheDir: engineCache,
          log: (message) => {
            job.log += `\n${message}`;
          },
          system: engineSystem.recorder,
        });
      } catch (error) {
        let pluginLog = "";
        try {
          if (detected.cs2) pluginLog = await readFile(path.join(path.dirname(detected.cs2), "csdm.log"), "utf8");
        } catch {
          /* optional diagnostics */
        }
        throw new Error(recordingFailure(error, pluginLog));
      }
      return finishRecording(job, output, branding, assets);
    }
    job.engine = "csdm";
    if (needsScript(job.job))
      job.log += "\nKamerafahrten und Verfolger-Kamera gibt es nur mit der eigenen TecMon-Engine. CS Demo Manager nutzt stattdessen feste Punkte und die Egoansicht.";
    job.status = "analyzing";
    job.output = output;
    await prepareEngine();
    await run(exe, ["analyze", demo], job);
    // Nach der Analyse gibt es die CSDM-Tabellen sicher; die Punkte gelten nur fuer diesen Auftrag.
    if (cameras.length) {
      job.log += `\n${cameras.length} Freecam-Kamerapunkt(e) in CS Demo Manager anlegen …`;
      await runSql(cameraSql(job.job.map, cameras));
    }
    job.status = "recording";
    try {
      await run(exe, ["video", "--config-file", config], job);
    } catch (error) {
      let pluginLog = "";
      try {
        if (detected.cs2)
          pluginLog = await readFile(path.join(path.dirname(detected.cs2), "csdm.log"), "utf8");
      } catch {
        /* optional diagnostics */
      }
      throw new Error(recordingFailure(error, pluginLog));
    } finally {
      if (cameras.length) await runSql(cleanupSql()).catch(() => {});
    }
    return finishRecording(job, output, branding, assets);
  }
  async function finishRecording(job, output, branding, assets) {
    if (branding) {
      job.status = "branding";
      const final = await renderBranding({
        job: job.job,
        directory: output,
        assets,
        ffmpeg: installation.ffmpegExe,
        launcher: path.join(root, "TecMon Companion.exe"),
        progress: (message) => {
          job.log += `\n${message}`;
        },
      });
      job.files = [path.relative(output, final)];
    } else job.files = await mp4s(output);
    if (!job.files.length) throw new Error("Keine MP4 erzeugt. Protokoll im Companion prüfen.");
    job.status = "done";
  }
  async function engine() {
    const exe = detected.csdm;
    if (
      !path.isAbsolute(exe) ||
      !["csdm.exe", "cs-demo-manager.exe"].includes(path.basename(exe).toLowerCase()) ||
      !(await stat(exe)).isFile()
    )
      throw new Error("CS Demo Manager fehlt. Einrichtung im Companion prüfen.");
    return exe;
  }
  async function readInput(req, limit = 65536) {
    if (req.method !== "POST" || req.headers["content-type"] !== "application/json")
      throw new Error("JSON-Auftrag erwartet.");
    let body = "";
    for await (const b of req) {
      body += b;
      if (body.length > limit) throw new Error("Auftrag zu groß.");
    }
    return JSON.parse(body);
  }
  async function video(res, job, index) {
    const file = job?.files?.[Number(index)];
    if (!file || job.status !== "done") return json(res, 404, { error: "Video nicht vorhanden." });
    const full = await realpath(path.join(job.output, file));
    const relative = path.relative(await realpath(job.output), full);
    if (relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Ungültiger Videopfad.");
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Disposition": 'attachment; filename="tecmon-highlight.mp4"',
    });
    return createReadStream(full)
      .on("error", () => res.destroy())
      .pipe(res);
  }
  async function bridgeRequest(req, res, url) {
    const source = req.headers.origin;
    if (!bridge.allowed(source)) return json(res, 403, { error: "Webseite nicht freigegeben." });
    res.setHeader("Access-Control-Allow-Origin", source);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      if (!["GET", "POST"].includes(req.headers["access-control-request-method"]))
        return json(res, 403, { error: "Methode nicht erlaubt." });
      const headers = (req.headers["access-control-request-headers"] || "")
        .toLowerCase()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (headers.some((h) => !["content-type", "x-tecmon-bridge-token"].includes(h)))
        return json(res, 403, { error: "Header nicht erlaubt." });
      res.setHeader("Access-Control-Allow-Methods", "GET, POST");
      res.setHeader("Access-Control-Allow-Headers", "content-type, x-tecmon-bridge-token");
      res.setHeader("Access-Control-Allow-Private-Network", "true");
      res.writeHead(204);
      return res.end();
    }
    if (req.method === "POST" && url.pathname === "/bridge/pair") {
      await readInput(req);
      return json(res, 201, bridge.pair(source));
    }
    if (req.method === "POST" && url.pathname === "/bridge/pair/poll") {
      const input = await readInput(req);
      return json(res, 200, bridge.poll(source, input.request));
    }
    const owner = bridge.authorize(source, req.headers["x-tecmon-bridge-token"]);
    if (!owner) return json(res, 401, { error: "Webseite zuerst im Companion verbinden." });
    if (req.method === "GET" && url.pathname === "/bridge/state")
      return json(res, 200, {
        version: VERSION,
        active,
        capabilities: ["browser-demo-v1","xray-v1","insights-v1","insights-v2",...(installation ? ["video-branding-v1","camera-points-v1",ENGINE_CAPABILITY,...(ownEngine ? [SCRIPT_CAPABILITY,SESSION_CAPABILITY,ANGLE_CAPABILITY] : [])] : [])],
      });
    if (req.method === "POST" && url.pathname === "/bridge/insights") {
      const input = await readInput(req, 262144);
      return json(res, 200, await insights.put(input));
    }
    if(req.method === "POST" && url.pathname === "/bridge/demo/start"){
      if(active || jobs.size>=100)throw new Error("Zuerst den laufenden Auftrag abschließen.");
      const input=await readInput(req);return json(res,201,await browserFiles.start(owner,input.size));
    }
    if(req.method === "POST" && url.pathname === "/bridge/demo/chunk"){
      if(active || req.headers["content-type"]!=="application/octet-stream")throw new Error("Demo-Übertragung derzeit nicht möglich.");
      return json(res,200,await browserFiles.chunk(owner,url.searchParams.get("id"),Number(url.searchParams.get("offset")),req));
    }
    if(req.method === "POST" && url.pathname === "/bridge/demo/cancel"){
      const input=await readInput(req);await browserFiles.cancel(owner,input.id);return json(res,200,{cancelled:true});
    }
    if (req.method === "GET" && ["/bridge/job", "/bridge/video"].includes(url.pathname)) {
      const job = jobs.get(url.searchParams.get("id"));
      if (!job || job.owner !== owner) return json(res, 404, { error: "Auftrag nicht vorhanden." });
      if (url.pathname === "/bridge/video") return video(res, job, url.searchParams.get("file"));
      return json(res, 200, {
        id: job.id,
        status: job.status,
        files: job.files.length,
        ...(job.marks ? { marks: job.marks } : {}),
        error:
          job.status === "error"
            ? "Lokaler Auftrag fehlgeschlagen. Protokoll im Companion prüfen (z. B. abgelaufene Demo oder Steam nicht angemeldet)."
            : undefined,
      });
    }
    if (req.method === "POST" && url.pathname === "/bridge/camera") return cameraRequest(req, res, owner);
    if (req.method !== "POST" || !["/bridge/download", "/bridge/capture"].includes(url.pathname))
      return json(res, 404, { error: "Nicht gefunden." });
    const input = await readInput(req);
    if (active) throw new Error("Auf deinem PC läuft bereits eine Aufnahme oder ein Download.");
    if (input.confirm !== true) throw new Error("Lokalen Download / Aufnahme bitte bestätigen.");
    if (jobs.size >= 100) throw new Error("Auftragsliste voll. Companion neu starten.");
    const capture = url.pathname === "/bridge/capture";
    const specification = capture ? validateJob(input.job) : null;
    if (capture && !specification.shareCode && typeof input.demoId!=="string")
      throw new Error("Sharecode oder die Originaldemo aus dem Browser fehlt.");
    const codes = capture ? (specification.shareCode ? [specification.shareCode] : []) : matchDownloadRequest(input);
    if (downloads.size + codes.length > 100)
      throw new Error("Downloadliste voll. Companion neu starten.");
    const job = {
      id: randomUUID(),
      owner,
      job: specification || { title: "Match-Download", map: "", tickRate: 64, sequences: [] },
      status: "downloading",
      log: "",
      files: [],
    };
    active = true;
    try {
      const exe = await csdmIfPresent();
      const browserDemo=capture && !specification.shareCode ? browserFiles.consume(owner,input.demoId) : null;
      jobs.set(job.id, job);
      void (async () => {
        try {
          let demo=browserDemo;
          for (const code of codes) {
            const entry = { id: randomUUID(), code, status: "downloading", log: "", demo: "" };
            downloads.set(entry.id, entry);
            try {
              demo = await fetchDemo({
                code,
                directory: path.join(dataDir, "Downloads", entry.id),
                exe,
                entry,
              });
              entry.demo = demo;
              entry.status = "done";
            } catch (error) {
              entry.status = "error";
              entry.log += `\n${error.message}`;
              throw error;
            }
          }
          if (capture) {
            if (!exe && !(await ownRecording(job.job)))
              throw new Error("CS Demo Manager fehlt und der Auftrag passt nicht zur eigenen Aufnahme. Webseite neu laden und erneut senden.");
            await record(job, { csdm: exe, demo, quality: input.quality });
          }
          else job.status = "done";
        } catch (error) {
          job.status = "error";
          job.log += `\n${error.message}`;
        } finally {
          active = false;
        }
      })();
      return json(res, 202, { id: job.id });
    } catch (error) {
      active = false;
      throw error;
    }
  }
  /**
   * „Kamera im Spiel setzen“: Demo laden (Sharecode oder aus dem Browser),
   * CS2 am Zeitpunkt öffnen, gemerkte Punkte als `marks` zurückgeben.
   */
  async function cameraRequest(req, res, owner) {
    const input = await readInput(req);
    if (active) throw new Error("Auf deinem PC läuft bereits eine Aufnahme oder ein Download.");
    if (input.confirm !== true) throw new Error("Start von CS2 bitte bestätigen.");
    if (!installation || !ownEngine || (process.platform !== "win32" && !engineSystem.recorder))
      throw new Error("Kamera im Spiel setzen braucht den installierten Windows-Companion mit eigener TecMon-Engine.");
    if (!Number.isSafeInteger(input.tick) || input.tick < 0 || input.tick > 100_000_000) throw new Error("Ungültiger Zeitpunkt.");
    if (jobs.size >= 100) throw new Error("Auftragsliste voll. Companion neu starten.");
    const code = input.shareCode === undefined ? "" : shareCode(input.shareCode);
    if (!code && typeof input.demoId !== "string") throw new Error("Sharecode oder die Originaldemo aus dem Browser fehlt.");
    const job = {
      id: randomUUID(),
      owner,
      job: { title: "Kamera setzen", map: "", tickRate: 64, sequences: [] },
      status: "downloading",
      log: "",
      files: [],
    };
    active = true;
    try {
      const exe = code ? await csdmIfPresent() : "";
      const browserDemo = code ? null : browserFiles.consume(owner, input.demoId);
      jobs.set(job.id, job);
      void (async () => {
        try {
          let demo = browserDemo;
          if (code) {
            const entry = { id: randomUUID(), code, status: "downloading", log: "", demo: "" };
            downloads.set(entry.id, entry);
            demo = await fetchDemo({ code, directory: path.join(dataDir, "Downloads", entry.id), exe, entry });
            entry.demo = demo;
            entry.status = "done";
          }
          job.status = "camera";
          job.engine = "tecmon";
          job.marks = await cameraSession({
            demo,
            tick: input.tick,
            installation,
            cs2Exe: detected.cs2,
            cacheDir: engineCache,
            log: (message) => {
              job.log += `\n${message}`;
            },
            system: engineSystem.recorder,
          });
          job.status = "done";
        } catch (error) {
          job.status = "error";
          job.log += `\n${error.message}`;
        } finally {
          active = false;
        }
      })();
      return json(res, 202, { id: job.id });
    } catch (error) {
      active = false;
      throw error;
    }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const origin = `http://127.0.0.1:${server.address()?.port}`;
    if (req.headers.host !== `127.0.0.1:${server.address()?.port}`)
      return json(res, 403, { error: "Nur im lokalen Companion verfügbar." });
    const url = new URL(req.url, origin);
    try {
      if (url.pathname.startsWith("/bridge/")) return await bridgeRequest(req, res, url);
      if (url.pathname === "/gsi") return await gsiRequest(req, res);
      if (req.headers.origin && req.headers.origin !== origin)
        return json(res, 403, { error: "Nur im lokalen Companion verfügbar." });
      if (req.method === "GET" && url.pathname === "/api/health")
        return json(res, 200, {
          app: "tecmon-companion",
          version: VERSION,
          instanceId: installation?.installationId || null,
        });
      const assets = {
        "/": ["index.html", "text/html; charset=utf-8"],
        "/app.js": ["app.js", "text/javascript; charset=utf-8"],
        "/style.css": ["style.css", "text/css; charset=utf-8"],
        "/logo.webp": ["logo.webp", "image/webp"],
        "/favicon.ico": ["favicon.ico", "image/x-icon"],
          "/desktop-avatar.png": ["desktop-avatar.png", "image/png"],
      };
      if (req.method === "GET" && assets[url.pathname]) {
        const [file, mime] = assets[url.pathname];
        let body = await readFile(path.join(root, "public", file));
        if (file === "index.html") body = body.toString().replace("__TOKEN__", token);
        res.writeHead(200, { "Content-Type": mime });
        return res.end(body);
      }
      if (req.headers["x-tecmon-token"] !== token)
        return json(res, 401, { error: "Companion neu öffnen." });
      if (req.method === "GET" && url.pathname === "/api/state")
        return json(res, 200, {
          detected,
          postgres,
          managed: !!installation,
          engine: { internal: ownEngine, available: !!installation },
          active,
          bridge: bridge.state(),
          gsi: gsiState(),
          downloads: [...downloads.values()],
          dataDir,
          jobs: [...jobs.values()].map(({ output: _output, ...j }) => j),
        });
      if (req.method === "GET" && url.pathname === "/api/videos")
        return json(res, 200, { videos: await recentVideos(), folder: dataDir });
      if (req.method === "GET" && url.pathname === "/api/video")
        return await video(
          res,
          jobs.get(url.searchParams.get("job")),
          url.searchParams.get("file"),
        );
      if (req.method !== "POST" || req.headers["content-type"] !== "application/json")
        return json(res, 404, { error: "Nicht gefunden." });
      let body = "";
      for await (const b of req) {
        body += b;
        if (body.length > 65536) throw new Error("Auftrag zu groß.");
      }
      const input = JSON.parse(body);
      if (url.pathname === "/api/videos/open") {
        openPath(await videoPath(input.key), false);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/api/videos/folder") {
        if (input.key) openPath(await videoPath(input.key), true);
        else {
          await mkdir(dataDir, { recursive: true });
          openPath(await realpath(dataDir), false);
        }
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/api/gsi/enable") {
        if (input.confirm !== true) throw new Error("Rundentipps bitte ausdrücklich einschalten.");
        if (!gsiConfigPath(detected.cs2)) throw new Error("CS2 wurde auf diesem PC nicht gefunden.");
        await installGsiConfig(detected.cs2, gsi.token);
        await gsi.setEnabled(true);
        gsiError = "";
        return json(res, 200, {
          message: "Rundentipps eingeschaltet. Falls CS2 gerade läuft, das Spiel einmal neu starten.",
          gsi: gsiState(),
        });
      }
      if (url.pathname === "/api/gsi/features") {
        const known = new Set(FEATURES.map((f) => f.id));
        const update = Object.fromEntries(
          Object.entries(input.features || {}).filter(([id, on]) => known.has(id) && typeof on === "boolean"),
        );
        await gsi.setFeatures(update);
        return json(res, 200, { gsi: gsiState() });
      }
      if (url.pathname === "/api/gsi/insights/clear") {
        await insights.clear();
        return json(res, 200, { message: "Übertragene Match-Auswertung gelöscht.", gsi: gsiState() });
      }
      if (url.pathname === "/api/gsi/disable") {
        await gsi.setEnabled(false);
        await syncGsiConfig();
        return json(res, 200, { message: "Rundentipps ausgeschaltet.", gsi: gsiState() });
      }
      if (url.pathname === "/api/bridge/approve") {
        await bridge.approve(input.id);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/api/bridge/revoke") {
        await bridge.revoke(input.id);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/api/update/check") return json(res, 200, await checkUpdate());
      if (url.pathname === "/api/update/install") {
        if (!installation) throw new Error("Updates benötigen eine installierte Windows-Version.");
        if (active || input.confirm !== true)
          throw new Error("Zuerst Aufnahme/Download beenden und Update bestätigen.");
        active = true;
        try {
          const update = await checkUpdate(VERSION);
          if (!update.available) {
            active = false;
            return json(res, 200, { message: "Companion ist aktuell." });
          }
          const executable = await downloadUpdate(root, update);
          await stopDatabase(installation);
          const child = spawn(executable, ["--apply-update", root, String(process.pid)], {
            stdio: "ignore",
            windowsHide: true,
          });
          await new Promise((resolve, reject) => {
            child.once("spawn", resolve);
            child.once("error", reject);
          });
          child.unref();
          updateHandoff(server,res,onUpdateExit);
          return json(res, 200, {
            message: "Update geprüft. Companion startet nach der Aktualisierung neu.",
            latest:update.latest,
          });
        } catch (error) {
          active = false;
          throw error;
        }
      }
      if (url.pathname === "/api/demos/download") {
        if (active) throw new Error("Zuerst die laufende Aufnahme oder den Download beenden.");
        if (input.confirm !== true)
          throw new Error("Lokalen Demo-Download bitte ausdrücklich bestätigen.");
        const codes = matchDownloadRequest(input);
        if (downloads.size + codes.length > 100)
          throw new Error("Downloadliste voll. Companion neu starten.");
        const exe = typeof input.csdm === "string" ? input.csdm : "";
        // Reserve before awaits, just like recording: never run multiple CSDM CLI sessions.
        active = true;
        try {
          if (
            !ownDownload() &&
            (!path.isAbsolute(exe) ||
              !["csdm.exe", "cs-demo-manager.exe"].includes(path.basename(exe).toLowerCase()) ||
              !(await stat(exe)).isFile())
          )
            throw new Error("Bitte CS Demo Manager auswählen.");
          const entries = codes.map((code) => ({
            id: randomUUID(),
            code,
            status: "queued",
            log: "",
            demo: "",
          }));
          for (const entry of entries) downloads.set(entry.id, entry);
          void (async () => {
            try {
              for (const entry of entries) {
                entry.status = "downloading";
                try {
                  entry.demo = await fetchDemo({
                    code: entry.code,
                    directory: path.join(dataDir, "Downloads", entry.id),
                    exe: ownDownload() && !(await stat(exe).then((s) => s.isFile(), () => false)) ? "" : exe,
                    entry,
                  });
                  entry.status = "done";
                } catch (error) {
                  entry.status = "error";
                  entry.log += `\n${error.message}`;
                }
              }
            } finally {
              active = false;
            }
          })();
          return json(res, 202, { ids: entries.map((entry) => entry.id) });
        } catch (error) {
          active = false;
          throw error;
        }
      }
      if (url.pathname === "/api/pick") {
        const kinds = {
          demo: "--pick-demo",
          engine: "--pick-engine",
          game: "--pick-game",
          folder: "--pick-folder",
        };
        const argument = kinds[input.kind];
        if (!argument || typeof argument !== "string") throw new Error("Ungültige Dateiauswahl.");
        if (pickingFile) throw new Error("Eine Dateiauswahl ist bereits geöffnet.");
        pickingFile = true;
        try {
          return json(
            res,
            200,
            JSON.parse(
              await runTool(path.join(root, "TecMon Companion.exe"), [argument], {
                timeout: 600000,
              }),
            ),
          );
        } finally {
          pickingFile = false;
        }
      }
      if (url.pathname === "/api/csdm/open") {
        if (!installation)
          throw new Error("Diese Funktion benötigt die installierte Windows-Version.");
        if(active)throw new Error("Zuerst den laufenden Download oder die Aufnahme beenden.");
        await prepareEngine();
        const child = spawn(installation.csdmExe, [], {
          env: managedEnvironment(installation),
          windowsHide: false,
          stdio: "ignore",
        });
        child.on("error", () => {});
        child.unref();
        return json(res, 200, {
          message: "CS Demo Manager mit der eingerichteten TecMon-Datenbank geöffnet.",
        });
      }
      if (url.pathname === "/api/database/check") {
        if (checkingDatabase) throw new Error("Datenbankprüfung läuft bereits.");
        checkingDatabase = true;
        try {
          if(installation)await prepareEngine();
          postgres = await checkPostgres({
            port: input.port ?? 5432,
            ...(installation ? { roots: [], searchPath: installation.postgresBin } : {}),
          });
        } finally {
          checkingDatabase = false;
        }
        return json(res, 200, postgres);
      }
      if (url.pathname === "/api/database/install") {
        if (active) throw new Error("Zuerst die Aufnahme beenden.");
        if (input.confirm !== true)
          throw new Error("Installationsfenster bitte ausdrücklich anfordern.");
        if (Date.now() - lastInstallerLaunch < 15000)
          throw new Error("Installationsfenster wurde bereits geöffnet.");
        postgres = await checkPostgres({ port: postgres.port });
        if (postgres.supported)
          return json(res, 200, {
            message:
              "Kompatibles PostgreSQL bereits vorhanden. Keine Neuinstallation nötig; Verbindung in CS Demo Manager einrichten.",
          });
        if (process.platform !== "win32")
          throw new Error("Installation ist nur für Windows verfügbar.");
        lastInstallerLaunch = Date.now();
        const script = path.join(root, "Install-PostgreSQL.cmd").replaceAll("'", "''");
        await promisify(execFile)(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            `Start-Process -FilePath '${script}' -WindowStyle Normal -ErrorAction Stop`,
          ],
          { windowsHide: true, timeout: 10000, maxBuffer: 2048 },
        );
        return json(res, 202, {
          message:
            "Installationsfenster geöffnet. Danach erneut prüfen und das Datenbankpasswort direkt in CS Demo Manager eintragen.",
        });
      }
      if (url.pathname === "/api/engine") {
        if (active) throw new Error("Zuerst die laufende Aufnahme oder den Download beenden.");
        if (typeof input.internal !== "boolean") throw new Error("Ungültige Einstellung.");
        ownEngine = input.internal;
        await writeFile(engineFile, JSON.stringify({ internal: ownEngine }));
        return json(res, 200, { internal: ownEngine });
      }
      if (url.pathname === "/api/import") {
        if (jobs.size >= 100) throw new Error("Auftragsliste voll. Companion neu starten.");
        const job = {
          id: randomUUID(),
          job: validateJob(input),
          status: "ready",
          log: "",
          files: [],
        };
        jobs.set(job.id, job);
        return json(res, 201, { id: job.id });
      }
      if (url.pathname === "/api/start") {
        if (active) throw new Error("Es läuft bereits eine Aufnahme.");
        const job = jobs.get(input.id);
        if (!job || job.status !== "ready") throw new Error("Auftrag ist nicht bereit.");
        if (input.confirm !== true) throw new Error("Demo-Aufnahme bitte ausdrücklich bestätigen.");
        // Reserve before filesystem awaits, so two clicks cannot launch concurrent games.
        active = true;
        try {
          void record(job, input)
            .catch((error) => {
              job.status = "error";
              job.log += `\n${error.message}`;
            })
            .finally(() => {
              active = false;
            });
          return json(res, 202, { id: job.id });
        } catch (error) {
          active = false;
          throw error;
        }
      }
      if (url.pathname === "/api/shutdown") {
        if (active) throw new Error("Zuerst die laufende Aufnahme in CS Demo Manager beenden.");
        if (installation) await stopDatabase(installation);
        json(res, 200, { ok: true });
        server.close();
        return;
      }
      json(res, 404, { error: "Nicht gefunden." });
    } catch (err) {
      json(res, 400, { error: err.message || "Aktion fehlgeschlagen." });
    }
  });
  server.requestTimeout = 15000;
  return { server, token };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const installation = await readInstallation(root);
  const { server } = await createCompanion({ installation,onUpdateExit:()=>process.exit(0) });
  server.listen(31977, "127.0.0.1", () => {
    const url = "http://127.0.0.1:31977";
    console.log(`TecMon Companion: ${url}`);
    if (process.argv.includes("--open") && process.platform === "win32")
      spawn("explorer.exe", [url], { windowsHide: true, stdio: "ignore" }).unref();
  });
  server.on("error", (err) => {
    console.error(
      err.code === "EADDRINUSE" ? "Companion läuft bereits: http://127.0.0.1:31977" : err.message,
    );
    process.exitCode = 1;
  });
}
