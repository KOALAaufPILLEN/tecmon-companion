import { shareCode } from "./share-code.mjs";
/** Webseiten dürfen je Szene eine Beschreibung mitschicken (`label`). */
export const LABEL_CAPABILITY = "scene-label-v1";
const SCENE_LABEL_MAX = 40;
/** Versioned, data-only exchange format. Never accept game commands or paths here. */
export function validateJob(value) {
  const fail = () => {
    throw new Error("Ungültiger TecMon-Auftrag. Bitte erneut auf der Webseite exportieren.");
  };
  if (!value || value.format !== "tecmon-cs2-job" || value.version !== 1) fail();
  if (!Number.isFinite(value.tickRate) || value.tickRate < 16 || value.tickRate > 128) fail();
  if (!Array.isArray(value.sequences) || !value.sequences.length || value.sequences.length > 40)
    fail();
  const text = (v, max) =>
    typeof v === "string" ? v.replace(/[\x00-\x1f<>]/g, "").slice(0, max) : "";
  const style = value.branding ?? {};
  if (!style || typeof style !== "object" || Array.isArray(style)) fail();
  for (const field of ["enabled", "intro", "outro"])
    if (style[field] !== undefined && typeof style[field] !== "boolean") fail();
  const branding = {
    enabled: style.enabled !== false,
    intro: style.intro !== false,
    outro: style.outro === true,
    subtitle: text(style.subtitle, 100),
  };
  // X-Ray (Gegner durch Waende) ist Standard; nur ein ausdrueckliches false schaltet es ab.
  if (value.xray !== undefined && typeof value.xray !== "boolean") fail();
  const xray = value.xray !== false;
  let ticks = 0;
  const sequences = value.sequences.map((s) => {
    if (
      !s ||
      !Number.isSafeInteger(s.startTick) ||
      !Number.isSafeInteger(s.endTick) ||
      s.startTick < 0 ||
      s.endTick <= s.startTick ||
      s.endTick > 100_000_000
    )
      fail();
    if (typeof s.steamId !== "string" || !/^\d{17}$/.test(s.steamId)) fail();
    const account = BigInt(s.steamId) - 76561197960265728n;
    if (account < 1n || account > 4294967295n) fail();
    // spec_player-Wert des Spielers (Controller-Index, 1-64). Optional: ältere Webseiten senden ihn nicht.
    if (s.slot !== undefined && (!Number.isSafeInteger(s.slot) || s.slot < 1 || s.slot > 64)) fail();
    ticks += s.endTick - s.startTick;
    const cuts = cameraCuts(s.cuts, s.startTick, s.endTick, fail);
    // Beschreibung der Szene fürs Video (scene-label-v1). Optional, nur Text, höchstens 40 Zeichen.
    if (s.label !== undefined && typeof s.label !== "string") fail();
    const label = text(s.label, SCENE_LABEL_MAX).replace(/\s+/g, " ").trim();
    return {
      startTick: s.startTick,
      endTick: s.endTick,
      steamId: s.steamId,
      playerName: text(s.playerName, 64) || "Spieler",
      ...(s.slot === undefined ? {} : { slot: s.slot }),
      ...(cuts.length ? { cuts } : {}),
      ...(label ? { label } : {}),
    };
  });
  if (ticks / value.tickRate > 1200)
    throw new Error("Ein Auftrag darf höchstens 20 Minuten enthalten.");
  return {
    format: "tecmon-cs2-job",
    version: 1,
    title: text(value.title, 100) || "Highlights",
    map: text(value.map, 64),
    tickRate: value.tickRate,
    ...(value.shareCode === undefined ? {} : { shareCode: shareCode(value.shareCode) }),
    sequences,
    branding,
    xray,
  };
}

/**
 * Kameraschnitte innerhalb einer Szene: "free" springt auf einen festen Punkt
 * (Position in Spieleinheiten, Blick in Grad), "player" zurueck in die
 * Egoansicht des Szenen-Spielers. Nur Zahlen, keine Befehle.
 */
export const MAX_CUTS = 12;
const COORD = 65536;
function cameraCuts(value, startTick, endTick, fail) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_CUTS) fail();
  const num = (v, max) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max ? v : fail());
  let last = -1;
  return value.map((c) => {
    if (!c || typeof c !== "object" || !Number.isSafeInteger(c.tick)) fail();
    if (c.tick < startTick || c.tick >= endTick || c.tick < last) fail();
    last = c.tick;
    if (c.kind === "player") return { tick: c.tick, kind: "player" };
    if (c.kind === "free") return { tick: c.tick, kind: "free", ...view(c, num) };
    if (c.kind === "follow") {
      const range = (v, min, max) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : fail());
      return {
        tick: c.tick,
        kind: "follow",
        distance: range(c.distance, FOLLOW.distance[0], FOLLOW.distance[1]),
        height: range(c.height, FOLLOW.height[0], FOLLOW.height[1]),
        orbit: range(c.orbit, FOLLOW.orbit[0], FOLLOW.orbit[1]),
        // Startwinkel um den Spieler (180 = von vorn, Spieler-Intro); fehlt bei älteren Webseiten.
        angle: c.angle === undefined ? 0 : range(c.angle, FOLLOW.angle[0], FOLLOW.angle[1]),
      };
    }
    if (c.kind !== "path" || !Array.isArray(c.keys) || c.keys.length < 2 || c.keys.length > MAX_KEYS) fail();
    let previous = c.tick - 1;
    const keys = c.keys.map((k) => {
      if (!k || typeof k !== "object" || !Number.isSafeInteger(k.tick) || k.tick <= previous || k.tick > endTick) fail();
      previous = k.tick;
      return { tick: k.tick, ...view(k, num) };
    });
    if (keys[0].tick !== c.tick) fail();
    return { tick: c.tick, kind: "path", keys };
  });
}

