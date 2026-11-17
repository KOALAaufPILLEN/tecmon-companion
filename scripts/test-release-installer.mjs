// Runs only against a fresh, isolated test directory, never a user's installation.
import path from 'node:path';
import {access, readFile, readdir, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
const run=promisify(execFile);
const [installerArg, baseArg, version]=process.argv.slice(2);
if(!installerArg||!baseArg||!/^\d+\.\d+\.\d+$/.test(version))throw Error('Installer, fresh test directory and version required');
const installer=path.resolve(installerArg),base=path.resolve(baseArg),root=path.join(base,'app');
try{await access(base);throw Error('Fresh test directory required');}catch(e){if(e.code!=='ENOENT')throw e;}
await run(installer,['--extract-test',root],{windowsHide:true,timeout:180000});
async function pristine(folder){
  for(const entry of await readdir(folder,{withFileTypes:true})){
    if(/^(installation(?:\.pending)?\.json|settings\.json|\.env(?:\..*)?|PG_VERSION|postmaster\.pid|.*\.tmp)$/i.test(entry.name))throw Error('User configuration in release payload');
    if(entry.isDirectory())await pristine(path.join(folder,entry.name));
  }
}
await pristine(root);
const api=await import(pathToFileURL(path.join(root,'managed-installation.mjs')));
for(const name of ['tools/csdm','tools/postgresql','csdm-defaults.json','postgresql.mjs']){
  try{await access(path.join(root,name));throw Error('Removed component still in payload: '+name);}catch(e){if(e.code!=='ENOENT')throw e;}
}
let config;
try{
  config=await api.setupManagedInstallation(root,{dataDir:path.join(base,'data'),acceptLicenses:true},message=>console.log(message));
  if(config.version!==version)throw Error('Installed version mismatch');
  for(const key of ['postgresBin','clusterDir','csdmExe','port'])if(key in config)throw Error('Database field in fresh installation: '+key);
  // Erneute Einrichtung (Reparatur) mit derselben Installation bleibt möglich.
  config=await api.setupManagedInstallation(root,{dataDir:config.dataDir,acceptLicenses:true},()=>{});
  await api.runTool(config.ffmpegExe,['-version']);
  if(process.argv[5]){
    const {verifyBrandingPack}=await import(pathToFileURL(path.join(root,'branding-assets.mjs')));
    const {renderBranding,sequenceFile,probeVideo}=await import(pathToFileURL(path.join(root,'video-branding.mjs')));
    const assets=verifyBrandingPack(await readFile(path.resolve(process.argv[5])));
    const directory=path.join(base,'synthetic-recording');await mkdir(directory);
    const first={startTick:64,endTick:96,steamId:'76561198000000000',playerName:'Alpha'};
    const second={startTick:128,endTick:160,steamId:'76561198000000001',playerName:'Beta'};
    const third={...second,startTick:192,endTick:224};
    const job={format:'tecmon-cs2-job',version:1,map:'de_dust2',tickRate:64,sequences:[first,second,third],branding:{enabled:true,intro:false,outro:false}};
    const fixture=path.join(directory,'synthetic.mp4');
    await api.runTool(config.ffmpegExe,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=1280x720:rate=30','-t','0.6','-c:v','libx264','-preset','ultrafast',fixture]);
    for(let i=0;i<job.sequences.length;i++)await copyFile(fixture,path.join(directory,sequenceFile(job.sequences[i],i)));
    const video=await renderBranding({job,directory,assets,ffmpeg:config.ffmpegExe,launcher:path.join(root,'TecMon Companion.exe')});
    const info=await probeVideo(config.ffmpegExe,video);
    if(Math.abs(info.duration-2.9)>0.12)throw Error('Stinger did not preserve full scenes or appeared on repeated POV');
    console.log('PASS: real native-locked FFmpeg render, persistent cyber HUD, one animated player switch, repeated POV without extra stinger, complete scene durations.');
  }
  console.log('PASS: pristine installer without CS Demo Manager and PostgreSQL, fresh setup, repeated setup and FFmpeg. No game recording performed.');
}catch(error){
  console.error(String(error.message));
  process.exitCode=1;
}
