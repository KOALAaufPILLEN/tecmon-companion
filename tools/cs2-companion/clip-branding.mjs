import path from "node:path";
import { writeFile, mkdir, mkdtemp, rm, rename } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { sha256, BRANDING_FILES } from "./branding-assets.mjs";
import { lockedFfmpeg, probeVideo } from "./video-branding.mjs";
import { brandedName } from "./clips.mjs";
import { runTool } from "./managed-installation.mjs";

/** Spiele, die als Beschriftung erlaubt sind. Freitext kommt nur in den Titel. */
export const CLIP_GAMES = Object.freeze({
  cs2: "CS2",
  valorant: "VALORANT",
  dota2: "DOTA 2",
  deadlock: "DEADLOCK",
  wardogs: "WARDOGS",
  lol: "LEAGUE OF LEGENDS",
  other: "GAMEPLAY",
});
const clean = (value, max) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/[\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
export function clipLabels({ game, title }) {
  const label = CLIP_GAMES[game] || CLIP_GAMES.other;
  return { game: CLIP_GAMES[game] ? game : "other", label, title: clean(title, 80) || `${label} · HIGHLIGHT` };
}
const fileHash = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};

/**
 * Clip mit TecMon-Branding: kleines Logo am rechten Rand (dort liegt in den
 * meisten Spielen kein HUD), Titel in den ersten 3 Sekunden mittig und ein
 * kurzer Abspann. Assets nur mit fester Prüfsumme, FFmpeg nur über den
 * geschützten Starter wie beim Highlight-Branding.
 */
export async function renderClipBranding({
  source,
  directory,
  id,
  game,
  title,
  assets,
  ffmpeg,
  launcher,
  progress = () => {},
  execute = lockedFfmpeg,
  probe = probeVideo,
}) {
  const labels = clipLabels({ game, title });
  const workingRoot = path.join(directory, "branding-work");
  await mkdir(workingRoot, { recursive: true });
  const work = await mkdtemp(path.join(workingRoot, "clip-"));
  if (process.platform === "win32" && execute === lockedFfmpeg) await runTool(launcher, ["--private", work]);
  const artifacts = new Map();
  async function artifact(name, value) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
    const file = path.join(work, name);
    await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
    artifacts.set(name, { path: file, sha256: sha256(bytes) });
    return name;
  }
  try {
    for (const [name, hash] of Object.entries(BRANDING_FILES)) {
      if (!Buffer.isBuffer(assets?.[name]) || sha256(assets[name]) !== hash)
        throw new Error("Branding-Arbeitskopie stimmt nicht mit der festen Prüfsumme überein.");
      await artifact(name, assets[name]);
    }
    const input = { path: source, sha256: await fileHash(source) };
    const info = await probe(ffmpeg, source);
    const { width: w, height: h, fps } = info;
    const n = (value) => Math.max(1, Math.round((value * w) / 1920));
    const text = (file, size, x, y, color = "white", extra = "") =>
      `drawtext=fontfile=font.ttf:textfile=${file}:expansion=none:fontsize=${n(size)}:fontcolor=${color}:x=${x}:y=${y}${extra}`;
    await artifact("title.txt", labels.title);
    await artifact("game.txt", `${labels.label} · TECMON`);
    await artifact("outro.txt", "DEIN SPIEL. DEINE MOMENTE.");
    await artifact("website.txt", "Mehr Highlights auf tecmon.online");
    await artifact("channel.txt", "youtube.com/@tecmononline");
    const parts = [];
    async function encode(name, inputs, graph, audio, duration, files) {
      const graphName = await artifact(name + ".graph", graph);
      const output = path.join(work, name + ".mp4");
      await execute({
        launcher,
        exe: ffmpeg,
        cwd: work,
        files: [...["logo.webp", "font.ttf", graphName, ...files.filter((f) => typeof f === "string")].map((f) => artifacts.get(f)), ...files.filter((f) => typeof f !== "string")],
        args: ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...inputs, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-filter_complex_script", graphName, "-map", "[v]", "-map", audio, "-t", duration.toFixed(6), "-r", String(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output],
      });
      parts.push({ path: output, sha256: await fileHash(output) });
    }
    progress("Clip bekommt das TecMon-Branding …");
    const show = "enable='lt(t,3)'";
    const graph =
      `[0:v]scale=${w}:${h},setsar=1[base];[1:v]scale=${n(120)}:-1,format=rgba,colorchannelmixer=aa=0.7[logo];` +
      `[base][logo]overlay=W-w-${n(24)}:H*0.58[marked];[marked]` +
      [
        `drawbox=x=iw*0.22:y=ih*0.70:w=iw*0.56:h=${n(120)}:color=0x0d0d16@0.6:t=fill:${show}`,
        `drawbox=x=iw*0.22:y=ih*0.70:w=iw*0.56:h=${n(4)}:color=0x8b4dff:t=fill:${show}`,
        text("title.txt", 52, "(w-text_w)/2", `h*0.70+${n(16)}`, "0xefc96d", `:${show}`),
        text("game.txt", 26, "(w-text_w)/2", `h*0.70+${n(80)}`, "white", `:${show}`),
      ].join(",") +
      "[v]";
    await encode("scene", ["-i", source, "-loop", "1", "-i", "logo.webp"], graph, info.audio ? "0:a:0" : "2:a:0", info.duration, ["title.txt", "game.txt", input]);
    const chrome = `drawbox=x=0:y=ih*0.85:w=iw:h=${n(5)}:color=0x8b4dff:t=fill,drawbox=x=iw*0.08:y=ih*0.92:w=iw*0.84:h=${n(2)}:color=0xefc96d:t=fill`;
    const outro =
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
    await encode("outro", ["-f", "lavfi", "-i", `color=c=0x0d0d16:s=${w}x${h}:r=${fps}`, "-loop", "1", "-i", "logo.webp"], outro, "2:a:0", 2, ["outro.txt", "website.txt", "channel.txt"]);
    const list = await artifact("parts.txt", parts.map((p) => `file '${path.basename(p.path)}'`).join("\n"));
    const partial = path.join(work, "clip-tecmon.mp4");
    await execute({
      launcher,
      exe: ffmpeg,
      cwd: work,
      files: [artifacts.get(list), ...parts],
      args: ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-f", "concat", "-safe", "1", "-i", list, "-c", "copy", "-movflags", "+faststart", partial],
    });
    const final = path.join(directory, brandedName(id));
    await rename(partial, final);
    return final;
  } finally {
    if (path.dirname(work) === workingRoot) await rm(work, { recursive: true, force: true });
  }
}
