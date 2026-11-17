import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {once} from "node:events";
import {mkdtemp,writeFile,mkdir,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createCompanion} from "../server.mjs";
import {updateHandoff} from "../update-handoff.mjs";
import {copyRadars,radarFile} from "../radars.mjs";

test("managed Companion downloads with the own engine and never mentions a database",async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tecmon-lazy-"));
  let runs=0;
  const installation={dataDir:dir,profileDir:path.join(dir,"profile"),hlaeExe:"",ffmpegExe:"",cs2Exe:""};
  await mkdir(installation.profileDir,{recursive:true});
  const {server,token}=await createCompanion({installation,detectTools:async()=>({}),downloadDemo:async({directory})=>{
    runs++;await mkdir(directory,{recursive:true});const demo=path.join(directory,"match.dem");await writeFile(demo,"PBDEMS2\0fixture");return demo;
  }});
  server.listen(0,"127.0.0.1");await once(server,"listening");
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={"x-tecmon-token":token,"content-type":"application/json"};
  const state=async()=> (await fetch(base+"/api/state",{headers})).json();
  const first=await state();
  assert.equal(first.postgres,undefined);assert.equal(first.engine,undefined);assert.equal("csdm" in first.detected,false);assert.equal(runs,0);
  for(const route of ["/api/csdm/open","/api/database/check","/api/database/install","/api/engine"])
    assert.equal((await fetch(base+route,{method:"POST",headers,body:"{}"})).status,404);
  const response=await fetch(base+"/api/demos/download",{method:"POST",headers,body:JSON.stringify({format:"tecmon-match-download",version:1,shareCodes:["CSGO-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA"],confirm:true})});
  assert.equal(response.status,202);
  /* Bis zu 5 s warten: Windows-Runner brauchen für den Auftrag oft länger als 0,5 s. */
  let result;for(const end=Date.now()+5000;Date.now()<end;){result=await state();if(!result.active&&result.downloads[0]?.status!=="downloading")break;await new Promise(resolve=>setTimeout(resolve,20));}
  assert.equal(runs,1);assert.equal(result.downloads[0].status,"done");
});

test("Radarbilder kommen nur aus einem vorhandenen lokalen Ordner und werden einmal kopiert",async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tecmon-radar-"));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=path.join(dir,"old-csdm");
  const radars=path.join(source,"resources","static","images","maps","cs2","radars");
  await mkdir(radars,{recursive:true});
  await writeFile(path.join(radars,"de_dust2.png"),"png");
  await writeFile(path.join(radars,"evil.png"),"png");
  await writeFile(path.join(radars,"de_mirage.txt"),"x");
  const target=path.join(dir,"radars");
  assert.equal(await copyRadars(target,["",path.join(dir,"missing"),source]),1);
  assert.equal(await copyRadars(target,[source]),0);
  assert.equal(radarFile(target,"de_dust2"),path.join(target,"de_dust2.png"));
  assert.equal(radarFile(target,"../de_dust2"),"");
  assert.equal(radarFile(target,"de_inferno"),"");
});

test("update acknowledgement reaches client before service closes and signals process exit",async t=>{
  let exited=false;
  const server=http.createServer((_req,res)=>{updateHandoff(server,res,()=>{exited=true;},200);res.end(JSON.stringify({latest:"0.6.1"}));});
  server.listen(0,"127.0.0.1");await once(server,"listening");
  t.after(()=>{server.closeAllConnections();server.close();});
  const result=await (await fetch(`http://127.0.0.1:${server.address().port}`)).json();
  assert.equal(result.latest,"0.6.1");assert.equal(exited,false);
  await once(server,"close");assert.equal(exited,true);
});

for(const disconnectedBeforeHandoff of [false,true])test(`verified update exits once when client disconnects ${disconnectedBeforeHandoff?'during download':'before acknowledgement'}`,{timeout:3000},async t=>{
  let exited=0,entered;
  const ready=new Promise(resolve=>{entered=resolve;});
  const server=http.createServer(async(_req,res)=>{
    const closed=once(res,'close');entered();
    if(disconnectedBeforeHandoff)await closed;
    updateHandoff(server,res,()=>{exited++;},40);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const finished=once(server,'close');
  const client=http.get(`http://127.0.0.1:${server.address().port}`);
  client.on('error',()=>{});
  t.after(()=>{client.destroy();server.closeAllConnections();server.close();});
  await ready;client.destroy();await finished;
  assert.equal(exited,1);
});
