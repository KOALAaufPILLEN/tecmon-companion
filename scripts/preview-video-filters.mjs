// Local, read-only footage review. No game launch, demo rewrite, upload or credentials.
import path from "node:path";
import { readFile, writeFile, mkdir, access, copyFile, stat } from "node:fs/promises";
import { createReadStream, constants } from "node:fs";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { FILTER_V2_IDS, filterGraph } from "../tools/cs2-companion/video-filters.mjs";
import { renderBranding, sequenceFile } from "../tools/cs2-companion/video-branding.mjs";
import { verifyBrandingPack } from "../tools/cs2-companion/branding-assets.mjs";
const [ffmpeg, sourceArg, outArg, websiteArg, launcherArg] = process.argv.slice(2);
if (!ffmpeg || !sourceArg || !outArg) throw Error("node scripts/preview-video-filters.mjs <ffmpeg.exe> <Aufnahme.mp4> <neuer Ausgabeordner> [Website-Repo] [Render-Helfer.exe]");
const originalSource = path.resolve(sourceArg), out = path.resolve(outArg);
try { await access(out); throw Error("Bitte einen neuen Ausgabeordner verwenden."); } catch (error) { if (error.code !== "ENOENT") throw error; }
await mkdir(out, { recursive:true });
const source=path.join(out,"source-snapshot.mp4");
const before=await stat(originalSource);
await copyFile(originalSource,source,constants.COPYFILE_EXCL);
const after=await stat(originalSource);
const fileHash=async(file)=>{const hash=createHash("sha256");for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest("hex")};
const sourceHash=await fileHash(source);
if(before.size!==after.size || before.mtimeMs!==after.mtimeMs || sourceHash!==await fileHash(originalSource)) throw Error("Die Aufnahme wird noch geschrieben. Bitte eine abgeschlossene Aufnahme verwenden.");

const run = promisify(execFile);
const call = (args) => run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args], { windowsHide:true, maxBuffer:4e6 });
const probe=async(_,file)=>{
    let info;
    try { info=(await run(ffmpeg,["-hide_banner","-i",file],{windowsHide:true})).stderr; } catch(error) { info=error.stderr; }
    const size=info.match(/Video:.*?\b(\d{3,4})x(\d{3,4})\b/), duration=info.match(/Duration: (\d+):(\d+):([\d.]+)/);
    if(!size||!duration)throw Error("Aufnahmeformat nicht lesbar");
    return {width:+size[1],height:+size[2],fps:+(info.match(/([\d.]+) fps/)?.[1]||30)>45?60:30,
      duration:+duration[1]*3600 + +duration[2]*60 + +duration[3],audio:/Audio:/.test(info)};
  };
