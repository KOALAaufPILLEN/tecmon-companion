import { shareCode } from "./share-code.mjs";
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
    return {
      startTick: s.startTick,
      endTick: s.endTick,
      steamId: s.steamId,
      playerName: text(s.playerName, 64) || "Spieler",
      ...(s.slot === undefined ? {} : { slot: s.slot }),
      ...(cuts.length ? { cuts } : {}),
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
    if (c.kind !== "free") fail();
    return {
      tick: c.tick,
      kind: "free",
      x: Math.round(num(c.x, COORD) * 100) / 100,
      y: Math.round(num(c.y, COORD) * 100) / 100,
      z: Math.round(num(c.z, COORD) * 100) / 100,
      pitch: Math.round(num(c.pitch, 89) * 100) / 100,
      yaw: Math.round(num(c.yaw, 360) * 100) / 100,
    };
  });
}

/** Feste Kamerapunkte eines Auftrags mit den IDs, unter denen sie in CS Demo Manager liegen. */
export function jobCameras(job, newId) {
  const list = [];
  job.sequences.forEach((s, i) =>
    (s.cuts || []).forEach((c, j) => {
      if (c.kind !== "free") return;
      list.push({ sequence: i, tick: c.tick, id: newId(), name: `TecMon ${i + 1}.${j + 1}`, x: c.x, y: c.y, z: c.z, pitch: c.pitch, yaw: c.yaw });
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
        ...(s.cuts?.[0]?.kind === "free" && s.cuts[0].tick === s.startTick
          ? []
          : [{ tick: s.startTick, playerSteamId: s.steamId, playerName: s.playerName }]),
        ...(s.cuts || [])
          .filter((c) => c.kind === "player")
          .map((c) => ({ tick: c.tick, playerSteamId: s.steamId, playerName: s.playerName })),
      ],
      cameras: cameras
        .filter((c) => c.sequence === i)
        .map((c) => ({ tick: c.tick, id: c.id, name: c.name, color: "#ffd23f" })),
    })),
  };
}
