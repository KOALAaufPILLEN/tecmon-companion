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
