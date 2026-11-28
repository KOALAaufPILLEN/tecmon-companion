import { CROSSHAIR_GAMES } from "./game-crosshairs.mjs";
import http from "node:http";
import { readFile, writeFile, mkdir, readdir, stat, open, realpath, rm } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { validateJob, recordingConfig, jobCameras } from "./job.mjs";
import { matchDownloadRequest, shareCode } from "./share-code.mjs";
import { recordingFailure, crashSince } from "./recording-engine.mjs";
import { recordInternal, internalProblem, cameraSession, jobSlots, SLOTS_MISSING, ENGINE_CAPABILITY } from "./internal-recorder.mjs";
import { downloadValveDemo, decodeShareCode, downloadLatestDemo, listRecentMatches, isProcessRunning } from "./valve-download.mjs";
import { createStatsBacklog, BACKLOG_CAPABILITY } from "./stats-backlog.mjs";
import { createAutoHighlights, AUTO_CAPABILITY } from "./auto-highlights.mjs";
import { ANGLE_CAPABILITY, SCRIPT_CAPABILITY, SESSION_CAPABILITY } from "./camera-script.mjs";
import { updateHandoff } from "./update-handoff.mjs";
import { loadBrandingPack, loadMotionPack } from "./branding-assets.mjs";
import { FILTER_V2_CAPABILITY } from "./video-filters.mjs";
import { renderBranding } from "./video-branding.mjs";
import { createBrowserBridge } from "./browser-bridge.mjs";
import { browserDemos } from "./browser-demo.mjs";
import { createGameTips, FEATURES } from "./game-tips.mjs";
import { createDotaTips, DOTA_FEATURES } from "./dota-tips.mjs";
import { cleanDotaPayload, dotaGsiConfigPath, installDotaGsiConfig, removeDotaGsiConfig } from "./dota-gsi.mjs";
import { createInsightsStore } from "./insights.mjs";
import { createGamePackages } from "./games.mjs";
import { createClips, CLIP_CAPABILITY } from "./clips.mjs";
import { createChatTranslator } from "./chat-translate.mjs";
import { createScoreboard, SCOREBOARD_CAPABILITY, summary as scoreboardSummary } from "./scoreboard.mjs";
import { workState } from "./work-status.mjs";
import { createSkinSwap, hasSkins, SKIN_CAPABILITY, SKIN_KNIFE_CAPABILITY, SKIN_SETUP_CAPABILITY, SKIN_SIDE_CAPABILITY, SKIN_LEGACY_CAPABILITY, SKIN_STICKER_CAPABILITY } from "./skin-swap.mjs";
import { AGENT_CAPABILITY, CHICKEN_BREED_CAPABILITY, CHICKEN_CAPABILITY, createAgentSwap, hasAgents } from "./agent-swap.mjs";
import { renderClipBranding, clipLabels } from "./clip-branding.mjs";
import { createGsiSettings, installGsiConfig, removeGsiConfig, gsiConfigPath } from "./gsi-config.mjs";
import { createPet, quizQuestion } from "./personality.mjs";
import { createCfgLibrary } from "./cfg-library.mjs";
import { cleanOverlayOptions, DEFAULT_OVERLAY, createCrosshairSettings, crosshairCommands, crosshairConfigPath, decodeCrosshairCode, createOverlaySettings, cs2WindowMode, OVERLAY_NOTICE, OVERLAY_NOTICE_VERSION, CROSSHAIR_EXEC, PRESETS as CROSSHAIR_PRESETS, STYLES as CROSSHAIR_STYLES } from "./crosshair.mjs";
import { checkUpdate, downloadUpdate, VERSION } from "./updater.mjs";
import { verifyCs2 } from "./cs2-verify.mjs";
import { createDemoFetch, DEMO_FETCH_CAPABILITY } from "./demo-fetch.mjs";
import { readInstallation, runTool } from "./managed-installation.mjs";
import { updateHlae, ensureVideoTools, installedHlaeVersion } from "./download-tools.mjs";
import { createExternalUpdates, installExternalTool, recoverExternalTools, ffmpegVersion } from "./external-updates.mjs";
import { copyRadars, radarFile } from "./radars.mjs";
import { createDesktopSettings } from "./desktop-settings.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
export async function detect() {
  const programs = [
    path.join(local, "Programs"),
    path.join(os.homedir(), "AppData", "Programs"),
    process.env.ProgramFiles || "C:\\Program Files",
  ];
  // Nur für Radarbilder: ein schon installierter CS Demo Manager (wird nie gestartet).
  const radarSource =
    programs.map((p) => path.join(p, "CS Demo Manager")).find((p) => existsSync(path.join(p, "resources"))) || "";
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
  const dota2 =
    steam
      .map((p) => path.join(p, "steamapps", "common", "dota 2 beta", "game", "bin", "win64", "dota2.exe"))
      .find(existsSync) || "";
  return { cs2, dota2, radarSource };
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

/**
 * Aufruf des Updaters. `detached` ist Pflicht: Node (libuv) legt Kindprozesse
 * unter Windows sonst in ein Job-Objekt, das sie beendet, sobald dieser Dienst
 * endet. Der Updater wartet aber gerade darauf, dass der Dienst endet, und
 * wurde so mitten im Warten beendet: Companion zu, nichts aktualisiert.
 */
export const updaterCommand = (target, pid) => [
  ["--apply-update", target, String(pid)],
  { stdio: "ignore", windowsHide: true, detached: true },
];
export async function createCompanion({
  dataDir = path.join(local, "TecMon", "Companion"),
  installation = null,
  detectTools = detect,
  /** Prüft, ob die cs2.exe echt ist (Links, Steam-Ordner, Valve-Signatur); siehe cs2-verify.mjs. */
  verifyGame = verifyCs2,
  loadAssets = loadBrandingPack,
  loadMotion = loadMotionPack,
  openPath = openInExplorer,
  onUpdateExit,
  now,
  engineSystem = {},
  /** Automatische Updates: Wartezeit bis zur ersten Prüfung und Abstand danach (ms); 0 = aus (Tests). */
  autoUpdate = { first: 0, every: 0 },
  externalUpdate = { first: 0, every: 0 },
  findUpdate = checkUpdate,
  fetchUpdate = downloadUpdate,
  launchUpdate = (file) => spawn(file, ...updaterCommand(root, process.pid)),
  /** Valve-Demo per Sharecode laden (eigene Engine); in Tests ersetzbar. */
  downloadDemo = downloadValveDemo,
  /** Demo-Download für die Webseite (demo-fetch-v1); in Tests ersetzbar. */
  fetchDemo = globalThis.fetch,
} = {}) {
  if (installation) dataDir = path.join(installation.dataDir, "Jobs");
  await mkdir(dataDir, { recursive: true });
  const token = randomBytes(32).toString("hex");
  const jobs = new Map();
  const downloads = new Map();
  const browserFiles=browserDemos(path.join(dataDir,"Browser-Demos"));
  let active = false;
  let externalBusy = false;
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
  if (installation) detected.cs2 = installation.cs2Exe || detected.cs2;
  /*
   * Radarbilder für die Rundentipps: einmalig aus einem vorhandenen CS-Demo-Manager-Ordner
   * (ältere Companion-Installation oder eigenes Programm) in den eigenen Ordner kopieren.
   * Nie herunterladen oder mitliefern; fehlt das Bild, kommt nur Text.
   */
  const radarDir = path.join(installation?.profileDir || dataDir, "radars");
  const { radarSource = "" } = detected;
  delete detected.radarSource;
  await copyRadars(radarDir, [installation?.csdmExe ? path.dirname(installation.csdmExe) : "", radarSource]).catch(() => {});
  // Nur eine echte cs2.exe von Valve benutzen; umbenannte Programme oder Links darauf nie starten.
  let cs2Check = { ok: true, reason: "" };
  if (detected.cs2) {
    const check = await verifyGame(detected.cs2);
    cs2Check = { ok: check.ok, reason: check.reason };
    detected.cs2 = check.ok ? check.path : "";
  }
  // CS2 Game State Integration: offizielle, rein lesende Schnittstelle für Rundentipps.
  const games = await createGamePackages(installation?.profileDir || dataDir);
  // Nutzerentscheid 23.11.2026: in CS2 ist alles standardmäßig an (Rundentipps, Auto-Highlights, Chat-Übersetzer,
  // Stats-Frage), einzige Ausnahme das Fadenkreuz-Overlay. Ohne CS2-Paket bleibt alles aus.
  const cs2Defaults = games.has("cs2");
  const gsi = await createGsiSettings(installation?.profileDir || dataDir, { defaultEnabled: cs2Defaults });
  // Clip-Puffer: Bildschirmaufnahme der letzten Sekunden, gehört zum Companion (kein Spiel-Paket).
  const clips = await createClips({
    dir: installation ? installation.dataDir : dataDir,
    settingsDir: installation?.profileDir || dataDir,
    ffmpeg: installation?.ffmpegExe || "",
    ...(engineSystem.clipSpawn ? { spawnProcess: engineSystem.clipSpawn, settleMs: 5 } : {}),
  });
  // Wardogs: Scoreboard-Foto auf Hotkey, lokale Windows-Texterkennung, nur eigene Werte.
  const scoreboard = await createScoreboard({
    dir: path.join(installation?.profileDir || dataDir, "wardogs"),
    ffmpeg: installation?.ffmpegExe || "",
    ...(engineSystem.scoreboard || {}),
  });
  let clipBranding = false;
  function brandClip(id, game, title) {
    if (externalBusy) throw new Error("Externe Komponenten werden aktualisiert. Kurz warten.");
    if (!installation) throw new Error("Das Clip-Branding braucht den installierten Windows-Companion.");
    if (clipBranding) throw new Error("Ein Clip wird gerade bearbeitet. Kurz warten.");
    const source = clips.clipPath(id);
    if (!existsSync(source)) throw new Error("Clip nicht gefunden.");
    const labels = clipLabels({ game, title });
    clips.setMeta(id, { status: "branding", error: "", title: labels.title, game: labels.game });
    clipBranding = true;
    (async () => {
      try {
        const assets = await loadAssets(path.join(installation.profileDir, "Branding"));
        await (engineSystem.renderClip || renderClipBranding)({
          source,
          directory: clips.dir,
          id,
          game: labels.game,
          title: labels.title,
          assets,
          ffmpeg: installation.ffmpegExe,
          launcher: path.join(root, "TecMon Companion.exe"),
        });
        clips.setMeta(id, { status: "ready" });
      } catch (error) {
        clips.setMeta(id, { status: "error", error: error.message || "Branding fehlgeschlagen." });
      } finally {
        clipBranding = false;
      }
    })();
  }
  async function sendClip(res, id) {
    const file = clips.clipPath(id, true);
    const info = await stat(file).catch(() => null);
    if (!info?.isFile() || (await clips.list()).find((c) => c.id === id)?.status === "branding")
      return json(res, 404, { error: "Fertiger Clip mit TecMon-Branding fehlt." });
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": info.size,
      "Content-Disposition": `attachment; filename="${path.basename(file)}"`,
    });
    return createReadStream(file).on("error", () => res.destroy()).pipe(res);
  }
  const crosshair = await createCrosshairSettings(installation?.profileDir || dataDir);
  const overlay = await createOverlaySettings(installation?.profileDir || dataDir);
  const desktop = await createDesktopSettings(installation?.profileDir || dataDir);
  const cfgs = await createCfgLibrary(installation?.profileDir || dataDir);
  const crosshairState = () => ({ crosshair: crosshair.get(), commands: crosshairCommands(crosshair.get()), exec: CROSSHAIR_EXEC, available: Boolean(crosshairConfigPath(detected.cs2)), overlayDefaults: DEFAULT_OVERLAY, gamePresets: CROSSHAIR_GAMES, presets: CROSSHAIR_PRESETS, styles: CROSSHAIR_STYLES, overlay: { ...overlay.get(), runtime: overlayRuntimeState(), notice: OVERLAY_NOTICE, noticeVersion: OVERLAY_NOTICE_VERSION } });
  /* CS2-Anzeigemodus aus cs2_video.txt, höchstens alle 10 Sekunden gelesen und nur bei eingeschaltetem Overlay. */
  let windowMode = "unknown", windowModeAt = 0;
  let overlayRuntime = { connected: false, paused: false, hotkey: null };
  let overlayRuntimeAt = 0;
  let desktopRuntime = { registered: null, key: "none", modifier: "none" }, desktopRuntimeAt = 0;
  const overlayRuntimeState = () => ({ ...overlayRuntime, connected: overlayRuntime.connected && Date.now() - overlayRuntimeAt < 15_000 });
  const refreshWindowMode = (force = false) => {
    if ((!force && !overlay.get().enabled) || Date.now() - windowModeAt < 10000) return;
    windowModeAt = Date.now();
    cs2WindowMode().then((mode) => { windowMode = mode; }, () => {});
  };
  /** Globales Overlay ohne Spiel-Paket; native Figur bestimmt Fenster/Bildschirm. */
  const overlayState = () => {
    const o = overlay.get();
    const on = o.enabled && o.accepted;
    return { ...o, enabled: on, wanted: on, runtime: overlayRuntimeState(), crosshair: crosshair.get() };
  };
  /** Für die Figur: Chat-Overlay wie das Fadenkreuz nur mit CS2-Paket, bestätigt und nicht im echten Vollbild. */
  // Knopf „Overlay verschieben“: die Figur startet das Verschieben, sobald der Zähler steigt.
  let chatMoveRequest = 0;
  const chatOverlayState = () => {
    const c = chatTranslator.state();
    if (!games.has("cs2") || !c.enabled || !c.overlay) return { enabled: false };
    const header = chatTranslator.overlayHeader();
    // Chat-Fenster: frei verschiebbar auf jedem Bildschirm, die Figur zeigt es nur, solange CS2 läuft; längerer Verlauf.
    // Aussehen (Breite, Zeilen, Schrift, Farbe, Hintergrund, Anzeigedauer) gilt für Overlay und Chat-Fenster; nur geprüfte Zahlen und feste Farben.
    const look = { width: c.look.width, font: c.look.font, color: c.colors[c.look.color], background: c.look.background };
    if (c.window) return { enabled: true, window: true, look, lines: chatTranslator.overlayLines(), header: header.text, warn: header.warn, move: chatMoveRequest };
    refreshWindowMode(true);
    return { enabled: windowMode === "borderless" || windowMode === "unknown", mode: windowMode, look, lines: chatTranslator.overlayLines(), header: header.text, warn: header.warn, move: chatMoveRequest };
  };
  /** Für die Figur: übersetzte Chatzeilen in der Sprechblase, unabhängig vom Overlay und vom Fenstermodus. */
  const chatBubbleState = () => {
    const c = chatTranslator.state();
    if (!games.has("cs2") || !c.enabled || !c.bubble) return { enabled: false };
    return { enabled: true, lines: chatTranslator.bubbleLines() };
  };
  const radarPath = (map) => radarFile(radarDir, map);
  const insights = await createInsightsStore(installation?.profileDir || dataDir);
  const pet = await createPet(installation?.profileDir || dataDir, now ? { now } : {});
  const tips = createGameTips({
    ...(now ? { now } : {}),
    flavor: (category, text) => pet.flavor(category, text),
    radarPath,
    enabled: (id) => gsi.feature(id),
    insights: (steamId) => insights.get(steamId),
  });
  // Dota 2: eigene GSI-Einstellungen (eigenes Token) im Unterordner, gleiche Regeln wie CS2.
  const dotaDir = path.join(installation?.profileDir || dataDir, "dota2");
  const dotaGsi = await createGsiSettings(dotaDir);
  const dotaTips = createDotaTips({
    ...(now ? { now } : {}),
    flavor: (category, text) => pet.flavor(category, text),
    enabled: (id) => dotaGsi.feature(id),
  });
  let dotaError = "";
  async function syncDotaConfig() {
    dotaError = "";
    try {
      if (dotaGsi.enabled && games.has("dota2")) await installDotaGsiConfig(detected.dota2, dotaGsi.token);
      else await removeDotaGsiConfig(detected.dota2);
    } catch (error) {
      dotaError = error.message;
    }
  }
  if (dotaGsi.enabled) await syncDotaConfig();
  function dotaState() {
    return {
      enabled: dotaGsi.enabled,
      available: !!dotaGsiConfigPath(detected.dota2),
      error: dotaError,
      features: DOTA_FEATURES.map(({ id, label }) => ({ id, label, enabled: dotaGsi.feature(id) })),
      ...dotaTips.state(),
    };
  }
  /* Highlight-Video nach dem Match: standardmäßig an (seit 23.11.2026), fragt erst nach Matchende und geschlossenem CS2. */
  const demoFetch = createDemoFetch({ fetch: fetchDemo });
  const auto = await createAutoHighlights({
    dir: installation?.profileDir || dataDir,
    ...(now ? { now } : {}),
    isRunning: engineSystem.auto?.isRunning || (process.platform === "win32" ? isProcessRunning : async () => false),
    busy: () => active,
    defaultEnabled: cs2Defaults,
    fetchLatest: (options) => {
      if (!ownDownload()) throw new Error("Das automatische Video braucht den installierten Windows-Companion.");
      return (engineSystem.auto?.fetchLatest || downloadLatestDemo)({ ...options, cacheDir: engineCache, system: engineSystem.download });
    },
    openPage: (id) => {
      // Zuletzt verbundene TecMon-Seite öffnen; sie holt die Demo über die Bridge.
      const device = bridge.state().devices.at(-1);
      const page = `${device?.origin || "https://tecmon.online"}/games/cs2/replay?companion-auto=${id}#replay-load`;
      if (engineSystem.auto?.openPage) return engineSystem.auto.openPage(page);
      if (process.platform === "win32") spawn("explorer.exe", [page], { windowsHide: true, stdio: "ignore" }).unref();
    },
  });
  /* Noch nicht ausgewertete Matches: beim Schließen von CS2 „Stats hochladen?“ fragen (recent-matches-v1). */
  const autoBusy = () => {
    const s = auto.state();
    return Boolean(s.offer || (s.run && !["done", "error"].includes(s.run.status)));
  };
  const statsBacklog = await createStatsBacklog({
    dir: installation?.profileDir || dataDir,
    ...(now ? { now } : {}),
    isRunning: engineSystem.backlog?.isRunning || engineSystem.auto?.isRunning || (process.platform === "win32" ? isProcessRunning : async () => false),
    busy: () => active,
    blocked: autoBusy,
    listMatches: () => {
      if (!ownDownload()) throw new Error("Die Match-Liste braucht den installierten Windows-Companion.");
      return (engineSystem.backlog?.listMatches || listRecentMatches)({
        directory: path.join(dataDir, "Match-Infos"),
        cacheDir: engineCache,
        system: engineSystem.download,
      });
    },
    openPage: () => {
      const device = bridge.state().devices.at(-1);
      const page = `${device?.origin || "https://tecmon.online"}/games/cs2/replay?companion-stats=1#replay-stats`;
      if (engineSystem.backlog?.openPage) return engineSystem.backlog.openPage(page);
      if (process.platform === "win32") spawn("explorer.exe", [page], { windowsHide: true, stdio: "ignore" }).unref();
    },
  });
  const autoTimer = setInterval(() => {
    if (games.has("cs2")) auto.tick().catch(() => {});
    if (games.has("cs2") && installation) statsBacklog.tick().catch(() => {});
  }, engineSystem.auto?.every || 10_000);
  autoTimer.unref?.();
  let gsiError = "";
  async function syncGsiConfig() {
    gsiError = "";
    try {
      // Rundentipps und Auto-Highlights lesen dieselbe GSI-Datei; sie bleibt, solange eins davon an ist.
      if (gsi.enabled || auto.enabled) await installGsiConfig(detected.cs2, gsi.token);
      else await removeGsiConfig(detected.cs2);
    } catch (error) {
      gsiError = error.message;
    }
  }
  // Fehlt CS2 auf dem PC, gibt es nichts anzulegen; das ist kein Fehler der Rundentipps.
  if ((gsi.enabled || auto.enabled) && detected.cs2) await syncGsiConfig();
  function gsiState() {
    const cs = tips.state();
    const dota = dotaGsi.enabled ? dotaTips.state() : null;
    // Die Figur zeigt die Tipps des Spiels, das zuletzt Daten geschickt hat.
    const dotaActive = !!dota?.connected && (!cs.connected || dota.lastSeen > cs.lastSeen);
    return {
      enabled: gsi.enabled,
      available: !!gsiConfigPath(detected.cs2),
      error: gsiError,
      features: FEATURES.map(({ id, label, notice }) => ({ id, label, enabled: gsi.feature(id), ...(notice ? { notice } : {}) })),
      insights: insights.summary(),
      ...cs,
      ...(dotaActive
        ? {
            dotaActive: true,
            quiet: dota.quiet,
            // Eigene Nummern, damit die Figur Dota- und CS2-Tipps nicht verwechselt.
            tip: dota.tip ? { ...dota.tip, id: 1e9 + dota.tip.id } : cs.tip,
          }
        : {}),
    };
  }
  async function readGsiBody(req, res) {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 262144) {
        json(res, 413, { error: "Zu groß." });
        return null;
      }
    }
    try {
      return JSON.parse(body);
    } catch {
      json(res, 400, { error: "Ungültige Daten." });
      return null;
    }
  }
  async function dotaGsiRequest(req, res) {
    // Dota 2 schickt kein Origin; Browser-Anfragen tragen immer eins.
    if (req.method !== "POST" || req.headers.origin) return json(res, 403, { error: "Nur für Dota 2 vorgesehen." });
    const payload = await readGsiBody(req, res);
    if (!payload) return;
    if (!dotaGsi.matches(payload?.auth?.token)) return json(res, 401, { error: "Falsches Token." });
    // Zuschauer-/Replay-Daten (beide Teams) verwirft cleanDotaPayload; während einer Aufnahme nichts annehmen.
    const data = cleanDotaPayload(payload);
    if (dotaGsi.enabled && !active && data) dotaTips.ingest(data);
    return json(res, 200, { ok: true });
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
    if (!active && games.has("cs2")) auto.observe(payload);
    return json(res, 200, { ok: true });
  }
  /* Eigene TecMon-Engine: Download und Aufnahme ohne CS Demo Manager und ohne Datenbank. */
  const engineCache = installation ? path.join(path.dirname(installation.profileDir), "engine") : path.join(dataDir, "engine");
  // CS2-Chat-Übersetzer: liest nur console.log (-condebug), übersetzt lokal (Bergamot), nichts verlässt den PC.
  const chatTranslator = await createChatTranslator({
    dir: installation?.profileDir || dataDir,
    cacheDir: engineCache,
    cs2Exe: detected.cs2,
    busy: () => active,
    defaultEnabled: cs2Defaults,
    ...(engineSystem.chat || {}),
  });
  /** Skin-Tausch für Video-Szenen (skin-swap-v1): freiwilliges Addon, standardmäßig aus. */
  const skinSwap = await createSkinSwap({ dir: installation?.profileDir || dataDir });
  // Bis 0.40 nachgeladener fremder Rewriter: eigener Cache-Ordner, wird nicht mehr gebraucht.
  await rm(path.join(engineCache, "skin-swap"), { recursive: true, force: true }).catch(() => {});
  /** Agenten-Tausch (agent-swap-v1) mit dem mitgelieferten TecMon-Demo-Rewriter. */
  const agentSwap = await createAgentSwap({
    dir: installation?.profileDir || dataDir,
    ...(engineSystem.agentSwap || {}),
  });
  /**
   * HLAE vor jedem CS2-Start mit HLAE auf die Manifest-Version bringen. Alte
   * AfxHookSource2-Versionen brechen nach CS2-Updates mit „Problem in …ViewModel.cpp“
   * ab; die Ersteinrichtung lädt HLAE nur einmal. Einmal je Prozess, nach einem
   * Fehler beim nächsten Mal erneut; ein Fehler hält die Aufnahme nicht auf.
   */
  // Fehler der Prozessabfrage dürfen nie als „Spiel ist geschlossen“ gelten.
  async function externalBlocked() {
    if (videoTools.busy) return "Video-Werkzeuge werden gerade installiert.";
    if (clips.state().recording || clipBranding || scoreboard.state().busy || demoFetch.running)
      return "Clip-Puffer, Verarbeitung oder Download läuft. Nach Abschluss erneut prüfen.";
    for (const name of ["cs2.exe", "hlae.exe", "ffmpeg.exe", "ffprobe.exe"]) {
      const output = await runTool("tasklist.exe", ["/fi", `imagename eq ${name}`, "/fo", "csv", "/nh"], { timeout: 15_000 });
      if (output.toLowerCase().includes(`"${name}"`)) return `${name} läuft. Update wartet auf das Programmende.`;
    }
    return "";
  }
  const external = engineSystem.externalUpdates || (installation?.hlaeExe && installation?.ffmpegExe && process.platform === "win32" && !engineSystem.recorder
    ? await createExternalUpdates({
      directory: installation.profileDir,
      manageMissing: false,
      blocked: externalBlocked,
      prepare: () => recoverExternalTools(root),
      installed: async (name) => name === "hlae"
        ? (existsSync(installation.hlaeExe) && existsSync(path.join(path.dirname(installation.hlaeExe), "x64", "AfxHookSource2.dll")) ? installedHlaeVersion(path.dirname(installation.hlaeExe)) : "")
        : ffmpegVersion(await runTool(installation.ffmpegExe, ["-version"], { timeout: 15_000 }).catch(() => "")),
      install: (name, item, progress) => {
        const expected = path.join(root, "tools", name, name === "hlae" ? "hlae.exe" : path.join("bin", "ffmpeg.exe"));
        const configured = name === "hlae" ? installation.hlaeExe : installation.ffmpegExe;
        if (path.resolve(configured).toLowerCase() !== path.resolve(expected).toLowerCase()) throw new Error("Eigener Tool-Pfad: bitte die verwaltete Installation verwenden.");
        return installExternalTool({ root, name, item, run: runTool, progress, canInstall: async () => !await externalBlocked() });
      },
    }) : null);
  let externalRequested = false;
  async function externalUpdateTick(options = {}) {
    if (!external) return null;
    externalRequested ||= options.force === true;
    if (active || externalBusy) return external.defer("Aufnahme oder Download läuft. Prüfung folgt nach Abschluss.");
    // Vor dem ersten await reservieren: parallele Jobs können keine Tools laden.
    active = externalBusy = true;
    try { const result = await external.run({ ...options, force: externalRequested }); if (!result.message.startsWith("Zurückgestellt:")) externalRequested = false; return result; }
    finally { active = externalBusy = false; }
  }
  let hlaeChecked = null;
  const ensureHlae = async (log) => {
    // Preserve the optional stats-only installation from setup.
    if (!installation || !existsSync(installation.hlaeExe)) return;
    if (external) {
      if (!external.state().auto) return;
      externalBusy = true;
    }
    try {
      if (external) {
        await external.run({ progress: log, force: true });
        // GitHub-API nicht erreichbar? Die im Companion geprüfte Mindestversion bleibt nutzbar.
        const reason = await externalBlocked();
        if (reason) { log(`Tool-Update wartet: ${reason}`); return; }
      }
      const update = engineSystem.hlaeUpdate || (installation && process.platform === "win32" ? updateHlae : null);
      if (!update || !installation) return;
      hlaeChecked ||= update({ root, hlaeExe: installation.hlaeExe, run: runTool, progress: log }).catch((error) => {
        hlaeChecked = null;
        throw error;
      });
      await hlaeChecked.catch((error) => log(`HLAE-Update fehlgeschlagen (${error.message}). Installierte Version bleibt erhalten; unter „Updates & Info“ erneut prüfen.`));
    } finally { if (external) externalBusy = false; }
  };
  /**
   * Video-Aufnahme nachinstallieren (Setup „Nur Stats und Tipps“, Nutzerwunsch 25.11.2026): HLAE und
   * FFmpeg nur aus dem Manifest vom Originalanbieter, SHA256 geprüft, wie bei der Einrichtung.
   * Fehlende Tools stehen in /api/state (`videoTools`); Aufnahmen melden sie über internalProblem().
   */
  const videoTools = { installed: { hlae: false, ffmpeg: false }, busy: false, message: "", error: "" };
  const readVideoTools = async () => {
    if (!installation) return;
    for (const [name, exe] of [["hlae", installation.hlaeExe], ["ffmpeg", installation.ffmpegExe]])
      videoTools.installed[name] = await stat(exe).then((s) => s.isFile(), () => false);
  };
  await readVideoTools();
  function installVideoTools() {
    if (!installation) throw new Error("Die Video-Aufnahme gibt es nur im installierten Windows-Companion.");
    const install = engineSystem.videoTools || (process.platform === "win32" ? ensureVideoTools : null);
    if (!install) throw new Error("Die Video-Aufnahme gibt es nur unter Windows.");
    if (videoTools.busy) return;
    if (active || externalBusy) throw new Error("Gerade läuft eine Aufnahme, ein Download oder ein Tool-Update. Danach erneut versuchen.");
    active = externalBusy = true;
    Object.assign(videoTools, { busy: true, error: "", message: "Download wird vorbereitet …" });
    (async () => {
      try {
        await install(root, runTool, (message) => { videoTools.message = String(message).slice(0, 200); });
        await readVideoTools();
        videoTools.message = "Video-Aufnahme ist installiert.";
      } catch (error) {
        videoTools.error = error?.message || "Installation fehlgeschlagen.";
        videoTools.message = "";
      } finally {
        await readVideoTools().catch(() => {});
        videoTools.busy = false;
        active = externalBusy = false;
      }
    })();
  }
  /** Updates ohne Klick installieren, sobald nichts läuft. Standardmäßig an, unter „Updates & Info“ abschaltbar. */
  const updatesFile = path.join(installation?.profileDir || dataDir, "updates.json");
  let autoInstall = true;
  try {
    autoInstall = JSON.parse(await readFile(updatesFile, "utf8")).auto !== false;
  } catch {
    /* Standard: automatisch */
  }
  const ownDownload = () =>
    !!installation && (process.platform === "win32" || !!engineSystem.download || downloadDemo !== downloadValveDemo);
  /** Grund, warum eine Aufnahme nicht geht; "" = bereit. */
  const recordingProblem = async (spec) =>
    !engineSystem.recorder
      ? await internalProblem(installation, detected.cs2, spec)
      : !installation
        ? "Aufnahmen brauchen den installierten Windows-Companion."
        : jobSlots(spec)
          ? ""
          : SLOTS_MISSING;
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
  async function fetchJobDemo({ code, directory, entry }) {
    const known = await knownDemo(code);
    if (known) {
      entry.log += "\nDemo dieses Matches liegt schon auf dem PC.";
      entry.engine = "tecmon";
      return known;
    }
    if (!ownDownload()) throw new Error("Demo-Downloads brauchen den installierten Windows-Companion.");
    const demo = await downloadDemo({
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
  }
  let pickingFile = false;
  const json = (res, code, value) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(value));
  };
  async function record(job, input) {
    const demo = typeof input.demo === "string" ? input.demo : "";
    const problem = await recordingProblem(job.job);
    if (problem) throw new Error(problem);
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
      if (job.job.branding.intro || new Set(job.job.sequences.map((s) => s.steamId)).size > 1) {
        // Animiertes Intro und Spielerwechsel: Netzfehler -> statische Variante, falsche Prüfsumme -> Abbruch.
        const motion = await loadMotion(path.join(installation.profileDir, "Branding"));
        if (motion) assets = { ...assets, motion };
        else job.log += "\nAnimiertes Intro nicht erreichbar, statisches TecMon-Intro wird genutzt.";
      }
    }
    const output = path.join(dataDir, job.id);
    await mkdir(output, { recursive: true });
    // Agenten- und Skin-Tausch: Aufnahme aus einer umgeschriebenen Kopie, das Original bleibt unverändert.
    const skins = hasSkins(job.job) && skinSwap.enabled;
    if (hasSkins(job.job) && !skinSwap.enabled) job.log += "\nSkin-Tausch ist im Companion aus; das Video zeigt die echten Skins.";
    if (hasAgents(job.job) || skins) job.status = "preparing";
    const swapCopy = await agentSwap.rewrite(job.job, {
      input: demo,
      original: demo,
      skins,
      log: (message) => {
        job.log += `\n${message}`;
      },
    });
    const recordDemo = swapCopy || demo;
    const config = path.join(output, "recording.json");
    const cameras = jobCameras(job.job, randomUUID);
    if (cameras.length && !installation)
      throw new Error("Freecam-Kamerapunkte benötigen den installierten Windows-Companion.");
    const recording = recordingConfig(job.job, recordDemo, output, input.quality, cameras);
    if (branding) recording.concatenateSequences = false; // Keep exact scene boundaries for player labels.
    if (installation)
      recording.ffmpegSettings = {
        ...recording.ffmpegSettings,
        customLocationEnabled: true,
        customExecutableLocation: installation.ffmpegExe,
      };
    await writeFile(config, JSON.stringify(recording, null, 2));
    await writeFile(path.join(output, "tecmon-job.json"), JSON.stringify(job.job, null, 2));
    {
      job.engine = "tecmon";
      job.status = "recording";
      job.log += "\nEigene TecMon-Aufnahme.";
      await ensureHlae((message) => {
        job.log += `\n${message}`;
      });
      const startedAt = Date.now();
      try {
        await recordInternal({
          recording,
          job: job.job,
          demo: recordDemo,
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
        const crash = await crashSince(detected.cs2, startedAt);
        // Den ursprünglichen Fehler erhalten; ein Dump ist allein keine Ursachenanalyse.
        await writeFile(path.join(output, "recording-diagnostics.txt"), [
          `Aufnahmestart: ${new Date(startedAt).toISOString()}`,
          `Fehler: ${error.message}`,
          `CS2-Fehlerbericht: ${crash || "keiner"}`,
          "", "Plugin-Protokoll:", pluginLog,
        ].join("\n"), "utf8").catch(() => {});
        throw new Error(recordingFailure(error, pluginLog, crash));
      } finally {
        await agentSwap.cleanup(swapCopy);
      }
      return finishRecording(job, output, branding, assets);
    }
  }
  async function finishRecording(job, output, branding, assets) {
    // /bridge/video liest die fertige MP4 aus diesem Ordner.
    job.output = output;
    if (branding) {
      job.status = "branding";
      const final = await renderBranding({
        job: job.job,
        directory: output,
        assets,
        motion: assets.motion || null,
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
        capabilities: ["browser-demo-v1","xray-v1","insights-v1","insights-v2",DEMO_FETCH_CAPABILITY,...(installation && games.has("wardogs") ? [SCOREBOARD_CAPABILITY] : []),...(installation ? [CLIP_CAPABILITY,"video-branding-v1","video-style-v1","video-filter-v1",FILTER_V2_CAPABILITY,"kill-badge-v1","deathcam-label-v1","camera-points-v1",ENGINE_CAPABILITY,SCRIPT_CAPABILITY,SESSION_CAPABILITY,ANGLE_CAPABILITY,AUTO_CAPABILITY,...(games.has("cs2") ? [BACKLOG_CAPABILITY] : []),SKIN_SETUP_CAPABILITY,...(skinSwap.enabled && agentSwap.available ? [SKIN_CAPABILITY,SKIN_KNIFE_CAPABILITY,SKIN_SIDE_CAPABILITY,SKIN_LEGACY_CAPABILITY,SKIN_STICKER_CAPABILITY] : []),...(agentSwap.available ? [AGENT_CAPABILITY,CHICKEN_CAPABILITY,CHICKEN_BREED_CAPABILITY] : [])] : [])],
      });
    // Skin-Tausch von der Webseite ein- und ausschalten (skin-swap-setup-v1); Einschalten nur mit bestätigtem Hinweis.
    if (url.pathname === "/bridge/skins" && (req.method === "GET" || req.method === "POST")) {
      if (!installation)
        return json(res, 409, { error: "Skin-Tausch braucht den installierten Windows-Companion." });
      if (req.method === "GET") return json(res, 200, { skins: skinSwap.state() });
      const input = await readInput(req, 1024);
      return json(res, 200, { skins: await skinSwap.set(input.enabled === true, input.accept) });
    }
    if (req.method === "POST" && url.pathname === "/bridge/insights") {
      const input = await readInput(req, 262144);
      if (!games.has("cs2")) return json(res, 409, { error: "Das CS2-Paket ist im Companion nicht installiert." });
      return json(res, 200, await insights.put(input));
    }
    // Eigene Wardogs-Werte aus Scoreboard-Fotos (scoreboard-v1): nur Zahlen der eigenen Zeile, keine Bilder.
    if (req.method === "GET" && url.pathname === "/bridge/scoreboard") {
      if (!installation || !games.has("wardogs")) return json(res, 409, { error: "Das Wardogs-Paket ist im Companion nicht installiert." });
      return json(res, 200, {
        game: "wardogs",
        snapshots: scoreboard.list().map((s) => ({ time: s.time, values: s.values, confidence: s.confidence, moneySource: s.moneySource })),
      });
    }
    if (req.method === "GET" && url.pathname === "/bridge/clips") {
      if (!installation) return json(res, 409, { error: "Clips brauchen den installierten Windows-Companion." });
      return json(res, 200, { clips: await clips.list(), buffer: clips.state() });
    }
    if (req.method === "GET" && url.pathname === "/bridge/clip") {
      if (!installation) return json(res, 409, { error: "Clips brauchen den installierten Windows-Companion." });
      return await sendClip(res, url.searchParams.get("id"));
    }
    if (req.method === "POST" && url.pathname === "/bridge/clips/brand") {
      const input = await readInput(req, 4096);
      brandClip(String(input.id || ""), String(input.game || ""), String(input.title || ""));
      return json(res, 202, { id: input.id, status: "branding" });
    }
    // Letzte eigene Matches über Steam (recent-matches-v1): nur Match-Infos, keine Pfade, keine Demo.
    if (url.pathname.startsWith("/bridge/matches")) {
      if (!installation || !games.has("cs2")) return json(res, 409, { error: "Die Match-Liste braucht den installierten Windows-Companion mit CS2-Paket." });
      if (req.method === "GET" && url.pathname === "/bridge/matches") return json(res, 200, statsBacklog.list());
      if (req.method === "POST" && url.pathname === "/bridge/matches/refresh") {
        await readInput(req, 256);
        return json(res, 200, await statsBacklog.refresh({ force: true }));
      }
      if (req.method === "POST" && url.pathname === "/bridge/matches/done") {
        const input = await readInput(req, 4096);
        return json(res, 200, await statsBacklog.markDone(input.matchIds));
      }
    }
    if (req.method === "GET" && url.pathname === "/bridge/auto") {
      const item = auto.ready(String(url.searchParams.get("id") || ""));
      return item ? json(res, 200, item) : json(res, 404, { error: "Kein automatisches Video vorbereitet." });
    }
    // Demo von Valve für die Webseite holen (demo-fetch-v1): spart der Webseite den Server-Umweg.
    if (req.method === "GET" && url.pathname === "/bridge/demo-fetch") {
      if (externalBusy) return json(res, 409, { error: "Externe Komponenten werden aktualisiert. Kurz warten." });
      return demoFetch.send(res, url.searchParams.get("url"));
    }
    if (req.method === "GET" && url.pathname === "/bridge/auto/demo") {
      const demo = auto.demoPath(String(url.searchParams.get("id") || ""));
      const info = demo ? await stat(demo).catch(() => null) : null;
      if (!info?.isFile()) return json(res, 404, { error: "Demo nicht vorhanden." });
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": info.size });
      return createReadStream(demo).on("error", () => res.destroy()).pipe(res);
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
    if (capture && !specification.shareCode && typeof input.demoId!=="string" && typeof input.autoId!=="string")
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
    if (capture) {
      const problem = await recordingProblem(specification);
      if (problem) throw new Error(problem);
    } else if (!ownDownload()) throw new Error("Demo-Downloads brauchen den installierten Windows-Companion.");
    active = true;
    try {
      const browserDemo = !capture || specification.shareCode ? null
        : typeof input.autoId === "string" ? auto.consume(input.autoId) : browserFiles.consume(owner,input.demoId);
      jobs.set(job.id, job);
      void (async () => {
        try {
          let demo=browserDemo;
          for (const code of codes) {
            const entry = { id: randomUUID(), code, status: "downloading", log: "", demo: "" };
            downloads.set(entry.id, entry);
            try {
              demo = await fetchJobDemo({
                code,
                directory: path.join(dataDir, "Downloads", entry.id),
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
          if (capture) await record(job, { demo, quality: input.quality });
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
    if (!installation || (process.platform !== "win32" && !engineSystem.recorder))
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
      const browserDemo = code ? null : browserFiles.consume(owner, input.demoId);
      jobs.set(job.id, job);
      void (async () => {
        try {
          let demo = browserDemo;
          if (code) {
            const entry = { id: randomUUID(), code, status: "downloading", log: "", demo: "" };
            downloads.set(entry.id, entry);
            demo = await fetchJobDemo({ code, directory: path.join(dataDir, "Downloads", entry.id), entry });
            entry.demo = demo;
            entry.status = "done";
          }
          job.status = "camera";
          job.engine = "tecmon";
          await ensureHlae((message) => {
            job.log += `\n${message}`;
          });
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
      if (url.pathname === "/gsi/dota2") {
        if (!games.has("dota2")) return json(res, 409, { error: "Das Dota-2-Paket ist nicht installiert." });
        return await dotaGsiRequest(req, res);
      }
      if (url.pathname === "/gsi") {
        if (!games.has("cs2")) return json(res, 409, { error: "Das CS2-Paket ist nicht installiert." });
        return await gsiRequest(req, res);
      }
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
        "/crosshair-art.js": ["crosshair-art.js", "text/javascript; charset=utf-8"],
        "/menu.js": ["menu.js", "text/javascript; charset=utf-8"],
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
          cs2Check,
          managed: !!installation,
          updates: { auto: autoInstall, available: !!installation, external: external?.state() || null },
          active,
          work: workState(jobs),
          bridge: bridge.state(),
          gsi: gsiState(),
          auto: auto.state(),
          backlog: games.has("cs2") && installation ? statsBacklog.state() : null,
          skins: skinSwap.state(),
          dota: dotaState(),
          pet: pet.state(),
          games: games.state(),
          clips: clips.state(),
          scoreboard: games.has("wardogs") ? scoreboard.state() : null,
          overlay: overlayState(),
          chat: chatOverlayState(),
          chatBubble: chatBubbleState(),
          desktop: desktop.get(),
          desktopRuntime: { ...desktopRuntime, connected: Date.now() - desktopRuntimeAt < 15_000 },
          videoTools: installation ? { ...videoTools, installed: { ...videoTools.installed } } : null,
          downloads: [...downloads.values()],
          dataDir,
          jobs: [...jobs.values()].map(({ output: _output, ...j }) => j),
        });
      if (req.method === "GET" && url.pathname === "/api/pet/quiz") return json(res, 200, quizQuestion());
      if (req.method === "GET" && url.pathname === "/api/crosshair") return json(res, 200, crosshairState());
      if (req.method === "GET" && url.pathname === "/api/chat") {
        if (!games.has("cs2")) throw new Error("Das CS2-Paket ist nicht installiert. Unter „Games“ installieren.");
        if (chatTranslator.state().overlay) refreshWindowMode(true);
        return json(res, 200, { chat: { ...chatTranslator.state(), windowMode }, messages: chatTranslator.messages() });
      }
      if (req.method === "GET" && url.pathname === "/api/cfgs") return json(res, 200, cfgs.state(detected.cs2));
      if (req.method === "GET" && url.pathname === "/api/wardogs/scoreboard") {
        if (!games.has("wardogs")) throw new Error("Das Wardogs-Paket ist nicht installiert. Unter „Games“ installieren.");
        return json(res, 200, { scoreboard: scoreboard.state(), snapshots: scoreboard.list().slice(0, 50) });
      }
      if (req.method === "GET" && url.pathname === "/api/clips")
        return json(res, 200, { clips: await clips.list(), buffer: clips.state(), folder: clips.dir });
      if (req.method === "GET" && url.pathname === "/api/clips/devices")
        return externalBusy ? json(res, 409, { error: "Externe Komponenten werden aktualisiert." }) : json(res, 200, { devices: await clips.devices() });
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
      if (url.pathname === "/api/clips/settings") {
        if (externalBusy) throw new Error("Externe Komponenten werden aktualisiert. Kurz warten.");
        const result = await clips.setSettings(input);
        return json(res, 200, { buffer: result, message: result.enabled ? `Clip-Puffer läuft. ${result.hotkey} speichert die letzten ${result.seconds} Sekunden.` : "Clip-Puffer aus. Der Zwischenspeicher wurde gelöscht." });
      }
      if (url.pathname === "/api/clips/save") {
        const saved = await clips.save(input.seconds);
        return json(res, 200, { ...saved, message: `Clip gespeichert (${saved.seconds} s).` });
      }
      if (url.pathname === "/api/clips/remove") {
        await clips.remove(String(input.id || ""));
        return json(res, 200, { clips: await clips.list() });
      }
      if (url.pathname === "/api/clips/brand") {
        brandClip(String(input.id || ""), String(input.game || ""), String(input.title || ""));
        return json(res, 202, { status: "branding" });
      }
      if (url.pathname === "/api/clips/open") {
        const file = clips.clipPath(String(input.id || ""), input.branded === true);
        if (!existsSync(file)) throw new Error("Clip nicht gefunden.");
        openPath(file, false);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/api/clips/folder") {
        if (input.id) openPath(clips.clipPath(String(input.id)), true);
        else openPath(await realpath(clips.dir), false);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/api/video-tools/install") {
        installVideoTools();
        return json(res, 200, { message: "Video-Aufnahme wird installiert …" });
      }
      if (url.pathname === "/api/games/install") {
        const id = String(input.id || "");
        const fresh = id === "cs2" && !games.has("cs2");
        await games.install(id);
        if (fresh) {
          // Neu installiertes CS2-Paket: wieder alle Standards an (außer Fadenkreuz-Overlay).
          await gsi.resetDefaults();
          await auto.setEnabled(true);
          await chatTranslator.setSettings({ enabled: true, bubble: true });
          if (detected.cs2) await syncGsiConfig();
        }
        return json(res, 200, { message: "Paket installiert.", games: games.state() });
      }
      if (url.pathname === "/api/games/remove") {
        if (input.confirm !== true) throw new Error("Entfernen bitte ausdrücklich bestätigen.");
        const id = String(input.id || "");
        if (id === "cs2") {
          await gsi.setEnabled(false);
          await auto.setEnabled(false);
          await statsBacklog.reset();
          await syncGsiConfig();
          await insights.clear();
          await crosshair.reset(detected.cs2, true);
          await cfgs.reset(detected.cs2);
          await chatTranslator.reset();
        }
        await games.remove(id);
        if (id === "wardogs") await scoreboard.reset();
        if (id === "dota2") {
          await dotaGsi.setEnabled(false);
          await dotaGsi.setFeatures(Object.fromEntries(DOTA_FEATURES.map((f) => [f.id, true])));
          await syncDotaConfig();
        }
        return json(res, 200, { message: "Paket entfernt. Seine Daten wurden gelöscht.", games: games.state(), gsi: gsiState() });
      }
      if (url.pathname.startsWith("/api/wardogs/") && !games.has("wardogs"))
        throw new Error("Das Wardogs-Paket ist nicht installiert. Unter „Games“ installieren.");
      if (url.pathname === "/api/wardogs/settings") {
        const state = await scoreboard.setSettings(input);
        return json(res, 200, { scoreboard: state, message: state.enabled ? `Scoreboard-Foto an. ${state.hotkey} drücken und ${state.seconds} Sekunden Tab halten.` : "Scoreboard-Foto aus." });
      }
      if (url.pathname === "/api/wardogs/capture") {
        if (externalBusy) throw new Error("Externe Komponenten werden aktualisiert. Kurz warten.");
        const snapshot = await scoreboard.capture();
        return json(res, 200, { snapshot, message: `Gespeichert: ${scoreboardSummary(snapshot.values)}` });
      }
      if (url.pathname === "/api/wardogs/remove") {
        await scoreboard.remove(input.time);
        return json(res, 200, { snapshots: scoreboard.list().slice(0, 50) });
      }
      if (url.pathname.startsWith("/api/dota2/") && !games.has("dota2"))
        throw new Error("Das Dota-2-Paket ist nicht installiert. Unter „Games“ installieren.");
      if (url.pathname === "/api/dota2/enable") {
        if (input.confirm !== true) throw new Error("Dota-2-Tipps bitte ausdrücklich einschalten.");
        if (!dotaGsiConfigPath(detected.dota2)) throw new Error("Dota 2 wurde auf diesem PC nicht gefunden.");
        await installDotaGsiConfig(detected.dota2, dotaGsi.token);
        await dotaGsi.setEnabled(true);
        dotaError = "";
        return json(res, 200, {
          message: "Dota-2-Tipps eingeschaltet. In Steam bei Dota 2 die Startoption -gamestateintegration setzen und das Spiel neu starten.",
          dota: dotaState(),
        });
      }
      if (url.pathname === "/api/dota2/disable") {
        await dotaGsi.setEnabled(false);
        await syncDotaConfig();
        return json(res, 200, { message: "Dota-2-Tipps ausgeschaltet.", dota: dotaState() });
      }
      if (url.pathname === "/api/dota2/features") {
        const known = new Set(DOTA_FEATURES.map((f) => f.id));
        const update = Object.fromEntries(
          Object.entries(input.features || {}).filter(([id, on]) => known.has(id) && typeof on === "boolean"),
        );
        await dotaGsi.setFeatures(update);
        return json(res, 200, { dota: dotaState() });
      }
      if (url.pathname.startsWith("/api/gsi/") || url.pathname === "/api/crosshair/save" || url.pathname.startsWith("/api/cfgs/")) {
        if (!games.has("cs2")) throw new Error("Das CS2-Paket ist nicht installiert. Unter „Games“ installieren.");
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
      if (url.pathname === "/api/desktop/settings") return json(res, 200, { desktop: await desktop.set(input) });
      if (url.pathname === "/api/desktop/runtime") {
        const chosen = desktop.get();
        if (input.key === chosen.menuKey && input.modifier === chosen.menuModifier) {
          desktopRuntime = { registered: input.registered === true, key: chosen.menuKey, modifier: chosen.menuModifier };
          desktopRuntimeAt = Date.now();
        }
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/api/pet/mode") return json(res, 200, { pet: await pet.setMode(String(input.mode || "")) });
      if (url.pathname === "/api/pet/interact") return json(res, 200, { pet: await pet.interact(String(input.action || "")) });
      if (url.pathname === "/api/pet/game") return json(res, 200, { pet: await pet.game(String(input.game || ""), { win: input.win === true, score: input.score }) });
      if (url.pathname === "/api/crosshair/profile") {
        const options = cleanOverlayOptions({ ...overlay.get(), ...input.overlay });
        await crosshair.save(input.crosshair);
        await overlay.configure(options);
        return json(res, 200, { ...crosshairState(), message: "Fadenkreuz und Overlay-Einstellungen gespeichert. Keine Spiel-Dateien geändert." });
      }
      if (url.pathname === "/api/crosshair/runtime") {
        overlayRuntime = { connected: true, paused: input.paused === true, hotkey: typeof input.hotkey === "boolean" ? input.hotkey : null };
        overlayRuntimeAt = Date.now();
        return json(res, 200, { ok: true });
      }
      if (url.pathname === "/api/crosshair/save") {
        const result = await crosshair.save(input.crosshair, detected.cs2);
        return json(res, 200, {
          ...crosshairState(),
          message: result.written
            ? `Fadenkreuz gespeichert. In CS2 einmal in die Konsole tippen: ${CROSSHAIR_EXEC}`
            : "Fadenkreuz gespeichert. CS2 wurde nicht gefunden: Befehle kopieren und in die CS2-Konsole einfügen.",
        });
      }
      if (url.pathname.startsWith("/api/chat/") && !games.has("cs2"))
        throw new Error("Das CS2-Paket ist nicht installiert. Unter „Games“ installieren.");
      if (url.pathname === "/api/chat/settings") {
        const state = await chatTranslator.setSettings(input);
        return json(res, 200, { chat: state, message: state.enabled ? "Chat-Übersetzer an. CS2 braucht -condebug in Steam unter Eigenschaften → Startoptionen (nicht in der CS2-Konsole)." : "Chat-Übersetzer aus." });
      }
      if (url.pathname === "/api/chat/launch") {
        // Steam-Link nur mit geprüften Startoptionen (cleanLaunchOptions). Steam zeigt selbst eine Rückfrage zu den Startoptionen.
        if (process.platform !== "win32") throw new Error("Nur unter Windows mit Steam möglich.");
        spawn("explorer.exe", [chatTranslator.launchUrl()], { windowsHide: true, stdio: "ignore" }).unref();
        return json(res, 200, { message: `Steam startet CS2 mit ${chatTranslator.state().launchOptions}. Bestätige die Rückfrage von Steam.` });
      }
      if (url.pathname === "/api/chat/overlay-move") {
        const c = chatTranslator.state();
        if (!c.enabled || !c.overlay) throw new Error("Erst Chat-Übersetzer und Chat-Overlay einschalten.");
        chatMoveRequest += 1;
        return json(res, 200, { message: "Das Overlay steht jetzt auf dem Bildschirm: mit der Maus ziehen, auch auf einen zweiten Bildschirm. Rechtsklick oder Doppelklick speichert." });
      }
      if (url.pathname === "/api/chat/reply") {
        const result = await chatTranslator.reply({ text: String(input.text || ""), to: String(input.to || "auto"), team: input.team === true });
        return json(res, 200, { reply: result, message: result.written ? `Bereit: in CS2 ${result.key} drücken. Der Text ist auch in der Zwischenablage.` : "Übersetzt. Der Text ist in der Zwischenablage; CS2-cfg-Ordner nicht gefunden." });
      }
      if (url.pathname === "/api/crosshair/overlay") {
        const state = await overlay.set(input.enabled === true, input.accept);
        return json(res, 200, {
          ...crosshairState(),
          message: state.enabled
            ? "Fadenkreuz-Overlay an. Ziel und Aussehen lassen sich unabhängig von CS2 einstellen."
            : "Fadenkreuz-Overlay aus.",
        });
      }
      if (url.pathname === "/api/cfgs/install") {
        const id = String(input.id || "").slice(0, 40);
        const result = await cfgs.install(id, typeof input.key === "string" ? input.key.slice(0, 20) : "", detected.cs2);
        return json(res, 200, {
          ...cfgs.state(detected.cs2),
          message: result.written
            ? `cfg gespeichert. In CS2 einmal in die Konsole tippen: ${result.exec}`
            : "cfg gemerkt. CS2 wurde nicht gefunden: Befehle kopieren und in die CS2-Konsole einfügen.",
        });
      }
      if (url.pathname === "/api/cfgs/remove") {
        await cfgs.remove(String(input.id || "").slice(0, 40), detected.cs2);
        return json(res, 200, { ...cfgs.state(detected.cs2), message: "cfg-Datei entfernt. Schon gesetzte Werte bleiben in CS2, bis du sie änderst." });
      }
      if (url.pathname === "/api/crosshair/decode") {
        const decoded = decodeCrosshairCode(typeof input.code === "string" ? input.code.slice(0, 64) : "");
        if (!decoded) throw new Error("Das ist kein gültiger CS2-Fadenkreuz-Code (CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx).");
        return json(res, 200, { crosshair: decoded, commands: crosshairCommands(decoded) });
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
      if (url.pathname === "/api/auto/settings") {
        if (input.enabled === true && !games.has("cs2")) throw new Error("Das CS2-Paket ist nicht installiert.");
        if (input.enabled === true && !gsiConfigPath(detected.cs2)) throw new Error("CS2 wurde auf diesem PC nicht gefunden.");
        let state = await auto.setEnabled(input.enabled === true);
        await syncGsiConfig();
        if (state.enabled && gsiError) {
          state = await auto.setEnabled(false);
          await syncGsiConfig();
          throw new Error(`GSI-Datei konnte nicht angelegt werden: ${gsiError}`);
        }
        return json(res, 200, {
          auto: state,
          message: state.enabled
            ? "Nach jedem fertigen Match fragt TecMon, ob ein Highlight-Video entstehen soll. Falls CS2 gerade läuft, das Spiel einmal neu starten."
            : "Automatisches Highlight-Video aus.",
        });
      }
      if (url.pathname === "/api/skins/settings") {
        if (input.enabled === true && !installation) throw new Error("Skin-Tausch braucht den installierten Windows-Companion.");
        const state = await skinSwap.set(input.enabled === true, input.accept);
        return json(res, 200, {
          skins: state,
          message: state.enabled
            ? "Skin-Tausch an. Auf tecmon.online lassen sich jetzt im Demo-Manager Skins je Szene eintragen."
            : "Skin-Tausch aus. Das geladene Programm wurde entfernt.",
        });
      }
      if (url.pathname === "/api/backlog/settings") {
        if (typeof input.ask !== "boolean") throw new Error("Ungültige Einstellung.");
        const state = await statsBacklog.setAsk(input.ask);
        return json(res, 200, {
          backlog: state,
          message: state.ask
            ? "Beim Schließen von CS2 fragt TecMon, ob offene Matches ausgewertet und die Stats hochgeladen werden sollen."
            : "TecMon fragt beim Schließen von CS2 nicht mehr nach Stats. Offene Matches stehen weiter auf tecmon.online.",
        });
      }
      if (url.pathname === "/api/backlog/open") {
        const result = await statsBacklog.openNow();
        return json(res, 200, { ...result, backlog: statsBacklog.state() });
      }
      if (url.pathname === "/api/backlog/answer") {
        const result = await statsBacklog.answer(String(input.id || ""), input.yes === true);
        return json(res, 200, { ...result, backlog: statsBacklog.state() });
      }
      if (url.pathname === "/api/auto/answer") {
        const result = await auto.answer(String(input.id || ""), input.yes === true, path.join(dataDir, "Auto-Demos"));
        return json(res, 200, { ...result, auto: auto.state() });
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
      if (url.pathname === "/api/update/external/check") {
        if (!external) throw new Error("Externe Updates benötigen den installierten Windows-Companion.");
        // Nicht die komplette Paketinstallation in der HTTP-Anfrage abwarten.
        void externalUpdateTick({ force: true }).catch(console.error);
        return json(res, 202, { external: external.state() });
      }
      if (url.pathname === "/api/update/external/auto") {
        if (!external) throw new Error("Externe Updates benötigen den installierten Windows-Companion.");
        return json(res, 200, { external: await external.setAuto(input.auto) });
      }
      if (url.pathname === "/api/update/check") return json(res, 200, await checkUpdate());
      if (url.pathname === "/api/update/install") {
        if (!installation) throw new Error("Updates benötigen eine installierte Windows-Version.");
        if (active || input.confirm !== true)
          throw new Error("Zuerst Aufnahme/Download beenden und Update bestätigen.");
        active = true;
        try {
          if (external && (clipBranding || clips.state().recording || scoreboard.state().busy || demoFetch.running || await externalBlocked()))
            throw new Error("Update wartet: Zuerst Spiel, Clip-Puffer oder laufende Verarbeitung beenden.");
          const update = await findUpdate(VERSION);
          if (!update.available) {
            active = false;
            return json(res, 200, { message: "Companion ist aktuell." });
          }
          await startUpdate(update);
          updateHandoff(server,res,onUpdateExit);
          return json(res, 200, {
            message: "Update geprüft. Companion startet nach der Aktualisierung neu.",
            latest:update.latest,
          });
        } catch (error) {
          active = false;
          console.error("Update:", error instanceof Error ? error.message : error);
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
        if (!ownDownload()) throw new Error("Demo-Downloads brauchen den installierten Windows-Companion.");
        // Vor dem ersten await reservieren: nie zwei Downloads gleichzeitig.
        active = true;
        try {
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
                  entry.demo = await fetchJobDemo({
                    code: entry.code,
                    directory: path.join(dataDir, "Downloads", entry.id),
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
      if (url.pathname === "/api/update/auto") {
        if (typeof input.auto !== "boolean") throw new Error("Ungültige Einstellung.");
        autoInstall = input.auto;
        await writeFile(updatesFile, JSON.stringify({ auto: autoInstall }));
        return json(res, 200, { auto: autoInstall });
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
        if (active) throw new Error("Zuerst die laufende Aufnahme beenden.");
        await clips.stop();
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

  /** Geprüftes Update herunterladen und den Updater starten; danach muss dieser Dienst enden. */
  async function startUpdate(update) {
    // Jeder Schritt landet im Protokoll (companion.log), damit ein hängendes Update nachvollziehbar ist.
    console.log(`Update ${update.latest}: lade Paket (${update.size} Bytes) …`);
    const executable = await fetchUpdate(root, update);
    console.log(`Update ${update.latest}: starte Updater …`);
    const child = launchUpdate(executable);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Updater startet nicht.")), 30000);
      child.once("spawn", () => (clearTimeout(timer), resolve()));
      child.once("error", (error) => (clearTimeout(timer), reject(error)));
    });
    child.unref();
    console.log(`Update ${update.latest}: Updater läuft, Dienst beendet sich.`);
  }
  /**
   * Automatische Updates: gleiche Prüfung wie der Knopf (stabiles Release,
   * Manifest, Größe, SHA-256). Nie während Download, Aufnahme oder Kamera-Sitzung;
   * dann beim nächsten Durchgang erneut.
   */
  let updateTimer = null;
  let pendingAppUpdate = null;
  let externalTimer = null;
  async function externalTimerTick() {
    externalTimer = null;
    try { await externalUpdateTick(); } catch (error) { console.error("Externe Updates:", error.message); }
    if (externalUpdate.every > 0 && server.listening) {
      externalTimer = setTimeout(externalTimerTick, externalUpdate.every);
      externalTimer.unref?.();
    }
  }
  async function autoUpdateTick() {
    updateTimer = null;
    let restarting = false;
    try {
      if (installation && autoInstall && !active) {
        const update = pendingAppUpdate || await findUpdate(VERSION);
        pendingAppUpdate = update.available ? update : null;
        if (update.available && !active && !clips.state().recording && !clipBranding && !scoreboard.state().busy && !demoFetch.running && (!external || !await externalBlocked()) && !active) {
          active = true;
          try {
            console.log(`Automatisches Update auf ${update.latest} …`);
            await startUpdate(update);
            restarting = true;
            server.closeAllConnections();
            server.close();
            onUpdateExit?.();
          } finally {
            if (!restarting) active = false;
          }
        }
      }
    } catch (error) {
      console.error("Automatisches Update:", error instanceof Error ? error.message : error);
    }
    if (!restarting && autoUpdate.every > 0) {
      // Offene Updates nach laufenden Aufträgen zeitnah erneut versuchen, ohne
      // die GitHub-Metadaten jede Minute erneut anzufragen.
      updateTimer = setTimeout(autoUpdateTick, autoInstall && (active || pendingAppUpdate) ? Math.min(60_000, autoUpdate.every) : autoUpdate.every);
      updateTimer.unref?.();
    }
  }
  if (installation && autoUpdate.first > 0) {
    updateTimer = setTimeout(autoUpdateTick, autoUpdate.first);
    updateTimer.unref?.();
  }
  if (installation) clips.resume();
  if (external && externalUpdate.first > 0) {
    externalTimer = setTimeout(externalTimerTick, externalUpdate.first);
    externalTimer.unref?.();
  }
  server.on("close", () => {
    clearInterval(autoTimer);
    clips.stop().catch(() => {});
    chatTranslator.close();
    if (updateTimer) clearTimeout(updateTimer);
    if (externalTimer) clearTimeout(externalTimer);
  });
  return { server, token, autoUpdateTick, externalUpdateTick };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const installation = await readInstallation(root);
  const { server } = await createCompanion({
    installation,
    onUpdateExit: () => process.exit(0),
    // Zwei Minuten nach dem Start, danach alle sechs Stunden.
    autoUpdate: { first: 2 * 60_000, every: 6 * 60 * 60_000 },
    externalUpdate: { first: 30_000, every: 60_000 },
  });
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
