// Hand-drawn static interpretations, not original assets or game configuration values.
// Catalog: tecmon/core/games/types.ts + Companion GAME_CATALOG, 2026-11-28.
function image(kind, color) {
  const width=32,height=32,mask=new Set(),point=(x,y)=>{if(x>=0&&y>=0&&x<32&&y<32)mask.add(y*32+x);};
  const rect=(x,y,w,h)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)point(i,j);};
  if(kind==='dot')rect(15,15,2,2);
  if(kind==='cross'||kind==='pips'){const gap=kind==='pips'?5:3,len=kind==='pips'?7:5;rect(16+gap,15,len,2);rect(16-gap-len,15,len,2);rect(15,16+gap,2,len);rect(15,16-gap-len,2,len);}
  if(kind==='circle'||kind==='circle-dot')for(let y=0;y<32;y++)for(let x=0;x<32;x++){const r=Math.hypot(x-15.5,y-15.5);if(r>=7&&r<8.5)point(x,y);}
  if(kind==='circle-dot')rect(15,15,2,2);
  if(kind==='square'){rect(9,9,14,2);rect(9,21,14,2);rect(9,11,2,10);rect(21,11,2,10);}
  if(kind==='brackets'||kind==='quadrant'){
    const lo=kind==='brackets'?6:9,hi=31-lo,n=kind==='brackets'?6:4;
    for(const x of [lo,hi-n+1])for(const y of [lo,hi-n+1]){const left=x===lo,top=y===lo;rect(x,top?y:y+n-2,n,2);rect(left?x:x+n-2,y,2,n);}
  }
  const bytes=Buffer.alloc(width*height*4),rgb=color.match(/../g).map(v=>parseInt(v,16));
  for(const p of mask){const x=p%32,y=Math.floor(p/32);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=(y+dy)*32+x+dx;if(x+dx>=0&&x+dx<32&&y+dy>=0&&y+dy<32)bytes[i*4+3]=210;}}
  for(const p of mask){bytes[p*4]=rgb[0];bytes[p*4+1]=rgb[1];bytes[p*4+2]=rgb[2];bytes[p*4+3]=255;}
  return {width,height,pixels:bytes.toString('base64')};
}
const choices=(color,items)=>items.map(([id,label,kind])=>({id,label,artwork:image(kind,color),imageSize:32}));
const noPreset='Hier ist keine passende statische Fadenkreuz-Vorlage hinterlegt. Mauszeiger und spielinterne Zielmarkierungen werden nicht verändert.';
export const CROSSHAIR_GAMES = [
  {id:'cs2',label:'Counter-Strike 2',note:'Kreuz, Punkt, Kreis, Quadrat und Quadranten als statische Overlay-Nachbildungen. Keine Rückstoß- oder Streuungsanzeige.',presets:choices('80fa50', [['cross','Kreuz','cross'],['dot','Punkt','dot'],['circle','Kreis','circle'],['square','Quadrat','square'],['quadrant','Quadranten','quadrant']])},
  {id:'valorant',label:'Valorant',note:'Kompaktes Kreuz, Punkt oder offene Ecken. Statische Alternativen ohne Bewegungs- und Schussfehler-Anzeige.',presets:choices('50fafa',[['cross','Kompaktes Kreuz','cross'],['dot','Präzisionspunkt','dot'],['brackets','Offene Ecken','quadrant']])},
  {id:'apex',label:'Apex Legends',note:'Einfache Zielmarken als Overlay-Alternativen. Kein automatischer Wechsel mit Waffe oder Visier.',presets:choices('fa6060',[['dot','Visierpunkt','dot'],['ring','Kreis mit Punkt','circle-dot'],['cross','Kleines Kreuz','cross']])},
  {id:'fortnite',label:'Fortnite',note:'Statische Vorlagen für die Bildschirmmitte. Waffenabhängige Streuung und Trefferfeedback werden nicht nachgebildet.',presets:choices('ffffff',[['cross','Rifle-Kreuz','cross'],['brackets','Breite Ecken','brackets'],['dot','Kleiner Punkt','dot']])},
  {id:'deadlock',label:'Deadlock',note:'Vier Striche, ein Punkt oder ein Ring. Unabhängig von Held, Fähigkeit und Waffenstreuung statisch.',presets:choices('ffffff',[['pips','Vier Striche','pips'],['dot','Mittelpunkt','dot'],['ring','Offener Ring','circle']])},
  {id:'gearsofwar',label:'Gears of War',note:'Eigene statische Alternativen. Kein waffenabhängiger Gnasher-Streukreis.',presets:choices('ffffff',[['brackets','Breite Zielmarke','brackets'],['cross','Rifle-Kreuz','cross'],['dot','Präzisionspunkt','dot']])},
  {id:'wardogs',label:'Wardogs',note:'Neutrale statische Alternativen. Kein automatischer Wechsel oder Ausblenden beim Zielen.',presets:choices('ffffff',[['pips','Offenes Kreuz','pips'],['dot','Kleiner Mittelpunkt','dot']])},
  ...[['lol','League of Legends'],['dota2','Dota 2'],['wow','World of Warcraft'],['aion','Aion & Aion 2'],['poe1','Path of Exile'],['poe2','Path of Exile 2']].map(([id,label])=>({id,label,note:noPreset,presets:[]})),
];
export function gameCrosshair(key){
  if(typeof key!=='string')return null;
  for(const game of CROSSHAIR_GAMES)for(const preset of game.presets)if(`${game.id}:${preset.id}`===key)return {game,preset};
  return null;
}
