/**
 * Eigene Aufnahme-Kette ohne CS-Demo-Manager-Programm und ohne Datenbank.
 *
 * Ablauf, Befehle und Dateiaufbau folgen CS Demo Manager 3.20.1
 * (MIT, Copyright AkiVer, https://github.com/akiver/cs-demo-manager):
 *   1. Aktionsdatei `<demo>.json` für das CS2-Plugin schreiben (wie eine VDM-Datei).
 *   2. Das offizielle, SHA-256-geprüfte CS2-Plugin in `game/csgo/csdm` einhängen.
 *   3. CS2 über HLAE starten; HLAE nimmt über seinen FFmpeg-Preset direkt MP4 auf.
 *   4. Je Szene Video und Ton zusammenführen, optional zu einem Video verbinden.
 *
 * Was CS Demo Manager aus seiner Datenbank liest (Spieler-Slots, Tickrate,
 * Kamerapunkte), steht hier schon im TecMon-Auftrag. Darum braucht dieser Weg
 * weder `csdm analyze` noch PostgreSQL.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, rm, readdir, rename, stat } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { PLUGIN_REVISION, PLUGIN_SHA256 } from "./recording-engine.mjs";
import { needsScript } from "./job.mjs";
import { scriptPlan, scriptSource, parseMarks, MARK_COMMAND } from "./camera-script.mjs";

export const ENGINE_CAPABILITY = "recorder-internal-v1";
const MIN_TICK = 96; // CSDM #1343: Befehle in den ersten ~1,5 s nach demo_gototick 0 gehen verloren.
const PLUGIN_FOLDER = "csdm"; // Name, unter dem das Plugin seine Aktionsdatei und csdm.log nutzt.
const GAMEINFO_LINE = "Game\tcsgo/csdm";
const tick = (t) => Math.max(MIN_TICK, Math.round(t));
const unix = (p) => p.replaceAll("\\", "/");
/** Eigene Dateipfade in Befehlen: keine Anführungszeichen, Trenner oder Zeilenumbrüche. */
const safePath = (p) => {
  const value = unix(p);
  if (/[";\r\n\0]/.test(value)) throw new Error("Ungültiger Pfad für das Kameraskript.");
  return value;
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export const sequenceName = (s) => `${s.number}-sequence`;
export const sequenceOutputFile = (folder, s) =>
  path.join(folder, `sequence-${s.number}-tick-${s.startTick}-to-${s.endTick}.mp4`);

/** Spieler-Slots (Wert für spec_player) aus dem Auftrag; fehlt einer, bleibt nur der CSDM-Weg. */
export function jobSlots(job) {
  const slots = new Map();
  for (const s of job.sequences) {
    if (!Number.isSafeInteger(s.slot)) return null;
    if (slots.has(s.steamId) && slots.get(s.steamId) !== s.slot) return null;
    slots.set(s.steamId, s.slot);
  }
  return slots;
}

/**
 * Aktionsdatei für das CS2-Plugin. Gleiche Befehlsfolge wie
 * createCs2VideoJsonFile() in CSDM 3.20.1 für HLAE + FFmpeg + Video.
 */
export function buildActions(recording, { tickRate, slots, cameras = [], script = "" }) {
  const sequences = [...recording.sequences].sort(
    (a, b) => a.startTick - b.startTick || a.number - b.number,
  );
  const ff = recording.ffmpegSettings;
  const out = [];
  let actions = [];
  const add = (t, cmd) => actions.push({ tick: tick(t), cmd });
  const rate = Math.round(tickRate);
  sequences.forEach((s, i) => {
    for (const cmd of [
      "sv_cheats 1",
      "volume 1",
      "cl_hud_telemetry_frametime_show 0",
      "cl_hud_telemetry_net_misdelivery_show 0",
      "cl_hud_telemetry_ping_show 0",
      "cl_hud_telemetry_serverrecvmargin_graph_show 0",
      "cl_trueview_show_status 0",
      "r_show_build_info 0",
      "mirv_streams record screen enabled 1",
      "cl_demo_predict 0",
    ])
      add(1, cmd);
    // Das Kameraskript bleibt nach dem ersten Laden aktiv, auch über go_to_next_sequence.
    if (script && i === 0) add(1, `mirv_script_load "${safePath(script)}"`);
    add(1, `cl_draw_only_deathnotices ${s.showOnlyDeathNotices ? 1 : 0}`);
    add(1, `mirv_deathmsg lifetime ${s.deathNoticesDuration}`);
    add(1, "mirv_deathmsg filter clear");
    add(1, "tv_listen_voice_indices 0");
    add(1, "tv_listen_voice_indices_h 0");
    const setup = Math.max(1, s.startTick - rate);
    const folder = `${unix(recording.outputFolderPath)}/${sequenceName(s)}`;
    const preset = `csdmPreset${s.number}`;
    add(setup, `mirv_streams record startMovieWav ${s.recordAudio ? 1 : 0}`);
    add(setup, `mirv_streams record name "${folder}"`);
    add(setup, "mirv_deathmsg clear");
    add(setup, `spec_show_xray ${s.showXRay ? 1 : 0}`);
    add(setup, `mp_display_kill_assists ${s.showAssists ? 1 : 0}`);
    add(
      setup,
      `mirv_streams settings add ffmpeg ${preset} "-c:v ${ff.videoCodec} -pix_fmt yuv420p -crf ${ff.constantRateFactor} {QUOTE}${folder}\\\\video.${ff.videoContainer}{QUOTE}"`,
    );
    add(setup, `mirv_streams record screen settings ${preset}`);
    add(setup, `mirv_streams record fps ${recording.framerate}`);
    add(Math.max(1, s.startTick - 4), "pause_playback");
    // CSDM #1238: erst zum Setup-Tick springen, dann spec_player, nie im selben Tick.
    add(1, `demo_gototick ${tick(Math.max(1, setup - 1))}`);
    for (const c of s.playerCameras) {
      const slot = slots.get(c.playerSteamId);
      if (slot === undefined) throw new Error("Spieler-Slot fehlt im Auftrag.");
      add(c.tick, "spec_mode 1");
      add(c.tick, `spec_player ${slot}`);
    }
    for (const ref of s.cameras) {
      const c = cameras.find((camera) => camera.id === ref.id);
      if (c) add(ref.tick, `spec_goto ${c.x} ${c.y} ${c.z} ${c.pitch} ${c.yaw}`);
    }
    add(setup, "mirv_deathmsg filter clear");
    if (s.playersOptions.length) add(setup, "mirv_deathmsg filter add block=1");
    for (const p of s.playersOptions) {
      add(setup, `mirv_replace_name byXuid add x${p.steamId} "${p.playerName}"`);
      if (p.showKill)
        add(
          setup,
          `mirv_deathmsg filter add attackerMatch=x${p.steamId} attackerIsLocal=${p.highlightKill ? 1 : 0} block=0`,
        );
    }
    add(s.startTick, "mirv_streams record start");
    add(s.endTick, "mirv_streams record end");
    if (recording.closeGameAfterRecording && i === sequences.length - 1) add(s.endTick + 64, "quit");
    else {
      add(s.endTick + 64, "go_to_next_sequence");
      out.push({ actions });
      actions = [];
    }
  });
  if (actions.length) out.push({ actions });
  return out;
}

/** CS2-Hauptordner aus dem Pfad der cs2.exe (…/game/bin/win64/cs2.exe). */
export function cs2Root(cs2Exe) {
  return path.resolve(path.dirname(cs2Exe), "..", "..", "..");
}

/** Plugin aus dem eigenen Cache, sonst einmalig vom unveränderlichen Upstream-Commit laden. */
export async function pluginBytes(cacheDir, request = fetch) {
  const file = path.join(cacheDir, `server-${PLUGIN_REVISION.slice(0, 12)}.dll`);
  try {
    const cached = await readFile(file);
    if (sha256(cached) === PLUGIN_SHA256) return cached;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const response = await request(
    `https://raw.githubusercontent.com/akiver/cs-demo-manager/${PLUGIN_REVISION}/static/cs2/server.dll`,
    { signal: AbortSignal.timeout(120000) },
  );
  if (!response.ok) throw new Error("CS2-Plugin konnte nicht geladen werden.");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw new Error("CS2-Plugin zu groß.");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (sha256(bytes) !== PLUGIN_SHA256)
    throw new Error("Prüfsumme des CS2-Plugins stimmt nicht. Aufnahme abgebrochen.");
  await mkdir(cacheDir, { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, bytes);
  await rename(temporary, file);
  return bytes;
}

/** Plugin einhängen: Suchpfad in gameinfo.gi ergänzen, server.dll ablegen, altes Log löschen. */
export async function installPlugin(root, bytes) {
  const csgo = path.join(root, "game", "csgo");
  const gameinfo = path.join(csgo, "gameinfo.gi");
  const bin = path.join(csgo, PLUGIN_FOLDER, "bin");
  await rm(path.join(root, "game", "bin", "win64", "csdm.log"), { force: true });
  await mkdir(bin, { recursive: true });
  await writeFile(path.join(bin, "server.dll"), bytes);
  const content = await readFile(gameinfo, "utf8");
  if (content.includes(GAMEINFO_LINE)) return;
  if (!/Game\tcsgo(\r?\n)/.test(content)) throw new Error("Unbekannter Aufbau der gameinfo.gi. CS2 prüfen.");
  await writeFile(gameinfo, content.replace(/Game\tcsgo(\r?\n)/, `${GAMEINFO_LINE}$1\t\t\tGame\tcsgo$1`));
}

/**
 * Plugin wieder entfernen. Statt eine alte Sicherung zurückzuspielen (die ein
 * CS2-Update überschreiben würde) wird nur die eigene Zeile herausgenommen.
 */
export async function uninstallPlugin(root) {
  const csgo = path.join(root, "game", "csgo");
  const gameinfo = path.join(csgo, "gameinfo.gi");
  await rm(path.join(csgo, PLUGIN_FOLDER), { recursive: true, force: true });
  const content = await readFile(gameinfo, "utf8").catch(() => null);
  if (content?.includes(GAMEINFO_LINE))
    await writeFile(gameinfo, content.replace(/[ \t]*Game\tcsgo\/csdm\r?\n/, ""));
}

/** Aufrufparameter für HLAE, wie startCounterStrikeWithHlae() in CSDM. */
export function hlaeArgs({ hlaeExe, cs2Exe, demo, width, height, extra = "" }) {
  return [
    "-noGui",
    "-autoStart",
    "-noConfig",
    "-afxDisableSteamStorage",
    "-customLoader",
    "-hookDllPath",
    path.join(path.dirname(hlaeExe), "x64", "AfxHookSource2.dll"),
    "-programPath",
    cs2Exe,
    "-cmdLine",
    `-insecure -novid${extra} +playdemo "${demo}" -width ${width} -height ${height} -sw`,
  ];
}

/** HLAE findet FFmpeg über ffmpeg/ffmpeg.ini neben hlae.exe. */
export async function registerFfmpeg(hlaeExe, ffmpegExe) {
  const folder = path.join(path.dirname(hlaeExe), "ffmpeg");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "ffmpeg.ini"), `[Ffmpeg]\nPath=${ffmpegExe}`, "utf8");
}

function tasklist(image) {
  return new Promise((resolve) => {
    execFile(
      "tasklist",
      ["/fi", `imagename eq ${image}`, "/fo", "csv", "/nh"],
      { windowsHide: true },
      (error, stdout) => resolve(!error && stdout.toLowerCase().includes(`"${image}"`)),
    );
  });
}

function runFfmpeg(ffmpegExe, args, log) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegExe, ["-hide_banner", "-loglevel", "error", ...args], {
      shell: false,
      windowsHide: true,
    });
    let errors = "";
    child.stderr.on("data", (b) => {
      errors = (errors + b).slice(-4000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) return resolve();
      log(errors);
      reject(new Error(`FFmpeg wurde mit Code ${code} beendet.`));
    });
  });
}