const sourceInfo=await probe(null,source);
if(sourceInfo.duration<3) throw Error("Die Aufnahme muss mindestens drei Sekunden lang sein.");
const names = { original:"Original", "arena-pro":"Arena Pro", "cinema-pro":"Cinema Pro", "tecmon-prime":"TecMon Prime", frostfire:"Frostfire", silverprint:"Silverprint", halation:"Halation", "tecmon-ultra":"TecMon Ultra", "neon-storm":"Neon Storm", inferno:"Inferno", arctic:"Arctic", "toxic-lime":"Toxic Lime", blockbuster:"Blockbuster", "crimson-noir":"Crimson Noir", "bloom-ultra":"Bloom Ultra" };
// Same source frames and audio for every look, no regenerated gameplay.
const records = [];
for (const id of ["original", ...FILTER_V2_IDS]) {
  const graph = `[0:v]scale=1920:1080,setsar=1[raw];${filterGraph(id,"raw","v",1920,1080)}`;
  const script = path.join(out, id+".graph");
  await writeFile(script,graph);
  console.log("Rendere " + names[id]);
  const start = performance.now();
  await call(["-i",source,"-t","3","-filter_complex_script",script,"-map","[v]","-map","0:a?","-c:v","libx264","-preset","fast","-crf","18","-pix_fmt","yuv420p","-c:a","aac","-movflags","+faststart",path.join(out,id+".mp4")]);
  await call(["-ss","1","-i",path.join(out,id+".mp4"),"-frames:v","1",path.join(out,id+".png")]);
  records.push({id,secondsToRender:Math.round((performance.now()-start)/100)/10});
}
const labels = (name) => Buffer.from(`<svg width="480" height="40"><rect width="480" height="40" fill="#171020"/><text x="16" y="27" font-family="Arial" font-size="19" fill="#efcf80">${name}</text></svg>`);
const tiles=[];
for (const [i,id] of ["original",...FILTER_V2_IDS].entries()) {
  tiles.push({input:await sharp(path.join(out,id+".png")).resize(480,270).toBuffer(),left:(i%4)*480,top:Math.floor(i/4)*310});
  tiles.push({input:labels(names[id]),left:(i%4)*480,top:Math.floor(i/4)*310+270});
}
await sharp({create:{width:1920,height:Math.ceil((FILTER_V2_IDS.length+1)/4)*310,channels:3,background:"#100c18"}}).composite(tiles).png().toFile(path.join(out,"comparison.png"));
// Public test previews use ONLY the website's existing illustration, never private footage.
if (websiteArg) {
  const website=path.resolve(websiteArg);
  await access(path.join(website,"lib/videoFilters.ts"));
  const image=path.join(website,"public/marketing/generated/card-cs-v2.webp");
  const target=path.join(website,"public/video-filters/v2");
  await mkdir(target,{recursive:true});
  for (const id of FILTER_V2_IDS) {
    const script=path.join(out,"web-"+id+".graph");
    await writeFile(script,`[0:v]scale=960:540:force_original_aspect_ratio=increase,crop=960:540[raw];${filterGraph(id,"raw","v",960,540)}`);
    await call(["-i",image,"-filter_complex_script",script,"-map","[v]","-frames:v","1","-c:v","libwebp","-quality","85",path.join(target,id+".webp")]);
  }
}
const videos = ["original",...FILTER_V2_IDS].map(id=>`<button data-id="${id}">${names[id]}</button>`).join("");
await writeFile(path.join(out,"index.html"),`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>TecMon · Pro Looks</title><style>body{max-width:1280px;margin:32px auto;padding:0 20px;background:#100c18;color:#eee6f8;font:16px/1.5 system-ui}h1{color:#efcf80}video,img{width:100%;border:1px solid #765398}button{min-height:44px;margin:6px;padding:10px 16px;background:#21142f;color:#efcf80;border:1px solid #7d558f;cursor:pointer}button[aria-pressed=true]{background:#633695}button:active{transform:scale(.96)}button:focus-visible{outline:3px solid #efcf80}</style><h1>TecMon · Pro & Intense Looks</h1><p>Dieselbe echte Companion-Aufnahme mit 14 Pro- und Intense-Looks. Lokal gerendert, keine neue Spielszene. Der Filter wirkt auf das gesamte Aufnahmebild einschließlich des bereits aufgenommenen CS2-HUDs; zusätzliche TecMon-Einblendungen kommen danach.</p><video id="video" controls loop poster="original.png" src="original.mp4"></video><div id="buttons">${videos}</div><p>Original und Looks behalten denselben Bildausschnitt und dieselbe Geschwindigkeit. Cinema Pro und Halation sind bewusst subtiler als Frostfire.</p><img src="comparison.png" alt="Original und 14 Looks im direkten Vergleich"><script>const video=document.getElementById('video');function select(id){const time=video.currentTime,playing=!video.paused;video.src=id+'.mp4';video.poster=id+'.png';video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(time,video.duration);if(playing)video.play().catch(()=>{});},{once:true});for(const b of document.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.id===id));}document.getElementById('buttons').addEventListener('click',e=>{if(e.target.dataset.id)select(e.target.dataset.id)});select('tecmon-ultra');</script></html>`);
await writeFile(path.join(out,"render-review.json"),JSON.stringify({source:path.basename(originalSource),sourceSha256:sourceHash,duration:3,size:[1920,1080],records},null,2));
if (launcherArg) {
  // Exercise the actual scene/export pipeline and native file locks, not only -vf.
  const native=path.join(out,"native-export");
  await mkdir(native);
  const job={format:"tecmon-cs2-job",version:1,tickRate:64,map:"FILTERVORSCHAU",branding:{intro:false,outro:false},
    sequences:FILTER_V2_IDS.map((filter,i)=>({startTick:64+i*256,endTick:256+i*256,steamId:"76561198000000000",playerName:"FILTERVORSCHAU",filter}))};
  for(let i=0;i<job.sequences.length;i++) await copyFile(path.join(out,"original.mp4"),path.join(native,sequenceFile(job.sequences[i],i)));
  const assets=verifyBrandingPack(await readFile(new URL("../tools/cs2-companion/branding/TecMon-Branding-v3.json",import.meta.url)));
  const rendered=await renderBranding({job,directory:native,assets,ffmpeg,launcher:path.resolve(launcherArg),probe,progress:console.log});
  await call(["-i",rendered,"-f","null","-"]);
  const html=await readFile(path.join(out,"index.html"),"utf8");
  await writeFile(path.join(out,"index.html"),html.replace("<h1>TecMon · Pro & Intense Looks</h1>",'<h1>TecMon · Pro & Intense Looks</h1><p><a style="color:#efcf80" href="native-export/tecmon-highlight.mp4">Vollständigen Companion-Testexport ansehen</a> · 14 Looks, nacheinander auf derselben Aufnahme</p>'));
  await writeFile(path.join(out,"native-export-check.json"),JSON.stringify({nativeLockedRender:true,filters:FILTER_V2_IDS,output:await probe(null,rendered)},null,2));
}
console.log("Vorschau: " + path.join(out,"index.html"));
