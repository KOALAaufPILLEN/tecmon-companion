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
    ticks += s.endTick - s.startTick;
    return {
      startTick: s.startTick,
      endTick: s.endTick,
      steamId: s.steamId,
      playerName: text(s.playerName, 64) || "Spieler",
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
  };
}

export function recordingConfig(job, demoPath, outputFolderPath, quality) {
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
      showXRay: false,
      showAssists: true,
      playerVoicesEnabled: false,
      recordAudio: true,
      cameras: [],
      playersOptions: [
        {
          steamId: s.steamId,
          playerName: s.playerName.replace(/[";\\]/g, ""),
          showKill: true,
          highlightKill: false,
          isVoiceEnabled: false,
        },
      ],
      playerCameras: [{ tick: s.startTick, playerSteamId: s.steamId, playerName: s.playerName }],
    })),
  };
}
