// Public previews use only the website's public illustration, never local demo footage.
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FILTER_IDS, filterGraph } from "../tools/cs2-companion/video-filters.mjs";

const [ffmpeg, website] = process.argv.slice(2);
if (!ffmpeg || !website) throw Error("node scripts/generate-filter-preview-videos.mjs <ffmpeg.exe> <Website-Repo>");
const run = promisify(execFile);
const call = (args) => run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "2", ...args], { windowsHide: true, maxBuffer: 4e6 });
const out = path.resolve(website, "public/video-filters/demo-v1");
const temp = await mkdtemp(path.join(tmpdir(), "tecmon-filter-preview-"));
const source = path.join(temp, "source.mp4");
const encode = ["-an", "-c:v", "libx264", "-preset", "fast", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
try {
  await mkdir(out, { recursive: true });
  // A slow, looping push-in makes the shared test illustration a moving comparison clip.
  await call(["-loop", "1", "-i", path.resolve(website, "public/marketing/generated/card-cs-v2.webp"),
    "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='1.04+0.035*sin(2*PI*on/120)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=960x540:fps=24",
    "-frames:v", "120", ...encode, source]);
  for (const id of ["original", ...FILTER_IDS]) {
    const graph = filterGraph(id === "original" ? null : id, "0:v", "v", 960, 540);
    await call(["-i", source, "-filter_complex_threads", "2", "-filter_complex", graph, "-map", "[v]", ...encode, path.join(out, `${id}.mp4`)]);
    await call(["-i", path.join(out, `${id}.mp4`), "-f", "null", "-"]);
    console.log(id);
  }
  await writeFile(path.join(out, "manifest.json"), JSON.stringify({
    source: "/marketing/generated/card-cs-v2.webp", description: "Animiertes öffentliches Testmotiv, keine Gameplay-Aufnahme",
    width: 960, height: 540, fps: 24, seconds: 5, filters: FILTER_IDS,
  }, null, 2) + "\n");
} finally {
  if (path.dirname(temp) !== path.resolve(tmpdir()) || !path.basename(temp).startsWith("tecmon-filter-preview-")) throw Error("Ungültiger temporärer Ausgabeordner");
  await rm(temp, { recursive: true, force: true });
}
