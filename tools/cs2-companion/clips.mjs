import path from "node:path";
import { mkdir, readdir, stat, rm, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * Clip-Puffer: nimmt den Bildschirm laufend in kurzen Stücken auf (Ringpuffer)
 * und speichert auf Wunsch die letzten Sekunden als Clip. Er greift nicht in
 * Spiele ein: FFmpeg liest nur das Windows-Bild (Desktop Duplication), wie OBS.
 * Standardmäßig aus. Der Ringpuffer wird beim Ausschalten und beim Start gelöscht.
 */
export const CLIP_CAPABILITY = "clips-v1";
export const SEGMENT_SECONDS = 2;
export const SECONDS = [10, 120];
export const FPS = [30, 60];
export const HEIGHTS = [0, 720, 1080];
/** Reihenfolge der Encoder: Grafikkarte zuerst, damit das Spiel kaum Leistung verliert. */
export const ENCODERS = ["h264_nvenc", "h264_amf", "h264_qsv", "libx264"];
export const CLIP_FILE = /^clip-\d{8}-\d{6}(?:-\d{1,2})?\.mp4$/;
export const brandedName = (id) => id.replace(/\.mp4$/, "-tecmon.mp4");
const DEFAULTS = { enabled: false, seconds: 30, fps: 30, height: 1080, audioDevice: "" };
const MAX_CLIPS = 200;

const cleanDevice = (value) =>
  String(value || "")
    .replace(/[\x00-\x1f"\\]/g, "")
    .trim()
    .slice(0, 120);

export function cleanClipSettings(input = {}, previous = DEFAULTS) {
  const next = { ...DEFAULTS, ...previous };
  if (typeof input.enabled === "boolean") next.enabled = input.enabled;
  if (input.seconds !== undefined) {
    const seconds = Math.round(Number(input.seconds));
    if (!Number.isFinite(seconds) || seconds < SECONDS[0] || seconds > SECONDS[1])
      throw new Error(`Clip-Länge muss zwischen ${SECONDS[0]} und ${SECONDS[1]} Sekunden liegen.`);
    next.seconds = seconds;
  }
  if (input.fps !== undefined) {
    if (!FPS.includes(Number(input.fps))) throw new Error("Bildrate muss 30 oder 60 sein.");
    next.fps = Number(input.fps);
  }
  if (input.height !== undefined) {
    if (!HEIGHTS.includes(Number(input.height))) throw new Error("Auflösung muss 720p, 1080p oder Bildschirm sein.");
    next.height = Number(input.height);
  }
  if (input.audioDevice !== undefined) next.audioDevice = cleanDevice(input.audioDevice);
  return next;
}

function encoderArgs(encoder, fps) {
  const gop = ["-g", String(fps * SEGMENT_SECONDS), "-keyint_min", String(fps * SEGMENT_SECONDS)];
  if (encoder === "h264_nvenc") return ["-c:v", encoder, "-preset", "p4", "-rc", "vbr", "-cq", "23", "-b:v", "0", "-forced-idr", "1", ...gop];
  if (encoder === "h264_amf") return ["-c:v", encoder, "-quality", "balanced", "-rc", "cqp", "-qp_i", "22", "-qp_p", "24", ...gop];
  if (encoder === "h264_qsv") return ["-c:v", encoder, "-preset", "veryfast", "-global_quality", "24", ...gop];
  return ["-c:v", "libx264", "-preset", "superfast", "-crf", "23", "-sc_threshold", "0", ...gop];
}

/** Ringpuffer-Aufnahme. Jedes Stück ist SEGMENT_SECONDS lang und beginnt mit einem Keyframe. */
export function ringArgs({ fps, height, audioDevice, encoder, wrap }) {
  const scale = height ? `,scale=-2:${height}:flags=bicubic` : "";
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `ddagrab=output_idx=0:framerate=${fps}:draw_mouse=1`,
    ...(audioDevice ? ["-f", "dshow", "-i", `audio=${audioDevice}`] : []),
    "-vf",
    `hwdownload,format=bgra${scale},format=yuv420p`,
    ...encoderArgs(encoder, fps),
    "-force_key_frames",
    `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    ...(audioDevice ? ["-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"] : ["-an"]),
    "-f",
    "segment",
    "-segment_time",
    String(SEGMENT_SECONDS),
    "-segment_wrap",
    String(wrap),
    "-segment_format",
    "mpegts",
    "-reset_timestamps",
    "1",
    "seg%03d.ts",
  ];
}

/** Audio-Geräte aus `ffmpeg -list_devices true -f dshow -i dummy` (Ausgabe auf stderr). */
export function parseAudioDevices(text) {
  const devices = [];
  for (const match of String(text).matchAll(/"([^"\r\n]{1,120})"\s*\(audio\)/g)) devices.push(cleanDevice(match[1]));
  return [...new Set(devices.filter(Boolean))];
}

const stamp = (date) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
};

function runOnce(spawnProcess, exe, args, cwd, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(exe, args, { cwd, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    child.stderr?.on("data", (d) => (errors = (errors + d).slice(-4000)));
    const timer = setTimeout(() => child.kill(), timeout);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(errors);
      else reject(Object.assign(new Error(errors.trim().split("\n").pop() || `FFmpeg-Fehler ${code}`), { output: errors }));
    });
  });
}

export async function createClips({ dir, settingsDir = dir, ffmpeg, spawnProcess = nodeSpawn, now = () => new Date(), settleMs = 4000 }) {
  const clipsDir = path.join(dir, "Clips");
  const ringDir = path.join(clipsDir, "puffer");
  const settingsFile = path.join(settingsDir, "clips.json");
  await mkdir(clipsDir, { recursive: true });
  await rm(ringDir, { recursive: true, force: true });
  let settings = { ...DEFAULTS };
  try {
    settings = cleanClipSettings(JSON.parse(await readFile(settingsFile, "utf8")));
  } catch {
    /* noch nichts gespeichert */
  }
  let child = null;
  let encoder = "";
  let error = "";
  let stopping = false;
  const meta = new Map();

  async function save() {
    const temporary = `${settingsFile}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(settings), { mode: 0o600 });
    await rename(temporary, settingsFile);
  }
  const wrap = () => Math.ceil(SECONDS[1] / SEGMENT_SECONDS) + 4;

  function launch(candidate) {
    return new Promise((resolve, reject) => {
      const args = ringArgs({ ...settings, encoder: candidate, wrap: wrap() });
      const proc = spawnProcess(ffmpeg, args, { cwd: ringDir, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      let errors = "";
      let settled = false;
      proc.stderr?.on("data", (d) => (errors = (errors + d).slice(-4000)));
      const timer = setTimeout(() => {
        settled = true;
        resolve(proc);
      }, settleMs);
      proc.on("error", (e) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(e);
        }
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new Error(errors.trim().split("\n").pop() || `FFmpeg beendet (${code})`));
          return;
        }
        if (child === proc) {
          child = null;
          if (!stopping) error = "Der Clip-Puffer wurde unerwartet beendet. " + (errors.trim().split("\n").pop() || "");
        }
      });
    });
  }

  async function start() {
    if (child) return;
    if (!ffmpeg) throw new Error("FFmpeg fehlt. Der Clip-Puffer braucht den installierten Windows-Companion.");
    await rm(ringDir, { recursive: true, force: true });
    await mkdir(ringDir, { recursive: true });
    error = "";
    stopping = false;
    let last = null;
    for (const candidate of ENCODERS) {
      try {
        child = await launch(candidate);
        encoder = candidate;
        return;
      } catch (e) {
        last = e;
        await rm(ringDir, { recursive: true, force: true });
        await mkdir(ringDir, { recursive: true });
      }
    }
    error = "Bildschirmaufnahme konnte nicht starten: " + (last?.message || "unbekannt");
    throw new Error(error);
  }

  async function stop() {
    stopping = true;
    const proc = child;
    child = null;
    encoder = "";
    if (proc) {
      await new Promise((resolve) => {
        const done = setTimeout(resolve, 3000);
        proc.once("close", () => {
          clearTimeout(done);
          resolve();
        });
        proc.kill();
      });
    }
    // Der Puffer enthält Bildschirminhalt: nie liegen lassen.
    await rm(ringDir, { recursive: true, force: true });
  }

  async function list() {
    const names = (await readdir(clipsDir).catch(() => [])).filter((n) => CLIP_FILE.test(n));
    const clips = [];
    for (const id of names) {
      const info = await stat(path.join(clipsDir, id)).catch(() => null);
      if (!info) continue;
      const branded = await stat(path.join(clipsDir, brandedName(id))).catch(() => null);
      const extra = meta.get(id) || {};
      clips.push({
        id,
        size: info.size,
        time: info.mtimeMs,
        branded: !!branded && extra.status !== "branding",
        status: extra.status || (branded ? "ready" : "raw"),
        ...(extra.error ? { error: extra.error } : {}),
        ...(extra.title ? { title: extra.title } : {}),
        ...(extra.game ? { game: extra.game } : {}),
      });
    }
    return clips.sort((a, b) => b.time - a.time);
  }

  function clipPath(id, branded = false) {
    if (typeof id !== "string" || !CLIP_FILE.test(id)) throw new Error("Clip nicht gefunden.");
    return path.join(clipsDir, branded ? brandedName(id) : id);
  }

  return {
    dir: clipsDir,
    state: () => ({
      ...settings,
      recording: !!child,
      encoder,
      error,
      available: !!ffmpeg,
      hotkey: "Strg+Alt+C",
    }),
    get: () => ({ ...settings }),
    async setSettings(input) {
      const next = cleanClipSettings(input, settings);
      const restart = !!child && ["seconds", "fps", "height", "audioDevice"].some((k) => next[k] !== settings[k]);
      settings = next;
      await save();
      if (!settings.enabled) await stop();
      else if (!child) await start();
      else if (restart) {
        await stop();
        await start();
      }
      return this.state();
    },
    /** Beim Start des Companions: eingeschaltet gespeichert → Puffer wieder starten. */
    async resume() {
      if (settings.enabled && ffmpeg) await start().catch(() => {});
    },
    stop,
    async devices() {
      if (!ffmpeg) return [];
      const output = await runOnce(spawnProcess, ffmpeg, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], clipsDir, 15000).catch((e) => e.output || "");
      return parseAudioDevices(output);
    },
    /** Letzte `seconds` aus dem Puffer als eigenen Clip speichern. */
    async save(seconds = settings.seconds) {
      if (!child) throw new Error("Der Clip-Puffer ist aus. Zuerst einschalten.");
      seconds = Math.max(SECONDS[0], Math.min(SECONDS[1], Math.round(Number(seconds)) || settings.seconds));
      if ((await list()).length >= MAX_CLIPS) throw new Error(`Höchstens ${MAX_CLIPS} Clips. Alte Clips zuerst löschen.`);
      const segments = [];
      for (const name of await readdir(ringDir).catch(() => [])) {
        if (!/^seg\d{3}\.ts$/.test(name)) continue;
        const info = await stat(path.join(ringDir, name)).catch(() => null);
        if (info && info.size > 0) segments.push({ name, time: info.mtimeMs });
      }
      segments.sort((a, b) => a.time - b.time);
      segments.pop(); // Das neueste Stück wird noch geschrieben.
      const wanted = segments.slice(-Math.ceil(seconds / SEGMENT_SECONDS));
      if (!wanted.length) throw new Error("Noch zu wenig aufgenommen. In ein paar Sekunden erneut versuchen.");
      let id = `clip-${stamp(now())}.mp4`;
      for (let i = 2; (await stat(path.join(clipsDir, id)).catch(() => null)) && i < 100; i++)
        id = `clip-${stamp(now())}-${i}.mp4`;
      const listName = `liste-${randomUUID()}.txt`;
      await writeFile(path.join(ringDir, listName), wanted.map((s) => `file '${s.name}'`).join("\n"));
      const output = path.join(clipsDir, id);
      try {
        await runOnce(
          spawnProcess,
          ffmpeg,
          ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "concat", "-safe", "1", "-i", listName, "-c", "copy", ...(settings.audioDevice ? ["-bsf:a", "aac_adtstoasc"] : []), "-movflags", "+faststart", output],
          ringDir,
        );
      } finally {
        await unlink(path.join(ringDir, listName)).catch(() => {});
      }
      return { id, seconds: wanted.length * SEGMENT_SECONDS };
    },
    list,
    clipPath,
    setMeta(id, value) {
      clipPath(id);
      meta.set(id, { ...(meta.get(id) || {}), ...value });
    },
    async remove(id) {
      await unlink(clipPath(id)).catch(() => {});
      await unlink(clipPath(id, true)).catch(() => {});
      meta.delete(id);
    },
  };
}