/** Position in Spieleinheiten und Blick in Grad, auf zwei Nachkommastellen. */
function view(c, num) {
  return {
    x: Math.round(num(c.x, COORD) * 100) / 100,
    y: Math.round(num(c.y, COORD) * 100) / 100,
    z: Math.round(num(c.z, COORD) * 100) / 100,
    pitch: Math.round(num(c.pitch, 89) * 100) / 100,
    yaw: Math.round(num(c.yaw, 360) * 100) / 100,
  };
}

/**
 * Kamerafahrten ("path") und Verfolger-Kamera ("follow") steuert das
 * TecMon-Skript in HLAE. Nur die eigene Engine kann das; über CS Demo Manager
 * wird eine Fahrt zum festen Punkt am ersten Wegpunkt und die Verfolger-Kamera
 * zur Egoansicht.
 */
export const MAX_KEYS = 8;
export const FOLLOW = { distance: [40, 800], height: [-200, 400], orbit: [-180, 180], angle: [-180, 180] };
export const scriptedCut = (c) => c.kind === "path" || c.kind === "follow";
export const needsScript = (job) => job.sequences.some((s) => (s.cuts || []).some(scriptedCut));

/** Feste Kamerapunkte eines Auftrags mit den IDs, unter denen sie in CS Demo Manager liegen. */
export function jobCameras(job, newId) {
  const list = [];
  job.sequences.forEach((s, i) =>
    (s.cuts || []).forEach((c, j) => {
      // Eine Kamerafahrt beginnt am ersten Wegpunkt; dorthin springt auch CS Demo Manager.
      const p = c.kind === "free" ? c : c.kind === "path" ? c.keys[0] : null;
      if (!p) return;
      list.push({ sequence: i, tick: c.tick, id: newId(), name: `TecMon ${i + 1}.${j + 1}`, x: p.x, y: p.y, z: p.z, pitch: p.pitch, yaw: p.yaw });
    }),
  );
  return list;
}

export function recordingConfig(job, demoPath, outputFolderPath, quality, cameras = []) {
  job = validateJob(job);
  return {
    demoPath,
    outputFolderPath,
    recordingSystem: "HLAE",
    recordingOutput: "video",
    encoderSoftware: "FFmpeg",
    width: quality === "1080p60" ? 1920 : 1280,
    height: quality === "1080p60" ? 1080 : 720,
    framerate: quality === "1080p60" ? 60 : 30,
    closeGameAfterRecording: true,
    concatenateSequences: true,
    ffmpegSettings: {
      audioBitrate: 192,
      constantRateFactor: 20,
      customLocationEnabled: false,
      customExecutableLocation: "",
      videoContainer: "mp4",
      videoCodec: "libx264",
      audioCodec: "aac",
      inputParameters: "",
      outputParameters: "",
    },
    sequences: job.sequences.map((s, i) => ({
      number: i + 1,
      startTick: s.startTick,
      endTick: s.endTick,
      showOnlyDeathNotices: false,
      deathNoticesDuration: 5,
      showXRay: job.xray,
      showAssists: true,
      playerVoicesEnabled: false,
      recordAudio: true,
      playersOptions: [
        {
          steamId: s.steamId,
          playerName: s.playerName.replace(/[";\\]/g, ""),
          showKill: true,
          highlightKill: false,
          isVoiceEnabled: false,
        },
      ],
      playerCameras: [
        // Beginnt die Szene mit einem festen Punkt, nicht vorher noch auf den Spieler schalten.
        ...(["free", "path"].includes(s.cuts?.[0]?.kind) && s.cuts[0].tick === s.startTick
          ? []
          : [{ tick: s.startTick, playerSteamId: s.steamId, playerName: s.playerName }]),
        // Die Verfolger-Kamera schaut auf den Szenen-Spieler; HUD und Name bleiben seine.
        ...(s.cuts || [])
          .filter((c) => c.kind === "player" || (c.kind === "follow" && c.tick !== s.startTick))
          .map((c) => ({ tick: c.tick, playerSteamId: s.steamId, playerName: s.playerName })),
      ],
      cameras: cameras
        .filter((c) => c.sequence === i)
        .map((c) => ({ tick: c.tick, id: c.id, name: c.name, color: "#ffd23f" })),
    })),
  };
}
