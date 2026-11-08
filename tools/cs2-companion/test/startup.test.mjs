import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {once} from "node:events";
import {mkdtemp,writeFile,mkdir,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {lazyEngine} from "../lazy-engine.mjs";
import {createCompanion} from "../server.mjs";
import {updateHandoff} from "../update-handoff.mjs";
import {stopManagedDatabase} from "../managed-installation.mjs";

test("engine startup is lazy, concurrent calls share work and failures can be retried",async()=>{
  let count=0;let release;const gate=new Promise(resolve=>{release=resolve;});
  const prepare=lazyEngine(async()=>{count++;await gate;if(count===1)throw new Error("startup failed");});
  assert.equal(count,0);const a=prepare(),b=prepare();assert.equal(a,b);release();
  await assert.rejects(a,/startup failed/);await prepare();assert.equal(count,2);
});

test("opening managed Companion starts no database or CSDM; a confirmed download starts it on demand",async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),"tecmon-lazy-"));
  const exe=path.join(dir,"csdm.exe");await writeFile(exe,"fixture");
  let starts=0,runs=0;
  const installation={dataDir:dir,profileDir:path.join(dir,"profile"),postgresBin:path.join(dir,"pg"),port:25433,csdmExe:exe,cs2Exe:""};
  const {server,token}=await createCompanion({installation,startDatabase:async()=>{starts++;},stopDatabase:async()=>{},runProcess:async(_exe,args)=>{
    runs++;await mkdir(args[3],{recursive:true});await writeFile(path.join(args[3],"match.dem"),"PBDEMS2\0fixture");
  }});
  server.listen(0,"127.0.0.1");await once(server,"listening");
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={"x-tecmon-token":token,"content-type":"application/json"};
  const state=async()=> (await fetch(base+"/api/state",{headers})).json();
  assert.equal((await state()).postgres.lazy,true);assert.equal(starts,0);assert.equal(runs,0);
  const response=await fetch(base+"/api/demos/download",{method:"POST",headers,body:JSON.stringify({format:"tecmon-match-download",version:1,shareCodes:["CSGO-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA"],confirm:true,csdm:exe})});
  assert.equal(response.status,202);
  let result;for(let i=0;i<50;i++){result=await state();if(!result.active)break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(starts,1);assert.equal(runs,1);assert.equal(result.postgres.ready,true);assert.equal(result.downloads[0].status,"done");
});

test("stopping an idle private database is safe while other failures remain visible",async()=>{
  let calls=0;const config={postgresBin:"pg",clusterDir:"private"};
  await stopManagedDatabase(config,async()=>{calls++;throw Object.assign(new Error("not running"),{exitCode:3});});
  assert.equal(calls,1);
  await assert.rejects(stopManagedDatabase(config,async()=>{throw Object.assign(new Error("permission denied"),{exitCode:1});}),/permission/);
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
