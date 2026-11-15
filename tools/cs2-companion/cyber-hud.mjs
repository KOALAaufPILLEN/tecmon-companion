/** Code-owned positions. Dynamic names stay in locked text files, never filter expressions.
 * hud2 = HUD v2 (Eingang 2 = hud-v2.png aus dem Video-Paket), dessen Farben langsam wechseln,
 * filter = fertiger Teilgraph [game0] -> [game] (video-filters.mjs), nur auf das Gameplay, nie auf das HUD.
 */
/** Name des Mehrfach-Kills nach der Kill-Nummer in der Runde (feste Wörter, kein Text aus dem Auftrag). */
export function killWords(n){
 return n>=5?['ACE','ALL 5 ENEMIES']:n===4?['4K','QUAD KILL']:n===3?['3K','TRIPLE KILL']:n===2?['2K','DOUBLE KILL']:['1K','KILL'];
}
/** Lage der Kill-Anzeige: links neben dem Logo-Tab oben rechts (1920er Raster), gleiche Form wie der Tab. */
export const KILL_BADGE={x:1372,y:18,w:264,h:84};
/**
 * Kill-Anzeige aus den geprüften Bildern kill-badge.png (Eingang `plain`) und kill-badge-multi.png
 * (Eingang `multi`): je Kill 2,6 s bzw. bis zum nächsten Kill. Gibt den Teilgraphen von [input] nach [v].
 */
export function killBadges(kills,n,input,plain,multi){
 if(!kills||!kills.length)return `[${input}]null[v]`;
 const {x,y,w,h}=KILL_BADGE;
 // Jedes Bild nur so oft teilen, wie es gebraucht wird (FFmpeg verlangt verbundene Ausgänge).
 const pick=kills.map(k=>k.n>=2?'km':'kp');
 const parts=[];
 for(const [src,tag] of [[plain,'kp'],[multi,'km']]){
  const ids=pick.map((p,i)=>p===tag?i:-1).filter(i=>i>=0);
  if(ids.length)parts.push(`[${src}]scale=${n(w)}:${n(h)},split=${ids.length}${ids.map(i=>`[${tag}${i}]`).join('')}`);
 }
 let last=input;
 kills.forEach(({t,n:count,hs},i)=>{
  const end=kills[i+1]?Math.min(kills[i+1].t,t+2.6):t+2.6;
  const on=`between(t,${t.toFixed(2)},${end.toFixed(2)})`;
  const fade=`alpha='min(1,(t-${t.toFixed(2)})/0.12)'`;
  const [big,small]=killWords(count);
  const isMulti=count>=2;
  parts.push(`[${last}][${pick[i]}${i}]overlay=${n(x)}:${n(y)}:enable='${on}'[kb${i}]`);
  const label=`[kb${i}]`+[
   `drawtext=fontfile=font.ttf:text='${big}':fontsize=${n(44)}:fontcolor=${isMulti?'0xff9bed':'0x9cefff'}:shadowcolor=black@0.8:shadowx=2:shadowy=2:x=${n(x+30)}:y=${n(y+16)}:${fade}:enable='${on}'`,
   `drawtext=fontfile=font.ttf:text='${small}':fontsize=${n(22)}:fontcolor=0xefc96d:x=${n(x+112)}:y=${n(y+16)}:${fade}:enable='${on}'`,
   `drawtext=fontfile=font.ttf:text='${hs?'HEADSHOT':'KILL '+Math.min(count,10)+' THIS ROUND'}':fontsize=${n(13)}:fontcolor=${hs?'0xff9bed':'0x9cefff'}:x=${n(x+112)}:y=${n(y+46)}:${fade}:enable='${on}'`,
  ].join(',')+`[kt${i}]`;
  parts.push(label);last=`kt${i}`;
 });
 parts.push(`[${last}]null[v]`);
 return parts.join(';');
}