async function lastTake(folder) {
  const takes = (await readdir(folder, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && /^take\d+$/i.test(e.name))
    .map((e) => e.name)
    .sort();
  if (!takes.length) throw new Error("Raw files not found: HLAE hat keine Aufnahme angelegt.");
  return path.join(folder, takes.at(-1));
}

/** Je Szene HLAE-Video mit Spielton zusammenführen (wie generateVideoWithFFmpeg in CSDM). */
export async function encodeSequences(recording, ffmpegExe, log = () => {}, ffmpeg = runFfmpeg) {
  const files = [];
  const ff = recording.ffmpegSettings;
  for (const s of recording.sequences) {
    const folder = path.join(recording.outputFolderPath, sequenceName(s));
    const video = path.join(folder, `video.${ff.videoContainer}`);
    if (!existsSync(video)) throw new Error("Raw files not found: Szene ohne Video.");
    const output = sequenceOutputFile(recording.outputFolderPath, s);
    if (s.recordAudio) {
      const take = await lastTake(folder);
      const wav = path.join(take, "audio.wav");
      if (!existsSync(wav)) throw new Error("Raw files not found: Szene ohne Ton.");
      const audio = path.join(take, "audio.m4a");
      await ffmpeg(ffmpegExe, ["-y", "-i", wav, "-acodec", ff.audioCodec, "-b:a", `${ff.audioBitrate}K`, audio], log);
      await ffmpeg(ffmpegExe, ["-y", "-i", video, "-i", audio, "-c", "copy", "-map", "0:v:0", "-map", "1:a:0", output], log);
    } else await ffmpeg(ffmpegExe, ["-y", "-i", video, "-c", "copy", "-map", "0:v:0", output], log);
    await rm(folder, { recursive: true, force: true });
    files.push(output);
  }
  if (!recording.concatenateSequences || files.length < 2) return files;
  const list = path.join(recording.outputFolderPath, "videos.txt");
  await writeFile(list, files.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join("\n"), "utf8");
  const final = path.join(recording.outputFolderPath, "tecmon-highlight.mp4");
  await ffmpeg(ffmpegExe, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", final], log);
  await Promise.all([list, ...files].map((f) => rm(f, { force: true })));
  return [final];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** CS2 über HLAE mit der Demo starten und warten, bis CS2 wieder geschlossen ist. */
async function playInCs2({ installation, cs2Exe, demo, width, height, extra = "", system, log, label, limit = 90 }) {
  const isRunning = system.isRunning || tasklist;
  const launch = system.launch || ((exe, args, env) => spawn(exe, args, { shell: false, windowsHide: true, env }));
  const wait = system.sleep || sleep;
  log("CS2 über HLAE starten …");
  const env = {
    ...process.env,
    USRLOCALCSGO: configDir(installation),
  };
  const child = launch(installation.hlaeExe, hlaeArgs({ hlaeExe: installation.hlaeExe, cs2Exe, demo, width, height, extra }), env);
  const hlaeCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (hlaeCode !== 0) throw new Error(`HLAE wurde mit Code ${hlaeCode} beendet.`);
  await wait(2000);
  if (!(await isRunning("cs2.exe"))) throw new Error("CS2 ist nicht gestartet. HLAE-/Plugin-Protokoll prüfen.");
  log(label);
  const deadline = Date.now() + limit * 60 * 1000;
  while (await isRunning("cs2.exe")) {
    if (Date.now() > deadline) throw new Error("Zeitlimit erreicht. CS2 bitte schließen.");
    await wait(2000);
  }
}

/** Eigener CS2-Konfigurationsordner (USRLOCALCSGO), getrennt von den Einstellungen des Nutzers. */
const configDir = (installation) => path.join(path.dirname(installation.profileDir), "hlae-config");

/**
 * Komplette Aufnahme. `system` lässt sich für Tests ersetzen
 * (Prozessliste, Prozessstart, FFmpeg, Plugin-Download).
 */
export async function recordInternal({
  recording,
  job,
  demo,
  installation,
  cs2Exe,
  cameras = [],
  cacheDir,
  log = () => {},
  system = {},
}) {
  const isRunning = system.isRunning || tasklist;
  const slots = jobSlots(job);
  if (!slots) throw new Error("Spieler-Slots fehlen im Auftrag.");
  if (!cs2Exe || !existsSync(cs2Exe)) throw new Error("CS2 wurde nicht gefunden.");
  for (const exe of [installation.hlaeExe, installation.ffmpegExe])
    if (!existsSync(exe)) throw new Error(`${path.basename(exe)} fehlt. Companion-Einrichtung reparieren.`);
  if (!(await isRunning("steam.exe"))) throw new Error("Steam läuft nicht. Steam starten und anmelden.");
  if (await isRunning("cs2.exe")) throw new Error("CS2 läuft bereits. Bitte CS2 schließen und erneut starten.");
  const root = cs2Root(cs2Exe);
  const actionsFile = `${unix(demo)}.json`;
  const scriptFile = needsScript(job) ? `${unix(demo)}.tecmon-camera.js` : "";
  if (scriptFile) {
    await writeFile(scriptFile, scriptSource(scriptPlan(job)), "utf8");
    log("Kameraskript für Kamerafahrten und Verfolger-Kamera geschrieben.");
  }
  const actions = buildActions(recording, { tickRate: job.tickRate, slots, cameras, script: scriptFile });
  await writeFile(actionsFile, JSON.stringify(actions, null, 2));
  log("Aufnahmeplan für das CS2-Plugin geschrieben.");
  const bytes = system.plugin ? await system.plugin() : await pluginBytes(cacheDir, system.request);
  try {
    await installPlugin(root, bytes);
    await registerFfmpeg(installation.hlaeExe, installation.ffmpegExe);
    await playInCs2({ installation, cs2Exe, demo, width: recording.width, height: recording.height, system, log, label: "CS2 nimmt auf …" });
  } finally {
    await uninstallPlugin(root).catch(() => {});
    await rm(actionsFile, { force: true }).catch(() => {});
    if (scriptFile) await rm(scriptFile, { force: true }).catch(() => {});
  }
  log("Szenen mit FFmpeg zusammenführen …");
  return encodeSequences(recording, installation.ffmpegExe, log, system.ffmpeg);
}

/** Ist alles für den eigenen Weg vorhanden? */
export async function internalReady(installation, cs2Exe, job) {
  if (!installation || process.platform !== "win32" || !jobSlots(job)) return false;
  if (!cs2Exe || !existsSync(cs2Exe)) return false;
  for (const exe of [installation.hlaeExe, installation.ffmpegExe])
    if (!(await stat(exe).then((s) => s.isFile(), () => false))) return false;
  return true;
}

/**
 * „Kamera im Spiel setzen“: Demo in CS2 am gewünschten Tick öffnen und
 * anhalten. Der Nutzer fliegt mit der HLAE-Freikamera (`mirv_input camera`,
 * WASD, R/F hoch/runter) und merkt Punkte mit F8 oder `tecmon_mark`. Nach dem
 * Schließen von CS2 liest der Companion die Punkte aus `console.log`.
 * Läuft mit eigenem CS2-Konfigurationsordner, die Tastenbelegung des Nutzers
 * bleibt unberührt.
 */
export async function cameraSession({ demo, tick: startTick, installation, cs2Exe, cacheDir, log = () => {}, system = {} }) {
  const isRunning = system.isRunning || tasklist;
  if (!Number.isSafeInteger(startTick) || startTick < 0 || startTick > 100_000_000) throw new Error("Ungültiger Zeitpunkt.");
  if (!cs2Exe || !existsSync(cs2Exe)) throw new Error("CS2 wurde nicht gefunden.");
  if (!existsSync(installation.hlaeExe)) throw new Error("hlae.exe fehlt. Companion-Einrichtung reparieren.");
  if (!(await isRunning("steam.exe"))) throw new Error("Steam läuft nicht. Steam starten und anmelden.");
  if (await isRunning("cs2.exe")) throw new Error("CS2 läuft bereits. Bitte CS2 schließen und erneut starten.");
  const root = cs2Root(cs2Exe);
  const logs = [path.join(root, "game", "csgo", "console.log"), path.join(configDir(installation), "console.log")];
  // Nur neue Zeilen lesen: bestehende console.log nie löschen.
  const offsets = await Promise.all(logs.map((f) => stat(f).then((s) => s.size, () => 0)));
  const actionsFile = `${unix(demo)}.json`;
  const scriptFile = `${unix(demo)}.tecmon-camera.js`;
  await writeFile(scriptFile, scriptSource({ v: 1, tickRate: 64, segments: [] }), "utf8");
  const at = tick(startTick);
  const actions = [
    {
      actions: [
        { tick: MIN_TICK, cmd: "sv_cheats 1" },
        { tick: MIN_TICK, cmd: "volume 0.3" },
        { tick: MIN_TICK, cmd: `mirv_script_load "${safePath(scriptFile)}"` },
        { tick: MIN_TICK, cmd: `bind "F8" "${MARK_COMMAND}"` },
        { tick: MIN_TICK, cmd: `demo_gototick ${at}` },
        { tick: at + 8, cmd: "demo_pause" },
        { tick: at + 8, cmd: "mirv_input camera" },
        { tick: at + 8, cmd: 'echo "TecMon: Mit WASD fliegen, R/F hoch/runter, Pfeiltasten schauen. F8 merkt den Punkt. CS2 schließen, wenn fertig."' },
      ],
    },
  ];
  await writeFile(actionsFile, JSON.stringify(actions, null, 2));
  const bytes = system.plugin ? await system.plugin() : await pluginBytes(cacheDir, system.request);
  try {
    await installPlugin(root, bytes);
    await playInCs2({
      installation,
      cs2Exe,
      demo,
      width: 1280,
      height: 720,
      extra: " -condebug",
      system,
      log,
      label: "CS2 ist offen: Kamera platzieren und mit F8 merken, danach CS2 schließen.",
      limit: 60,
    });
  } finally {
    await uninstallPlugin(root).catch(() => {});
    await rm(actionsFile, { force: true }).catch(() => {});
    await rm(scriptFile, { force: true }).catch(() => {});
  }
  let text = "";
  for (let i = 0; i < logs.length; i++) {
    const content = await readFile(logs[i]).catch(() => null);
    if (content && content.length > offsets[i]) text += content.subarray(offsets[i]).toString("utf8") + "\n";
  }
  const marks = parseMarks(text);
  log(marks.length ? `${marks.length} Kamerapunkt(e) übernommen.` : "Kein Kamerapunkt gemerkt.");
  return marks;
}
