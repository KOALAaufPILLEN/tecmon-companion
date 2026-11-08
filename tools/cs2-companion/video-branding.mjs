import path from "node:path";
import { readFile, writeFile, mkdir, mkdtemp, rm, rename, lstat, realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { sha256, BRANDING_FILES } from "./branding-assets.mjs";
import { validateJob } from "./job.mjs";
import { runTool } from "./managed-installation.mjs";

export const visualPlayerName = (value) =>
  String(value)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N} ._+\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64) || "Spieler";
export function brandingTitle(job) {
  const players = [
    ...new Map(job.sequences.map((s) => [s.steamId, visualPlayerName(s.playerName)])).values(),
  ];
  return {
    title: players.length === 1 ? `${players[0]} · HIGHLIGHTS` : "TEAM-HIGHLIGHTS",
    players: players.join(" × "),
  };
}
export function sequenceFile(sequence, index) {
  return `sequence-${index + 1}-tick-${sequence.startTick}-to-${sequence.endTick}.mp4`;
}
const mapLabel = (value) =>
  value.toLowerCase() === "de_dust2" ? "DUST II" : value.replace(/^(de|cs|ar)_/i, "").toUpperCase();
const clipText = (value, max = 100) =>
  String(value)
    .replace(/[\x00-\x1f]/g, " ")
    .slice(0, max);
const fileHash = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};
export async function probeVideo(exe, file) {
  const result = JSON.parse(
    await runTool(path.join(path.dirname(exe), "ffprobe.exe"), [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,width,height,r_frame_rate:format=duration",
      "-of",
      "json",
      file,
    ]),
  );
  const video = result.streams?.find((s) => s.codec_type === "video");
  const duration = Number(result.format?.duration);
  if (
    !video ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 1250 ||
    !Number.isInteger(video.width) ||
    video.width < 320 ||
    video.width > 3840 ||
    !Number.isInteger(video.height) ||
    video.height < 240 ||
    video.height > 2160
  )
    throw new Error("Ungültiges Aufnahmeformat für Branding.");
  const [a, b] = String(video.r_frame_rate).split("/").map(Number);
  const fps = a / b > 45 ? 60 : 30;
  return {
    width: video.width,
    height: video.height,
    fps,
    duration,
    audio: result.streams.some((s) => s.codec_type === "audio"),
  };
}

/** Native helper hashes open handles and denies writes/deletion until FFmpeg exits. */
export async function lockedFfmpeg({ launcher, exe, cwd, args, files }) {
  if (process.platform !== "win32")
    throw new Error("Geschütztes Video-Branding benötigt den Windows-Companion.");
  return runTool(launcher, ["--render-locked"], {
    input: JSON.stringify({ exe, cwd, args, files, timeout: 1800000 }),
    timeout: 1860000,
  });
}