/** `kills`: Kill-Anzeige, braucht die Eingänge 3 (kill-badge.png) und 4 (kill-badge-multi.png). */
export function cyberHud({width,height,fps,playerFile,mapFile,sceneFile,playerLength,hud2=false,filter=null,kills=null}){
 const n=v=>Math.max(1,Math.round(v*width/1920));
 const text=(file,size,x,y,color,extra='')=>`drawtext=fontfile=font.ttf:textfile=${file}:expansion=none:fontsize=${n(size)}:fontcolor=${color}:shadowcolor=black@0.8:shadowx=1:shadowy=1:x=${n(x)}:y=${n(y)}${extra}`;
 const size=Math.min(44,Math.max(20,Math.floor(700/Math.max(playerLength,16))));
 const game=filter?`[0:v]scale=${width}:${height},setsar=1,fps=${fps}[game0];${filter};`:`[0:v]scale=${width}:${height},setsar=1,fps=${fps}[game];`;
 let hud=`[2:v]scale=${width}:${height}[hud];[game][hud]overlay=0:0[base];`;
 if(hud2){
  // HUD v2: nur die Farben wandern langsam (Cyan → Lila → Cyan), keine bewegten Teile.
  hud=`[2:v]scale=${width}:${height},format=yuva444p,hue=h='22*sin(2*PI*t/7)':s='1+0.12*sin(2*PI*t/7)'[hud];[game][hud]overlay=0:0[base];`;
 }
 return game+hud+
  `[1:v]scale=${n(56)}:${n(56)}[logo];[base][logo]overlay=${n(1660)}:${n(30)},`+
  [text('hud-brand.txt',26,1727,38,'0xefc96d'),text('hud-site.txt',14,1727,70,'0x9cefff'),
   text(mapFile,14,64,932,'0xb7efff'),text('hud-mode.txt',16,64,854,'0x85e8ef'),
   text(sceneFile,16,348,854,'0xb6a3ff'),text(playerFile,size,64,885,'0xf3d48c')].join(',')+
  (kills&&kills.length?'[hudtext];'+killBadges(kills,n,'hudtext','3:v','4:v'):'[v]');
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

/** Zwei wählbare Video-Stile aus dem geprüften Paket. Zeiten in Sekunden der geschnittenen Clips:
 * cut = Moment, in dem die Lichtspur/Figur das Bild deckt (dort wechselt das Gameplay darunter),
 * name = Einblendung des neuen Spielernamens, outroText = Website/Kanal im Outro.
 */
// Esport-Titelbild (Name im Banner, zerspringt in Stücke) und Esport-Spielerwechsel gelten für beide Stile.
const ESPORT={title:'title.mp4',titleSeconds:3.8,titleText:[0.95,3.0],titleKey:[0,255,0],stinger:'switch.mp4',stingerSeconds:2.8,cut:1.4,name:[0.85,1.95],nameY:[452,512],key:[0,255,0]};
export const MOTION_STYLES=Object.freeze({
 a:Object.freeze({...ESPORT,intro:'intro.mp4',introSeconds:6.46,outro:'outro.mp4',outroSeconds:5.47,outroText:[3.7,5.3],outroY:[0.74,0.82]}),
 b:Object.freeze({...ESPORT,intro:'intro-b.mp4',introSeconds:6.97,outro:'outro-b.mp4',outroSeconds:5.47,outroText:[3.9,5.2],outroY:[0.88,0.94]}),
});
/** Farbe des Greenscreens als FFmpeg-Wert. */
export function keyColor(key){return '0x'+key.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();}
/** Freistellen mit herausgerechnetem Grün (weiche Kanten ohne grauen Schleier). */
export function unmixGreen(key){
 const ch=(c,k)=>`${c}='clip((${c}(X,Y)-(255-alpha(X,Y))*${k}/255)*255/max(alpha(X,Y),8),0,255)'`;
 // Grün nach dem Herausrechnen höchstens so stark wie Rot oder Blau: keine grünen Ränder an
 // unscharfen Kanten, Gold und Lila bleiben unverändert.
 const g=ch('g',key[1]).replace(/^g='(.*)'$/,"g='min($1,max(r(X,Y),b(X,Y)))'");
 return [ch('r',key[0]),g,ch('b',key[2]),"a='alpha(X,Y)'"].join(':');
}
/** Greenscreen-Spielerwechsel: Eingang 0 = Stinger vor Grün, 1 = letztes Bild der alten Szene,
 * 2 = erstes Bild der neuen Szene. Der Stinger wird freigestellt und über das Gameplay gelegt;
 * unter der deckenden Spur wechselt das Bild weich. Kein Gameplay fällt weg, der Ton kommt vom Stinger.
 */
export function playerStinger({width,height,fps,nextFile,playerLength,style=MOTION_STYLES.a}){
 const n=v=>Math.max(1,Math.round(v*width/1920));
 const [from,to]=style.name;
 const fade=`alpha='if(lt(t,${from+0.15}),(t-${from})/0.15,if(gt(t,${to-0.25}),max(0,(${to}-t)/0.25),1))':enable='between(t,${from},${to})'`;
 const text=(file,size,y,color)=>`drawtext=fontfile=font.ttf:textfile=${file}:expansion=none:fontsize=${n(size)}:fontcolor=${color}:borderw=${n(3)}:bordercolor=black@0.75:shadowcolor=black@0.85:shadowx=${n(2)}:shadowy=${n(2)}:x=(w-text_w)/2:y=${n(y)}:${fade}`;
 const nameSize=Math.min(84,Math.max(36,Math.floor(1200/Math.max(playerLength,12))));
 const unmix=unmixGreen(style.key),key=keyColor(style.key);
 const hold=(input,label)=>`[${input}:v]scale=${width}:${height},setsar=1,fps=${fps},format=yuv420p,trim=end_frame=1,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${style.stingerSeconds+0.5}[${label}];`;
 return hold(1,'old')+hold(2,'next')+
  `[old][next]xfade=transition=fade:duration=0.3:offset=${(style.cut-0.15).toFixed(2)}[under];`+
  // Bis zum Deckmoment hartes Freistellen (Figur bleibt deckend), danach weiches Freistellen mit
  // herausgerechnetem Grün, damit Partikel und Glühen ohne grauen Schleier über dem Gameplay liegen.
  `[0:v]scale=1280:720,setsar=1,fps=${fps},setpts=PTS-STARTPTS,split[g1][g2];`+
  `[g1]colorkey=${key}:0.16:0.03,format=gbrap,geq=${unmix},scale=${width}:${height}[hard];`+
  `[g2]colorkey=${key}:0.18:0.10,format=gbrap,geq=${unmix},scale=${width}:${height}[soft];`+
  `[under][hard]overlay=0:0:eof_action=pass:enable='lt(t,${style.cut})'[o1];`+
  `[o1][soft]overlay=0:0:eof_action=pass:enable='gte(t,${style.cut})',format=yuv420p,`+
  [text('switch-label.txt',28,style.nameY[0],'0x85e8ef'),text(nextFile,nameSize,style.nameY[1],'0xefc96d')].join(',')+'[v]';
}

/** Überblendlänge je Übergang (Sekunden), höchstens ein Drittel des kürzeren Teils. */
export function blendSeconds(previous,next){
 const base=previous.kind==='film'?0.5:next.kind==='switch'?0.3:previous.kind==='switch'?0.4:previous.kind==='title'?0.12:next.kind==='outro'?0.45:0.3;
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
