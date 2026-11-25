import test from "node:test";
import vm from "node:vm";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, rename } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { releaseTool, discoverTool, createExternalUpdates, installExternalTool, recoverExternalTools } from "../external-updates.mjs";
import { createCompanion } from "../server.mjs";

const digest = "a".repeat(64);
const release = (name="hlae", version="2.193.2") => {
 const repo=name==="hlae"?"advancedfx/advancedfx":"GyanD/codexffmpeg";
 const tag=name==="hlae"?`v${version}`:version;
 const file=name==="hlae"?`hlae_${version.replaceAll(".","_")}.zip`:`ffmpeg-${version}-full_build.zip`;
 return {tag_name:tag,draft:false,prerelease:false,assets:[{name:file,browser_download_url:`https://github.com/${repo}/releases/download/${tag}/${file}`,size:3,digest:`sha256:${digest}`}]};
};
async function temp(t) {const dir=await mkdtemp(path.join(os.tmpdir(),"tecmon-external-"));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}

test("Hersteller-Metadaten: exakte Quelle, stabile Version, Asset und Digest",async()=>{
 assert.equal(releaseTool("hlae",release()).version,"2.193.2");
 assert.equal(releaseTool("ffmpeg",release("ffmpeg","9.1")).version,"9.1");
 for(const mutate of [r=>r.draft=true,r=>r.prerelease=true,r=>r.tag_name="nightly",r=>r.assets[0].digest=null,r=>r.assets[0].browser_download_url="https://github.com/attacker/file.zip",r=>r.assets[0].size=400*1024*1024,r=>r.assets[0].name="other.zip"]){const r=release();mutate(r);assert.throws(()=>releaseTool("hlae",r));}
 await assert.rejects(discoverTool("hlae",async()=>new Response("",{status:403})),/HTTP 403/);
 const item=await discoverTool("hlae",async(url)=>{assert.equal(url,"https://api.github.com/repos/advancedfx/advancedfx/releases/latest");return Response.json(release());});
 assert.equal(item.sha256,digest);
});

async function installFixture(t,name="hlae"){
 const root=await temp(t);const target=path.join(root,"tools",name);await mkdir(target,{recursive:true});await writeFile(path.join(target,"settings.txt"),"alt");
 const r=release(name,name==="hlae"?"2.193.2":"9.1");r.assets[0].digest="sha256:"+createHash("sha256").update("zip").digest("hex");
 const item=releaseTool(name,r);let smoke=0;
 const run=async(exe,args,options)=>{
  if(exe==="powershell.exe"){
   let dir=options.env.TECMON_UNPACK_DESTINATION;
   if(name==="ffmpeg")dir=path.join(dir,"ffmpeg-package");
   await mkdir(path.join(dir,name==="hlae"?"x64":"bin"),{recursive:true});
   await writeFile(path.join(dir,name==="hlae"?"hlae.exe":"bin/ffmpeg.exe"),"neu");
   if(name==="hlae"){await writeFile(path.join(dir,"x64/AfxHookSource2.dll"),"neu");await writeFile(path.join(dir,"changelog.xml"),"<release><name>HLAE</name><version>2.193.2</version></release>");}
  }else if(args[0]==="-version")return "ffmpeg version 9.1-full_build";
  else{smoke++;assert.ok(args.includes("libx264"));assert.ok(args.includes("aac"));}
 };
 return {root,target,name,item,run,request:async()=>new Response("zip"),smoke:()=>smoke};
}
test("Geprüfte HLAE und FFmpeg installieren; FFmpeg-Encoder vor dem Austausch testen",async(t)=>{
 for(const name of ["hlae","ffmpeg"]){const s=await installFixture(t,name);await installExternalTool(s);assert.equal(await readFile(path.join(s.target,name==="hlae"?"hlae.exe":"bin/ffmpeg.exe"),"utf8"),"neu");assert.equal(s.smoke(),name==="ffmpeg"?1:0);assert.deepEqual(await readdir(path.join(s.root,"tools")),[name]);}
});
test("Prüfsummen-/Größenfehler und inzwischen gestartetes Spiel behalten alte Tools",async(t)=>{
 for(const scenario of ["hash","size","busy","smoke"]){const s=await installFixture(t,scenario==="smoke"?"ffmpeg":"hlae");if(scenario==="hash")s.item.sha256=digest;if(scenario==="size")s.item.size=4;if(scenario==="busy")s.canInstall=async()=>false;if(scenario==="smoke"){const run=s.run;s.run=async(...args)=>{if(args[0]!=="powershell.exe"&&args[1][0]!=="-version")throw Error("Encoder fehlt");return run(...args);};}await assert.rejects(installExternalTool(s));assert.equal(await readFile(path.join(s.target,"settings.txt"),"utf8"),"alt");assert.deepEqual(await readdir(path.join(s.root,"tool-downloads")),[]);}
});
test("Fehler beim Austausch stellt den vorherigen Tool-Ordner vollständig wieder her",async(t)=>{
 const s=await installFixture(t);s.replace=async()=>{throw Error("Platte voll");};await assert.rejects(installExternalTool(s),/Platte voll/);assert.deepEqual(await readdir(s.target),["settings.txt"]);assert.equal(await readFile(path.join(s.target,"settings.txt"),"utf8"),"alt");
});

