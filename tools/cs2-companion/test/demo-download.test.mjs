import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import { downloadDemo } from "../demo-download.mjs";
import { matchDownloadRequest, shareCode } from "../share-code.mjs";
import { recordingConfig, validateJob } from "../job.mjs";
import { createCompanion } from "../server.mjs";
const code="CSGO-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA";
test("sharecode imports reject URLs, injected flags, credentials and excessive batches",()=>{
  for(const value of ['--output C:\\private', 'http://localhost/private', `${code} && whoami`, code.replace('AAAAA','00000')]) assert.throws(()=>shareCode(value));
  assert.deepEqual(matchDownloadRequest({format:'tecmon-match-download',version:1,shareCodes:[code,code],apiKey:'untrusted'}),[code]);
  assert.throws(()=>matchDownloadRequest({format:'tecmon-match-download',version:1,shareCodes:Array(11).fill(code)}));
});
test("several players produce one concatenated recording with the correct POV per scene",()=>{
  const sequences=[0,1,2].map((i)=>({startTick:i*128,endTick:i*128+64,steamId:String(76561198000000000n+BigInt(i)),playerName:`Player ${i}`}));
  const job=validateJob({format:'tecmon-cs2-job',version:1,tickRate:64,sequences,shareCode:code});
  assert.equal(job.shareCode,code);
  const result=recordingConfig(job,'match.dem','out','1080p60');
  assert.equal(result.concatenateSequences,true);
  assert.deepEqual(result.sequences.map(s=>s.playerCameras[0].playerSteamId),sequences.map(s=>s.steamId));
});
test("download resolves through fixed CLI arguments and rejects success without a real CS2 file",async(t)=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tecmon-download-')); t.after(()=>rm(root,{recursive:true,force:true}));
  const dir=path.join(root,'match');
  await assert.rejects(downloadDemo({code,directory:dir,exe:'csdm.exe',run:async()=>{},entry:{log:''}}),/Keine eindeutige/);
  await writeFile(path.join(dir,'match.dem'),'HTML failure');
  await assert.rejects(downloadDemo({code,directory:dir,exe:'csdm.exe',run:async()=>{},entry:{log:''}}),/keine entpackte/);
  const demo=await downloadDemo({code,directory:dir,exe:'csdm.exe',entry:{log:''},run:async(exe,args)=>{
    assert.deepEqual(args,['dl-valve',code,'--output',dir]);
    await writeFile(path.join(dir,'match.dem'),Buffer.from('PBDEMS2\0fixture'));
  }});
  assert.equal(demo,await realpath(path.join(dir,'match.dem')));
});
test("local download requires session, origin and explicit confirmation; recording shares its busy lock",async(t)=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'tecmon-download-api-'));
  const exe=path.join(dir,'csdm.exe'); await writeFile(exe,'fixture');
  let release; const wait=new Promise(resolve=>{release=resolve;});
  const {server,token}=await createCompanion({dataDir:dir,runProcess:async(_exe,args)=>{
    await wait; await mkdir(args[3],{recursive:true}); await writeFile(path.join(args[3],'match.dem'),Buffer.from('PBDEMS2\0fixture'));
  }});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async()=>{release();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${server.address().port}`;
  const body={format:'tecmon-match-download',version:1,shareCodes:[code],csdm:exe,confirm:true};
  const headers={'content-type':'application/json','x-tecmon-token':token};
  const post=(value,extra={})=>fetch(base+'/api/demos/download',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(value)});
  assert.equal((await post(body,{'x-tecmon-token':'wrong'})).status,401);
  assert.equal((await post(body,{origin:'https://evil.example'})).status,403);
  assert.equal((await post({...body,confirm:false})).status,400);
  assert.equal((await post(body)).status,202);
  assert.equal((await post(body)).status,400);
  release();
  let state;
  for(let i=0;i<100;i++) {
    state=await (await fetch(base+'/api/state',{headers})).json();
    if(!state.active) break;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(state.downloads[0].status,'done');
  assert.ok(state.downloads[0].demo.endsWith('match.dem'));
});