export async function renderBranding({
  job,
  directory,
  assets,
  ffmpeg,
  launcher,
  progress = () => {},
  execute = lockedFfmpeg,
  probe = probeVideo,
}) {
  job = validateJob(job);
  if (!job.branding.enabled) throw new Error("Branding ist für diesen Auftrag deaktiviert.");
  const workingRoot = path.join(directory, "branding-work");
  await mkdir(workingRoot, { recursive: true });
  const work = await mkdtemp(path.join(workingRoot, "render-"));
  // Same user's other processes are blocked from modifying open inputs by the native helper.
  // ACL additionally keeps other normal Windows accounts out of generated text and asset files.
  if (process.platform === "win32" && execute === lockedFfmpeg)
    await runTool(launcher, ["--private", work]);
  const artifacts = new Map();
  async function artifact(name, value) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
    const file = path.join(work, name);
    await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
    const item = { path: file, sha256: sha256(bytes) };
    artifacts.set(name, item);
    return name;
  }
  try {
    for (const [name, hash] of Object.entries(BRANDING_FILES)) {
      if (!Buffer.isBuffer(assets[name]) || sha256(assets[name]) !== hash)
        throw new Error("Branding-Arbeitskopie stimmt nicht mit der festen Prüfsumme überein.");
      await artifact(name, assets[name]);
    }
    const directoryReal = await realpath(directory);
    const sources = [];
    for (let i = 0; i < job.sequences.length; i++) {
      const file = path.join(directory, sequenceFile(job.sequences[i], i));
      if (!(await lstat(file)).isFile())
        throw new Error("Aufnahmesequenz fehlt oder ist keine reguläre Datei.");
      const relative = path.relative(directoryReal, await realpath(file));
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("Aufnahmesequenz liegt außerhalb des Auftrags.");
      sources.push({ file, sha256: await fileHash(file), info: await probe(ffmpeg, file) });
    }
    const { width: w, height: h, fps } = sources[0].info;
    const scale = w / 1920;
    const n = (value) => Math.max(1, Math.round(value * scale));
    const text = (file, size, x, y, color = "white", extra = "") =>
      `drawtext=fontfile=font.ttf:textfile=${file}:expansion=none:fontsize=${n(size)}:fontcolor=${color}:x=${x}:y=${y}${extra}`;
    const { title, players } = brandingTitle(job);
    await artifact("title.txt", clipText(title, 80));
    await artifact("players.txt", clipText(players, 110));
    await artifact(
      "subtitle.txt",
      clipText(
        job.branding.subtitle ||
          (/^(highlights|team-highlights)$/i.test(job.title) ? "" : job.title),
        100,
      ),
    );
    await artifact("map.txt", clipText(`${mapLabel(job.map)} · TECMON`, 80));
    await artifact("outro.txt", "DEIN MATCH. DEINE MOMENTE.");
    await artifact("website.txt", "Mehr Highlights auf tecmon.online");
    await artifact("channel.txt", "youtube.com/@tecmononline");
    const parts = [];
    async function encode(name, inputs, graph, audio, duration, files) {
      const graphName = await artifact(name + ".graph", graph);
      const output = path.join(work, name + ".mp4");
      const required = [
        "logo.webp",
        "font.ttf",
        graphName,
        ...files.filter((f) => typeof f === "string"),
      ].map((f) => artifacts.get(f));
      const external = files.filter((f) => typeof f !== "string");
      await execute({
        launcher,
        exe: ffmpeg,
        cwd: work,
        files: [...required, ...external],
        args: [
          "-hide_banner",
          "-loglevel",
          "error",
          "-nostdin",
          "-y",
          ...inputs,
          "-f",
          "lavfi",
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=48000",
          "-filter_complex_script",
          graphName,
          "-map",
          "[v]",
          "-map",
          audio,
          "-t",
          duration.toFixed(6),
          "-r",
          String(fps),
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "20",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "192k",
          "-ar",
          "48000",
          "-ac",
          "2",
          "-movflags",
          "+faststart",
          output,
        ],
      });
      parts.push({ path: output, sha256: await fileHash(output) });
    }
    const background = `color=c=0x0d0d16:s=${w}x${h}:r=${fps}`;
    const chrome = `drawbox=x=0:y=ih*0.85:w=iw:h=${n(5)}:color=0x8b4dff:t=fill,drawbox=x=iw*0.08:y=ih*0.92:w=iw*0.84:h=${n(2)}:color=0xefc96d:t=fill,drawbox=x=0:y=ih*0.94:w=iw*0.35:h=ih*0.06:color=0x8b4dff@0.35:t=fill`;
    if (job.branding.intro) {
      progress("TecMon-Intro wird lokal erstellt …");
      const titleSize = Math.min(112, Math.max(48, Math.round(1700 / Math.max(title.length, 12))));
      const graph =
        `[0:v]scale=${w}:${h},trim=end_frame=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=3,boxblur=10:1,drawbox=color=black@0.75:t=fill,${chrome}[bg];[1:v]scale=${n(450)}:${n(450)}[logo];[bg][logo]overlay=(W-w)/2:H*0.06,` +
        [
          text("title.txt", titleSize, "(w-text_w)/2", "h*0.54", "0xefc96d"),
          ...(new Set(job.sequences.map((s) => s.steamId)).size > 1
            ? [text("players.txt", 42, "(w-text_w)/2", "h*0.68")]
            : []),
          ...(job.branding.subtitle || !/^(highlights|team-highlights)$/i.test(job.title)
            ? [text("subtitle.txt", 32, "(w-text_w)/2", "h*0.76")]
            : []),
          text("map.txt", 26, "(w-text_w)/2", "h*0.87", "0xefc96d"),
          "setsar=1",
          "fade=t=in:st=0:d=0.2",
          "fade=t=out:st=2.8:d=0.2",
        ].join(",") +
        "[v]";
      await encode(
        "intro",
        ["-i", sources[0].file, "-loop", "1", "-i", "logo.webp"],
        graph,
        "2:a:0",
        3,
        [
          "title.txt",
          "players.txt",
          "subtitle.txt",
          "map.txt",
          { path: sources[0].file, sha256: sources[0].sha256 },
        ],
      );
    }
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i],
        sequence = job.sequences[i];
      const label = await artifact(`name-${i}.txt`, visualPlayerName(sequence.playerName));
      const caption = await artifact(
        `caption-${i}.txt`,
        clipText(`SPIELERANSICHT · ${mapLabel(job.map)}`, 80),
      );
      const show = i === 0 || job.sequences[i - 1].steamId !== sequence.steamId;
      const enable = ":enable='lt(t,3)'";
      let graph = `[0:v]scale=${w}:${h},setsar=1,fps=${fps}[base];[1:v]scale=${n(100)}:${n(100)},format=rgba,colorchannelmixer=aa=0.52[logo];[base][logo]overlay=W-w-${n(35)}:${n(30)}`;
      if (show)
        graph +=
          `,` +
          [
            `drawbox=x=${n(38)}:y=ih*0.64:w=${n(430)}:h=${n(130)}:color=0x0d0d16@0.85:t=fill${enable}`,
            `drawbox=x=${n(38)}:y=ih*0.64:w=${n(5)}:h=${n(130)}:color=0xefc96d:t=fill${enable}`,
            text(caption, 23, n(62), "h*0.64+" + n(17), "white", enable),
            text(
              label,
              Math.min(
                52,
                Math.max(
                  22,
                  Math.round(680 / Math.max(visualPlayerName(sequence.playerName).length, 13)),
                ),
              ),
              n(62),
              "h*0.64+" + n(50),
              "0xefc96d",
              enable,
            ),
          ].join(",");
      graph += "[v]";
      progress(`Wasserzeichen und Spielername: Szene ${i + 1}/${sources.length} …`);
      await encode(
        `scene-${i}`,
        ["-i", source.file, "-loop", "1", "-i", "logo.webp"],
        graph,
        source.info.audio ? "0:a:0" : "2:a:0",
        source.info.duration,
        [label, caption, { path: source.file, sha256: source.sha256 }],
      );
    }
    if (job.branding.outro) {
      progress("TecMon-Outro wird lokal erstellt …");
      const graph =
        `[0:v]${chrome}[bg];[1:v]scale=${n(350)}:${n(350)}[logo];[bg][logo]overlay=(W-w)/2:H*0.10,` +
        [
          text("outro.txt", 76, "(w-text_w)/2", "h*0.52", "0xefc96d"),
          text("website.txt", 42, "(w-text_w)/2", "h*0.67"),
          text("channel.txt", 32, "(w-text_w)/2", "h*0.76"),
          "setsar=1",
          "fade=t=in:st=0:d=0.2",
          "fade=t=out:st=1.8:d=0.2",
        ].join(",") +
        "[v]";
      await encode(
        "outro",
        ["-f", "lavfi", "-i", background, "-loop", "1", "-i", "logo.webp"],
        graph,
        "2:a:0",
        2,
        ["outro.txt", "website.txt", "channel.txt"],
      );
    }
    const list = await artifact(
      "parts.txt",
      parts.map((p) => `file '${path.basename(p.path)}'`).join("\n"),
    );
    const partial = path.join(work, "tecmon-highlight.mp4");
    progress("Intro und Highlight-Szenen werden zusammengefügt …");
    await execute({
      launcher,
      exe: ffmpeg,
      cwd: work,
      files: [artifacts.get(list), ...parts],
      args: [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-f",
        "concat",
        "-safe",
        "1",
        "-i",
        list,
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        partial,
      ],
    });
    const final = path.join(directory, "tecmon-highlight.mp4");
    await rename(partial, final);
    return final;
  } finally {
    // Only remove the freshly generated work directory underneath this job's own branding-work folder.
    if (path.dirname(work) === workingRoot) await rm(work, { recursive: true, force: true });
  }
}