async function manager(t,over={}){
 const directory=await temp(t);let clock=1000000;const versions={hlae:"2.193.1",ffmpeg:"9.1"};const calls=[];
 const options={directory,now:()=>clock,installed:async n=>versions[n],discover:async n=>{calls.push(n);return releaseTool(n,release(n,n==="hlae"?"2.193.2":"9.1"));},install:async(n,item)=>{versions[n]=item.version;},...over};
 return {directory,versions,calls,options,advance:ms=>{clock+=ms;},api:await createExternalUpdates(options)};
}
test("Gemeinsamer Lauf, sechs Stunden Cache und dauerhafte Einstellung/Ergebnisse",async(t)=>{
 const s=await manager(t);const a=s.api.run();assert.equal(a,s.api.run());let state=await a;assert.equal(state.running,false);assert.equal(state.tools[0].status,"updated");await s.api.run();assert.equal(s.calls.length,2);s.advance(6*60*60_000);await s.api.run();assert.equal(s.calls.length,4);await s.api.setAuto(false);const restarted=await createExternalUpdates(s.options);assert.equal(restarted.state().auto,false);assert.equal(restarted.state().tools.length,2);await restarted.run();assert.equal(s.calls.length,4);await restarted.run({force:true});assert.equal(s.calls.length,6);
});
test("Laufende Programme verschieben den Lauf; Herstellerfehler werden erneut versucht",async(t)=>{
 let busy=true;let fail=true;const s=await manager(t,{blocked:async()=>busy?"CS2 läuft":"",discover:async n=>{if(fail)throw Error("HTTP 503");return releaseTool(n,release(n,n==="hlae"?"2.193.2":"9.1"));}});
 let state=await s.api.run();assert.equal(state.tools[0].status,"error");assert.equal(state.running,false);busy=false;s.advance(5*60_000);state=await s.api.run();assert.equal(state.tools[0].status,"error");assert.match(state.tools[0].message,/503/);fail=false;s.advance(5*60_000);state=await s.api.run();assert.equal(state.tools[0].status,"updated");
});
test("Prozessabfragefehler ersetzen kein Tool",async(t)=>{
 let installed=false;const s=await manager(t,{blocked:async()=>{throw Error("tasklist nicht erreichbar");},install:async()=>{installed=true;}});const state=await s.api.run();assert.equal(installed,false);assert.match(state.message,/tasklist/);
});
test("HTTP-Start aktualisiert im Hintergrund, reserviert Jobs und bleibt authentifiziert",async(t)=>{
 let finish;const blocked=new Promise(resolve=>{finish=resolve;});const s=await manager(t,{blocked:async()=>{await blocked;return "";}});
 const companion=await createCompanion({dataDir:s.directory,detectTools:async()=>({}),engineSystem:{externalUpdates:s.api}});
 await new Promise(resolve=>companion.server.listen(0,"127.0.0.1",resolve));t.after(()=>companion.server.close());
 const base=`http://127.0.0.1:${companion.server.address().port}`;const post=(url,body={},auth=true)=>fetch(base+url,{method:"POST",headers:{"Content-Type":"application/json",...(auth?{"x-tecmon-token":companion.token}:{})},body:JSON.stringify(body)});
 assert.equal((await post("/api/update/external/check",{},false)).status,401);
 assert.equal((await post("/api/update/external/check")).status,202);
 const state=await(await fetch(base+"/api/state",{headers:{"x-tecmon-token":companion.token}})).json();assert.equal(state.active,true);assert.equal(state.updates.external.running,true);
 assert.equal((await post("/api/start",{confirm:true,id:"fake"})).status,400);
 finish();await s.api.run();await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal((await post("/api/update/external/auto",{auto:false})).status,200);assert.equal(s.api.state().auto,false);
});

test("Offenes Spiel zeigt verfügbare Version, installiert erst nach Spielende",async(t)=>{
 let busy=true;const s=await manager(t,{blocked:async()=>busy?"CS2 läuft":""});let state=await s.api.run();assert.equal(state.tools[0].status,"pending");assert.equal(state.tools[0].latest,"2.193.2");assert.equal(s.versions.hlae,"2.193.1");busy=false;s.advance(5*60_000);state=await s.api.run();assert.equal(state.tools[0].status,"updated");
});

test("Neustart nach unterbrochenem Ordnerwechsel stellt Sicherung wieder her",async(t)=>{
 const s=await installFixture(t);await writeFile(path.join(s.target,"hlae.exe"),"alt");const backup=s.target+".backup-00000000-0000-0000-0000-000000000001";await rename(s.target,backup);await recoverExternalTools(s.root);assert.equal(await readFile(path.join(s.target,"hlae.exe"),"utf8"),"alt");
});

test("Update-Oberfläche zeigt offene Komponenten und bedient echte Browser-Handler",async()=>{
 const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');const start=source.indexOf('function renderExternalUpdates(');assert.ok(start>0);const elements=new Map();
 const element=()=>({hidden:true,checked:false,disabled:false,textContent:'',listeners:{},addEventListener(n,f){this.listeners[n]=f;},replaceChildren(...rows){this.rows=rows;}});const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};const calls=[];
 const context=vm.createContext({$,document:{createElement:element},api:async(...args)=>{calls.push(args);},refresh:async()=>{},notice:()=>{},Date});vm.runInContext(source.slice(start),context);
 context.payload={auto:true,running:true,checkedAt:1000000,message:'CS2 läuft',tools:[{label:'HLAE',installed:'2.193.1',latest:'2.193.2',status:'pending',message:'Spiel schließen'}],managed:[{label:'Node.js',channel:'Companion-Update'}]};vm.runInContext('renderExternalUpdates(payload)',context);
 assert.equal($('external-updates').hidden,false);assert.equal($('external-check').disabled,true);assert.match($('external-tools').rows[0].textContent,/Wartet/);assert.match($('external-tools').rows[0].textContent,/Spiel schließen/);
 $('external-auto').checked=false;await $('external-auto').listeners.change();assert.equal(calls[0][0],'/api/update/external/auto');assert.equal(calls[0][1].auto,false);await $('external-check').listeners.click();assert.equal(calls[1][0],'/api/update/external/check');
});
