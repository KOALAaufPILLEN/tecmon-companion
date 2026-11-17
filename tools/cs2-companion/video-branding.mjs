import path from "node:path";
import { readFile, writeFile, mkdir, mkdtemp, rm, rename, lstat, realpath } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { sha256, BRANDING_FILES, MOTION_FILES } from "./branding-assets.mjs";
import { validateJob } from "./job.mjs";
import { runTool } from "./managed-installation.mjs";
import { filterGraph, withFilter } from "./video-filters.mjs";
import { cyberHud, playerSwitch, SWITCH_SECONDS, playerStinger, MOTION_STYLES, crossfadeGraph, keyColor, unmixGreen } from "./cyber-hud.mjs";
/** Farbraum-Kennzeichnung: Alle Umrechnungen hier laufen nach BT.601 (Standard von FFmpeg);
 * ohne Kennzeichnung nimmt YouTube bei HD BT.709 an und das Bild wirkt blasser. */
const COLOR_TAGS = ["-colorspace", "smpte170m", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

/** Länge von intro.mp4 aus dem Video-Paket (5,78 s), knapp darunter geschnitten. */

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
/** Nur Pfad und Prüfsumme gehen an den Sperr-Helfer. */
const lockedFile = (part) => ({ path: part.path, sha256: part.sha256 });
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
  motion = null,
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
    // Animiertes Intro und Szenenwechsel nur aus dem geprüften Video-Paket; sonst statisch wie bisher.
    if (motion) {
      for (const [name, hash] of Object.entries(MOTION_FILES)) {
        if (!Buffer.isBuffer(motion[name]) || sha256(motion[name]) !== hash)
          throw new Error("Video-Branding stimmt nicht mit der festen Prüfsumme überein.");
        await artifact("motion-" + name, motion[name]);
      }
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
    const style = MOTION_STYLES[job.branding.style] || MOTION_STYLES.a;
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
    await artifact("hud-brand.txt", "TECMON");
    await artifact("hud-mode.txt", "PLAYER POV // HIGHLIGHT");
    await artifact("hud-site.txt", "tecmon.online");
    await artifact("switch-label.txt", "POV SWITCH // NEXT PLAYER");
    await artifact("switch-footer.txt", "TEC / MON     ·     DEIN MATCH. DEINE MOMENTE.");
    const parts = [];
    const hud2 = Boolean(motion && motion["hud-v2.png"]);
    async function encode(name, inputs, graph, audio, duration, files) {
      // Branding-Teile (Intro, Titel, Spielerwechsel, Outro) nur mit Filter, wenn er gewählt ist.
      if (job.branding.filter && !name.startsWith("scene-")) graph = withFilter(graph, job.branding.filter, w, h);
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
          "fast",
          "-crf",
          "16",
          ...COLOR_TAGS,
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
      const kind = name === "intro-film" ? "film" : name === "intro" ? "title" : name.replace(/-\d+$/, "");
      parts.push({ path: output, sha256: await fileHash(output), kind, duration });
    }
    const background = `color=c=0x0d0d16:s=${w}x${h}:r=${fps}`;
    const chrome = `drawbox=x=0:y=ih*0.85:w=iw:h=${n(5)}:color=0x8b4dff:t=fill,drawbox=x=iw*0.08:y=ih*0.92:w=iw*0.84:h=${n(2)}:color=0xefc96d:t=fill,drawbox=x=0:y=ih*0.94:w=iw*0.35:h=ih*0.06:color=0x8b4dff@0.35:t=fill`;
    if (job.branding.intro && motion) {
      progress("Animiertes TecMon-Intro wird eingefügt …");
      await encode(
        "intro-film",
        ["-i", "motion-" + style.intro],
        `[0:v]scale=${w}:${h},setsar=1,fps=${fps},format=yuv420p[v]`,
        "0:a:0",
        style.introSeconds,
        ["motion-" + style.intro],
      );
    }
    const titleSeconds = 3;
    const multiPlayer = new Set(job.sequences.map((s) => s.steamId)).size > 1;
    const showSubtitle = job.branding.subtitle || !/^(highlights|team-highlights)$/i.test(job.title);
    if (job.branding.intro && motion) {
      // Esport-Titelbild: Banner mit Titel, Map und Spielern über dem ersten Bild der ersten Szene,
      // danach zerspringt das Bild in Stücke und gibt das Gameplay frei.
      progress("Esport-Titelbild wird erstellt …");
      const [from, to] = style.titleText;
      const titleSize = Math.min(84, Math.max(40, Math.round(1500 / Math.max(title.length, 12))));
      const fade = `:alpha='if(lt(t,${from + 0.2}),max(0,(t-${from})/0.2),if(gt(t,${to - 0.15}),max(0,(${to}-t)/0.15),1))':enable='between(t,${from},${to})'`;
      const look = `:borderw=${n(2)}:bordercolor=black@0.6:shadowcolor=black@0.8:shadowx=${n(2)}:shadowy=${n(2)}`;
      const below = [
        ...(multiPlayer ? ["players.txt"] : []),
        ...(showSubtitle ? ["subtitle.txt"] : []),
      ];
      const graph =
        `[1:v]scale=${w}:${h},setsar=1,fps=${fps},format=yuv420p,trim=end_frame=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${style.titleSeconds + 0.5}${style.titleCover ? `,drawbox=color=0x0b1030:t=fill:enable='between(t,${style.titleCover[0]},${style.titleCover[1]})'` : ""}[bg];` +
        `[0:v]scale=1280:720,setsar=1,fps=${fps},setpts=PTS-STARTPTS,colorkey=${keyColor(style.titleKey)}:0.17:0.09,format=gbrap,geq=${unmixGreen(style.titleKey)},scale=${w}:${h}[card];` +
        `[bg][card]overlay=0:0:eof_action=pass,format=yuv420p,` +
        [
          text("map.txt", 24, "(w-text_w)/2", "h*0.415", "0x9cefff", fade + look),
          text("title.txt", titleSize, "(w-text_w)/2", `h*0.522-${n(titleSize)}/2`, "0xefc96d", fade + look),
          ...below.map((file, k) =>
            text(file, k ? 26 : 32, "(w-text_w)/2", k ? "h*0.665" : "h*0.585", "white", fade + look),
          ),
          "setsar=1",
        ].join(",") +
        "[v]";
      await encode(
        "intro",
        ["-i", "motion-" + style.title, "-i", sources[0].file],
        graph,
        "0:a:0",
        style.titleSeconds,
        ["motion-" + style.title, "title.txt", "players.txt", "subtitle.txt", "map.txt", { path: sources[0].file, sha256: sources[0].sha256 }],
      );
    } else if (job.branding.intro) {
      progress("TecMon-Intro wird lokal erstellt …");
      const titleSize = Math.min(112, Math.max(48, Math.round(1700 / Math.max(title.length, 12))));
      const graph =
        `[0:v]scale=${w}:${h},trim=end_frame=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${titleSeconds},boxblur=10:1,drawbox=color=black@0.75:t=fill,${chrome}[bg];[1:v]scale=${n(450)}:${n(450)}[logo];[bg][logo]overlay=(W-w)/2:H*0.06,` +
        [
          text("title.txt", titleSize, "(w-text_w)/2", "h*0.54", "0xefc96d"),
          ...(multiPlayer ? [text("players.txt", 42, "(w-text_w)/2", "h*0.68")] : []),
          ...(showSubtitle ? [text("subtitle.txt", 32, "(w-text_w)/2", "h*0.76")] : []),
          text("map.txt", 26, "(w-text_w)/2", "h*0.87", "0xefc96d"),
          "setsar=1",
          // Mit Video-Paket blendet die Endmontage weich über, ohne Schwarzblende.
          "fade=t=in:st=0:d=0.2",
          `fade=t=out:st=${titleSeconds - 0.2}:d=0.2`,
        ].join(",") +
        "[v]";
      await encode(
        "intro",
        ["-i", sources[0].file, "-loop", "1", "-i", "logo.webp"],
        graph,
        "2:a:0",
        titleSeconds,
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
      const name=visualPlayerName(sequence.playerName);
      const displayName=name.length>30?name.slice(0,29)+'…':name;
      const label = await artifact(`name-${i}.txt`, displayName);
      const caption = await artifact(
        `caption-${i}.txt`,
        clipText(mapLabel(job.map), 20),
      );
      const counter=await artifact(`counter-${i}.txt`,`${String(i+1).padStart(2,'0')}/${String(sources.length).padStart(2,'0')}`);
      if(i>0 && job.sequences[i-1].steamId!==sequence.steamId){
        progress(`Cyberpunk-Spielerwechsel zu ${displayName} …`);
        const previous=sources[i-1];
        const previousFrame=Math.max(0,previous.info.duration-1/fps);
        if(motion){
          await encode(`switch-${i}`,
            ['-i','motion-'+style.stinger,'-ss',previousFrame.toFixed(6),'-i',previous.file,'-i',source.file],
            playerStinger({width:w,height:h,fps,nextFile:label,playerLength:displayName.length,style}),'0:a:0',style.stingerSeconds,
            [label,'motion-'+style.stinger,'switch-label.txt',{path:previous.file,sha256:previous.sha256},{path:source.file,sha256:source.sha256}]);
        }else await encode(`switch-${i}`,
          ['-ss',previousFrame.toFixed(6),'-i',previous.file,'-i',source.file,'-loop','1','-i','cyber-stinger.png','-loop','1','-i','logo.webp'],
          playerSwitch({width:w,height:h,fps,nextFile:label,playerLength:displayName.length}), '4:a:0',SWITCH_SECONDS,
          [label,'cyber-stinger.png','switch-label.txt','switch-footer.txt',{path:previous.file,sha256:previous.sha256},{path:source.file,sha256:source.sha256}]);
      }
      const filter=sequence.filter?filterGraph(sequence.filter,'game0','game',w,h):null;
      // Kills als Sekunden ab Szenenbeginn (kill-badge-v1).
      // Nur mit den geprüften Bildern aus dem Video-Paket (ab Motion v4).
      const badges=Boolean(motion && motion["kill-badge.png"] && motion["kill-badge-multi.png"]);
      const kills=badges?(sequence.kills||[]).map(([tick,count,hs])=>({t:(tick-sequence.startTick)/job.tickRate,n:count,hs:hs===1})):[];
      const badgeInputs=kills.length?["-loop","1","-i","motion-kill-badge.png","-loop","1","-i","motion-kill-badge-multi.png"]:[];
      // Deathcam: „DEATHCAM: Name des Sterbenden“ oben (deathcam-label-v1), Name nur als gesperrte Datei.
      const deathName=sequence.deathcam?visualPlayerName(sequence.deathcam):'';
      const deathLabel=deathName.length>30?deathName.slice(0,29)+"…":deathName;
      const deathcamFile=deathName?await artifact(`deathcam-${i}.txt`,deathLabel):null;
      let graph=cyberHud({width:w,height:h,fps,playerFile:label,mapFile:caption,sceneFile:counter,playerLength:displayName.length,hud2,filter,kills,deathcamFile});
      progress(`Cyberpunk-HUD mit dauerhaftem Spielername: Szene ${i + 1}/${sources.length} …`);
      await encode(
        `scene-${i}`,
        ["-i", source.file, "-loop", "1", "-i", "logo.webp", "-loop", "1", "-i", hud2 ? "motion-hud-v2.png" : "cyber-hud.png", ...badgeInputs],
        graph,
        source.info.audio ? "0:a:0" : (kills.length ? "5:a:0" : "3:a:0"),
        source.info.duration,
        [label, caption, counter, ...(deathcamFile ? [deathcamFile] : []), hud2 ? "motion-hud-v2.png" : "cyber-hud.png", "hud-brand.txt", "hud-mode.txt", "hud-site.txt",
          ...(kills.length ? ["motion-kill-badge.png", "motion-kill-badge-multi.png"] : []),
          { path: source.file, sha256: source.sha256 }],
      );
    }
    if (job.branding.outro && motion) {
      // TecMon winkt und fliegt davon; Website und Kanal erscheinen, sobald nur noch das Logo steht.
      progress("Animiertes TecMon-Outro wird eingefügt …");
      const [from, to] = style.outroText;
      const fade = `:alpha='if(lt(t,${from + 0.25}),(t-${from})/0.25,if(gt(t,${to - 0.35}),max(0,(${to}-t)/0.35),1))':enable='between(t,${from},${to})'`;
      const graph =
        `[0:v]scale=${w}:${h},setsar=1,fps=${fps},format=yuv420p,` +
        [
          text("website.txt", 42, "(w-text_w)/2", `h*${style.outroY[0]}`, "white", fade + ":shadowcolor=black@0.85:shadowx=2:shadowy=2"),
          text("channel.txt", 32, "(w-text_w)/2", `h*${style.outroY[1]}`, "0xefc96d", fade + ":shadowcolor=black@0.85:shadowx=2:shadowy=2"),
        ].join(",") +
        "[v]";
      await encode(
        "outro",
        ["-i", "motion-" + style.outro],
        graph,
        "0:a:0",
        style.outroSeconds,
        ["motion-" + style.outro, "website.txt", "channel.txt"],
      );
    } else if (job.branding.outro) {
      progress("TecMon-Outro wird lokal erstellt …");
      const graph =
        `[0:v]${chrome}[bg];[1:v]scale=${n(350)}:${n(350)}[logo];[bg][logo]overlay=(W-w)/2:H*0.10,` +
        [
          text("outro.txt", 76, "(w-text_w)/2", "h*0.52", "0xefc96d"),
          text("website.txt", 42, "(w-text_w)/2", "h*0.67"),
          text("channel.txt", 32, "(w-text_w)/2", "h*0.76"),
          "setsar=1",
          ...(motion ? [] : ["fade=t=in:st=0:d=0.2"]),
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
    const partial = path.join(work, "tecmon-highlight.mp4");
    if (motion) {
      // Weiche Überblendungen zwischen allen Teilen statt harter Schnitte (einmal neu kodiert).
      progress("Intro, Szenen und Übergänge werden weich überblendet …");
      const { graph, duration } = crossfadeGraph(parts, fps);
      const graphName = await artifact("final.graph", graph);
      await execute({
        launcher,
        exe: ffmpeg,
        cwd: work,
        files: [artifacts.get(graphName), ...parts.map(lockedFile)],
        args: [
          "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
          ...parts.flatMap((p) => ["-i", path.basename(p.path)]),
          "-filter_complex_script", graphName,
          "-map", "[v]", "-map", "[a]",
          "-t", duration.toFixed(6), "-r", String(fps),
          "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", ...COLOR_TAGS,
          "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
          "-movflags", "+faststart",
          partial,
        ],
      });
    } else {
      const list = await artifact(
        "parts.txt",
        parts.map((p) => `file '${path.basename(p.path)}'`).join("\n"),
      );
      progress("Intro und Highlight-Szenen werden zusammengefügt …");
      await execute({
        launcher,
        exe: ffmpeg,
        cwd: work,
        files: [artifacts.get(list), ...parts.map(lockedFile)],
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
    }
    const final = path.join(directory, "tecmon-highlight.mp4");
    await rename(partial, final);
    return final;
  } finally {
    // Only remove the freshly generated work directory underneath this job's own branding-work folder.
    if (path.dirname(work) === workingRoot) await rm(work, { recursive: true, force: true });
  }
}
