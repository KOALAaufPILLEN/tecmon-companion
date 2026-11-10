import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
export const VERSION = "0.16.0";
const repo = "https://api.github.com/repos/KOALAaufPILLEN/tecmon-companion";
const releasePrefix = "https://github.com/KOALAaufPILLEN/tecmon-companion/releases/download/";
const version = /^\d+\.\d+\.\d+$/;
const newer = (a, b) => {
  const left=a.split('.').map(Number), right=b.split('.').map(Number);
  for(let i=0;i<3;i++) if(left[i]!==right[i]) return left[i]>right[i];
  return false;
};
async function json(url, request) {
  const response=await request(url,{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw new Error(`GitHub-Updateprüfung fehlgeschlagen (${response.status}).`);
  return response.json();
}
export async function checkUpdate(current=VERSION, request=fetch) {
  const release=await json(`${repo}/releases/latest`,request);
  if(release.draft || release.prerelease) throw new Error('Keine stabile Update-Version verfügbar.');
  const next=String(release.tag_name||'').replace(/^v/,'');
  if(!version.test(next) || !version.test(current)) throw new Error('Ungültige Update-Version.');
  if(!newer(next,current)) return {available:false,current,latest:next};
  const manifestAsset=release.assets?.find(a=>a.name==='TecMon-Companion-Update.json');
  const prefix=`${releasePrefix}v${next}/`;
  if(manifestAsset?.browser_download_url!==prefix+'TecMon-Companion-Update.json') throw new Error('Update-Manifest fehlt.');
  const manifest=await json(manifestAsset.browser_download_url,request);
  const filename=`TecMon-Companion-Update-${next}.exe`;
  const binary=release.assets?.find(a=>a.name===filename);
  if(manifest.version!==next || manifest.filename!==filename || !/^[a-f0-9]{64}$/i.test(manifest.sha256) ||
    !Number.isSafeInteger(manifest.size) || manifest.size<1 || manifest.size>20*1024*1024 ||
    binary?.browser_download_url!==prefix+filename || binary.size!==manifest.size)
    throw new Error('Ungültiges Update-Paket.');
  return {available:true,current,latest:next,sha256:manifest.sha256.toLowerCase(),size:manifest.size,url:binary.browser_download_url};
}
export async function downloadUpdate(root, update, request=fetch) {
  if(!update.available || !update.url.startsWith(releasePrefix) || update.size>20*1024*1024) throw new Error('Update nicht bestätigt.');
  const response=await request(update.url,{signal:AbortSignal.timeout(120000)});
  if(!response.ok || !response.body) throw new Error('Update konnte nicht heruntergeladen werden.');
  let bytes=0; const chunks=[];
  for await(const chunk of response.body) {
    bytes+=chunk.length;
    if(bytes>update.size) throw new Error('Update größer als angekündigt.');
    chunks.push(Buffer.from(chunk));
  }
  const contents=Buffer.concat(chunks);
  if(bytes!==update.size || createHash('sha256').update(contents).digest('hex')!==update.sha256)
    throw new Error('Update-Prüfsumme stimmt nicht überein. Update wird nicht gestartet.');
  const directory=path.join(root,'updates'); await mkdir(directory,{recursive:true});
  const file=path.join(directory,`update-${randomUUID()}.exe`);
  await writeFile(file,contents,{flag:'wx'});
  return file;
}
