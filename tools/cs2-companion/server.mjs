import http from "node:http";
import { readFile, writeFile, mkdir, readdir, stat, open, realpath } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { validateJob, recordingConfig } from "./job.mjs";
import { matchDownloadRequest } from "./share-code.mjs";
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

export async function createCompanion({
  dataDir = path.join(local, "TecMon", "Companion"),
  runProcess,
  installation = null,
} = {}) {
  if (installation) dataDir = path.join(installation.dataDir, "Jobs");
  await mkdir(dataDir, { recursive: true });
  const token = randomBytes(32).toString("hex");
  const jobs = new Map();
  const downloads = new Map();
  let active = false;
  const detected = await detect();
  if (installation) {
    detected.csdm = installation.csdmExe;
    detected.cs2 = installation.cs2Exe || detected.cs2;
  }
  let postgres = await checkPostgres();
  if (installation)
    postgres = await checkPostgres({
      roots: [],
      searchPath: installation.postgresBin,
      port: installation.port,
    });
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
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const origin = `http://127.0.0.1:${server.address()?.port}`;
    if (
      req.headers.host !== `127.0.0.1:${server.address()?.port}` ||
      (req.headers.origin && req.headers.origin !== origin)
    )
      return json(res, 403, { error: "Nur im lokalen Companion verfügbar." });
    const url = new URL(req.url, origin);
    try {
      if (req.method === "GET" && url.pathname === "/api/health")
        return json(res, 200, {
          app: "tecmon-companion",
          version: "0.4.0",
          instanceId: installation?.installationId || null,
        });
      const assets = {
        "/": ["index.html", "text/html; charset=utf-8"],
        "/app.js": ["app.js", "text/javascript; charset=utf-8"],
        "/style.css": ["style.css", "text/css; charset=utf-8"],
        "/logo.webp": ["logo.webp", "image/webp"],
        "/favicon.ico": ["favicon.ico", "image/x-icon"],
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
          active,
          downloads: [...downloads.values()],
          dataDir,
          jobs: [...jobs.values()].map(({ output: _output, ...j }) => j),
        });
      if (req.method === "GET" && url.pathname === "/api/video") {
        const job = jobs.get(url.searchParams.get("job"));
        const file = job?.files?.[Number(url.searchParams.get("file"))];
        if (!file || job.status !== "done")
          return json(res, 404, { error: "Video nicht vorhanden." });
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
      if (req.method !== "POST" || req.headers["content-type"] !== "application/json")
        return json(res, 404, { error: "Nicht gefunden." });
      let body = "";
      for await (const b of req) {
        body += b;
        if (body.length > 65536) throw new Error("Auftrag zu groß.");
      }
      const input = JSON.parse(body);
      if (url.pathname === "/api/update/check") return json(res, 200, await checkUpdate());
      if (url.pathname === "/api/update/install") {
        if(!installation) throw new Error("Updates benötigen eine installierte Windows-Version.");
        if(active || input.confirm !== true) throw new Error("Zuerst Aufnahme/Download beenden und Update bestätigen.");
        active=true;
        try {
          const update=await checkUpdate(VERSION);
          if(!update.available) {active=false;return json(res,200,{message:"Companion ist aktuell."});}
          const executable=await downloadUpdate(root,update);
          await stopManagedDatabase(installation);
          const child=spawn(executable,["--apply-update",root,String(process.pid)],{stdio:"ignore",windowsHide:true});
          await new Promise((resolve,reject)=>{child.once("spawn",resolve);child.once("error",reject);});
          child.unref();
          res.once("finish",()=>{server.close();server.closeIdleConnections();});
          return json(res,200,{message:"Update geprüft. Companion startet nach der Aktualisierung neu."});
        } catch(error) {active=false;throw error;}
      }
      if (url.pathname === "/api/demos/download") {
        if (active) throw new Error("Zuerst die laufende Aufnahme oder den Download beenden.");
        if (input.confirm !== true) throw new Error("Lokalen Demo-Download bitte ausdrücklich bestätigen.");
        const codes = matchDownloadRequest(input);
        if (downloads.size + codes.length > 100) throw new Error("Downloadliste voll. Companion neu starten.");
        const exe = typeof input.csdm === "string" ? input.csdm : "";
        // Reserve before awaits, just like recording: never run multiple CSDM CLI sessions.
        active = true;
        try {
          if (!path.isAbsolute(exe) || !["csdm.exe", "cs-demo-manager.exe"].includes(path.basename(exe).toLowerCase()) || !(await stat(exe)).isFile())
            throw new Error("Bitte CS Demo Manager auswählen.");
          const entries = codes.map((code) => ({ id: randomUUID(), code, status: "queued", log: "", demo: "" }));
          for (const entry of entries) downloads.set(entry.id, entry);
          void (async () => {
            try {
              for (const entry of entries) {
                entry.status = "downloading";
                try {
                  entry.demo = await downloadDemo({ code: entry.code,
                    directory: path.join(dataDir, "Downloads", entry.id), exe, run, entry });
                  entry.status = "done";
                } catch (error) { entry.status = "error"; entry.log += `\n${error.message}`; }
              }
            } finally { active = false; }
          })();
          return json(res, 202, { ids: entries.map((entry) => entry.id) });
        } catch (error) { active = false; throw error; }
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
          const exe = typeof input.csdm === "string" ? input.csdm : "";
          const demo = typeof input.demo === "string" ? input.demo : "";
          if (
            !path.isAbsolute(exe) ||
            !["csdm.exe", "cs-demo-manager.exe"].includes(path.basename(exe).toLowerCase()) ||
            !(await stat(exe)).isFile()
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
          const output = path.join(dataDir, job.id);
          await mkdir(output, { recursive: true });
          const config = path.join(output, "recording.json");
          const recording = recordingConfig(job.job, demo, output, input.quality);
          if (installation)
            recording.ffmpegSettings = {
              ...recording.ffmpegSettings,
              customLocationEnabled: true,
              customExecutableLocation: installation.ffmpegExe,
            };
          await writeFile(config, JSON.stringify(recording, null, 2));
          await writeFile(path.join(output, "tecmon-job.json"), JSON.stringify(job.job, null, 2));
          job.status = "analyzing";
          job.output = output;
          void (async () => {
            try {
              await run(exe, ["analyze", demo], job);
              job.status = "recording";
              await run(exe, ["video", "--config-file", config], job);
              job.files = await mp4s(output);
              if (!job.files.length)
                throw new Error(
                  "CS Demo Manager hat keine MP4 erzeugt. Prüfe Video-Einstellungen und Protokoll.",
                );
              job.status = "done";
            } catch (err) {
              job.status = "error";
              job.log += `\n${err.message}`;
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
      if (url.pathname === "/api/shutdown") {
        if (active) throw new Error("Zuerst die laufende Aufnahme in CS Demo Manager beenden.");
        if (installation) await stopManagedDatabase(installation);
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
  if (installation) await ensureManagedDatabase(installation);
  const { server } = await createCompanion({ installation });
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
