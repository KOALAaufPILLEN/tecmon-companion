/** Code-owned positions. Dynamic names stay in locked text files, never filter expressions. */
export function cyberHud({width,height,fps,playerFile,mapFile,sceneFile,playerLength}){
 const n=v=>Math.max(1,Math.round(v*width/1920));
 const text=(file,size,x,y,color,extra='')=>`drawtext=fontfile=font.ttf:textfile=${file}:expansion=none:fontsize=${n(size)}:fontcolor=${color}:shadowcolor=black@0.8:shadowx=1:shadowy=1:x=${n(x)}:y=${n(y)}${extra}`;
 const size=Math.min(44,Math.max(20,Math.floor(700/Math.max(playerLength,16))));
 return `[0:v]scale=${width}:${height},setsar=1,fps=${fps}[game];[2:v]scale=${width}:${height}[hud];[game][hud]overlay=0:0[base];`+
  `[1:v]scale=${n(56)}:${n(56)}[logo];[base][logo]overlay=${n(1660)}:${n(30)},`+
  [text('hud-brand.txt',26,1727,38,'0xefc96d'),text('hud-site.txt',14,1727,70,'0x9cefff'),
   text(mapFile,14,64,932,'0xb7efff'),text('hud-mode.txt',16,64,854,'0x85e8ef'),
   text(sceneFile,16,348,854,'0xb6a3ff'),text(playerFile,size,64,885,'0xf3d48c')].join(',')+'[v]';
}

export const SWITCH_SECONDS=1.1;
/** Freeze outgoing/incoming frames, switch underneath a fully opaque travelling curtain.
 * No gameplay is shortened. The inserted stinger contains silence, never repeats old game audio.
 */
export function playerSwitch({width,height,fps,nextFile,playerLength}){
 const n=v=>Math.max(1,Math.round(v*width/1920));
 const freeze=(input,label)=>`[${input}:v]scale=${width}:${height},fps=${fps},trim=end_frame=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1.2,format=yuv420p[${label}];`;
 const text=(file,size,y,color)=>`drawtext=fontfile=font.ttf:textfile=${file}:expansion=none:fontsize=${n(size)}:fontcolor=${color}:x=(w-text_w)/2:y=${n(y)}`;
 return freeze(0,'old')+freeze(1,'next')+
  `[old][next]xfade=transition=fade:duration=0.05:offset=0.5[game];`+
  `[2:v]scale=${width}:${height}[plate];[3:v]scale=${n(150)}:${n(150)}[logo];[plate][logo]overlay=(W-w)/2:${n(168)},`+
  [text('switch-label.txt',30,392,'0x85e8ef'),text(nextFile,Math.min(100,Math.max(36,Math.floor(1200/Math.max(playerLength,12)))),465,'0xefc96d'),text('switch-footer.txt',24,675,'0xbba4ff')].join(',')+
  `[curtain];[game][curtain]overlay=x='if(lt(t,0.32),W*(1-t/0.32),if(lt(t,0.78),0,-W*(t-0.78)/0.32))':y=0:eval=frame[v]`;
}

export const STINGER_SECONDS=2.8;
/** Animierter Spielerwechsel aus dem geprüften Video-Paket (stinger.mp4, Eingang 0).
 * TecMon zieht mit Lichtspur durchs Bild; im Partikelsturm (1,5–2,6 s) erscheint der neue Spielername. Die weichen Überblendungen aus der
 * alten und in die neue Szene macht die Endmontage (crossfadeGraph), kein Gameplay fällt weg.
 */
export function playerStinger({width,height,fps,nextFile,playerLength}){
 const n=v=>Math.max(1,Math.round(v*width/1920));
 const fade=`alpha='if(lt(t,1.65),(t-1.5)/0.15,if(gt(t,2.35),max(0,(2.6-t)/0.25),1))':enable='between(t,1.5,2.6)'`;
 const text=(file,size,y,color)=>`drawtext=fontfile=font.ttf:textfile=${file}:expansion=none:fontsize=${n(size)}:fontcolor=${color}:borderw=${n(3)}:bordercolor=black@0.75:shadowcolor=black@0.85:shadowx=${n(2)}:shadowy=${n(2)}:x=(w-text_w)/2:y=${n(y)}:${fade}`;
 const nameSize=Math.min(96,Math.max(36,Math.floor(1200/Math.max(playerLength,12))));
 return `[0:v]scale=${width}:${height},setsar=1,fps=${fps},format=yuv420p,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=0.5,`+
  [text('switch-label.txt',28,735,'0x85e8ef'),text(nextFile,nameSize,775,'0xefc96d')].join(',')+'[v]';
}

/** Überblendlänge je Übergang (Sekunden), höchstens ein Drittel des kürzeren Teils. */
export function blendSeconds(previous,next){
 const base=previous.kind==='film'?0.5:next.kind==='switch'?0.3:previous.kind==='switch'?0.4:previous.kind==='title'||next.kind==='outro'?0.45:0.3;
 return Math.min(base,previous.duration/3,next.duration/3);
}
/** Endmontage mit echten Überblendungen statt harter Schnitte: Bild per xfade, Ton per acrossfade. */
export function crossfadeGraph(parts,fps){
 const prep=parts.map((p,i)=>`[${i}:v]fps=${fps},format=yuv420p,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v${i}];[${i}:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}];`).join('');
 let video='v0',audio='a0',length=parts[0].duration,chain='';
 for(let i=1;i<parts.length;i++){
  const d=blendSeconds(parts[i-1],parts[i]);
  const last=i===parts.length-1;
  const vo=last?'v':`x${i}`,ao=last?'a':`y${i}`;
  chain+=`[${video}][v${i}]xfade=transition=fade:duration=${d.toFixed(3)}:offset=${(length-d).toFixed(3)}[${vo}];[${audio}][a${i}]acrossfade=d=${d.toFixed(3)}[${ao}];`;
  video=vo;audio=ao;length+=parts[i].duration-d;
 }
 if(parts.length===1) chain='[v0]null[v];[a0]anull[a];';
 return {graph:(prep+chain).replace(/;$/,''),duration:length};
}
