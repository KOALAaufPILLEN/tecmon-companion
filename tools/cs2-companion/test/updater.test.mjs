import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {checkUpdate,downloadUpdate} from '../updater.mjs';
const prefix='https://github.com/KOALAaufPILLEN/tecmon-companion/releases/download/v0.4.1/';
const contents=Buffer.from('test update, not executable');
const manifest={version:'0.4.1',filename:'TecMon-Companion-Update-0.4.1.exe',size:contents.length,sha256:createHash('sha256').update(contents).digest('hex')};
const release={tag_name:'v0.4.1',draft:false,prerelease:false,assets:[{name:'TecMon-Companion-Update.json',browser_download_url:prefix+'TecMon-Companion-Update.json'},{name:manifest.filename,browser_download_url:prefix+manifest.filename,size:contents.length}]};
const request=async(url)=>Response.json(url.endsWith('/latest')?release:manifest);
test('updater finds stable, newer release without accepting external asset URLs',async()=>{
  const update=await checkUpdate('0.4.0',request);
  assert.equal(update.available,true);assert.equal(update.latest,'0.4.1');
  assert.equal((await checkUpdate('0.4.1',request)).available,false);
  await assert.rejects(checkUpdate('0.4.0',async(url)=>Response.json(url.endsWith('/latest')?{...release,assets:release.assets.map(a=>({...a,browser_download_url:'https://evil.example/file'}))}:manifest)),/Manifest/);
  await assert.rejects(checkUpdate('0.4.0',async()=>Response.json({...release,prerelease:true})),/stabile/);
});
test('updater verifies size and SHA256 before saving any executable',async(t)=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'tecmon-update-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const update=await checkUpdate('0.4.0',request);
  await assert.rejects(downloadUpdate(root,update,async()=>new Response(Buffer.from('wrong'))),/Prüfsumme/);
  const file=await downloadUpdate(root,update,async()=>new Response(contents));
  assert.deepEqual(await readFile(file),contents);
  assert.ok(file.startsWith(path.join(root,'updates')));
});
