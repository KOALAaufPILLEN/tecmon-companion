import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {CROSSHAIR_GAMES} from '../game-crosshairs.mjs';
import {parseCrosshairConfig, DEFAULT_CROSSHAIR, DEFAULT_OVERLAY, PRESETS, STYLES} from '../crosshair.mjs';

// Execute the real browser event handlers; catch inconsistent shape/checkbox/draft state.
async function editor(tStyle=false) {
  const elements=new Map(), paints=[];
  const context={createLinearGradient:()=>({addColorStop(){}}),fillRect:(...args)=>paints.push(['rect',...args]),save(){},restore(){},translate(){},rotate(){},beginPath(){},arc:()=>paints.push(['circle']),stroke(){}};
  function element(){return {value:'',checked:false,disabled:false,hidden:true,width:200,nextElementSibling:{tagName:'OUTPUT'},classList:{toggle(){}},listeners:{},setAttribute(){},addEventListener(name,fn){this.listeners[name]=fn;},append(...children){this.children=children;},replaceChildren(...children){this.children=children;},getContext:()=>context};}
  const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const info={crosshair:{...DEFAULT_CROSSHAIR,tStyle,color:[...DEFAULT_CROSSHAIR.color]},overlay:{...DEFAULT_OVERLAY,shape:'circle',notice:[],noticeVersion:2},overlayDefaults:DEFAULT_OVERLAY,presets:PRESETS,styles:STYLES,gamePresets:CROSSHAIR_GAMES};
  const saves=[];
  const api=async(url,input)=>{if(url==='/api/crosshair/import-cfg')return parseCrosshairConfig(input.text,input.crosshair);if(input){saves.push({url,input:structuredClone(input)});if(url==='/api/crosshair/profile'){info.crosshair=structuredClone(input.crosshair);info.overlay={...info.overlay,...structuredClone(input.overlay)};}}return structuredClone(info);};
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const start=source.indexOf('let crosshair=null,'),end=source.indexOf('/* CFG-Sammlung:',start);
  const ctx=vm.createContext({$,el:element,api,notice(){},document:{addEventListener(){}},navigator:{},console,structuredClone});
  vm.runInContext(source.slice(start,end),ctx);
  await new Promise(resolve=>setImmediate(resolve));
  const event=async(id,name,value)=>{const e=$(id);if(typeof value==='boolean')e.checked=value;else if(value!==undefined)e.value=String(value);await e.listeners[name]({target:e});};
  return {$,paints,event,saves,info};
}
test('T checkbox switches circle to a visible T and persists matching native options',async()=>{
  const e=await editor();
  assert.equal(e.$('crosshair-size').disabled,true);assert.equal(e.$('overlay-radius').disabled,false);
  await e.event('crosshair-tStyle','change',true);
  assert.equal(e.$('overlay-shape').value,'t');assert.equal(e.$('crosshair-size').disabled,false);
  assert.equal(e.$('overlay-radius').disabled,true);
  await e.event('crosshair-save','click');
  assert.equal(e.saves[0].input.crosshair.tStyle,true);assert.equal(e.saves[0].input.overlay.shape,'cross');
});
test('shape selector and checkbox stay synchronized; point preset can become a visible cross',async()=>{
  const e=await editor();
  await e.event('overlay-shape','input','t');assert.equal(e.$('crosshair-tStyle').checked,true);
  await e.event('overlay-shape','input','circle');assert.equal(e.$('crosshair-tStyle').checked,false);
  assert.equal(e.$('crosshair-gap').disabled,true);
  await e.event('crosshair-size','input',0);
  await e.event('overlay-shape','input','cross');assert.equal(e.$('crosshair-tStyle').checked,false);
  assert.ok(Number(e.$('crosshair-size').value)>0);
});
test('point and outline controls follow their switches; shape edits change actual drawing',async()=>{
  const e=await editor();
  assert.equal(e.$('overlay-dotSize').disabled,true);
  await e.event('crosshair-dot','change',true);assert.equal(e.$('overlay-dotSize').disabled,false);
  await e.event('crosshair-outline','change',false);assert.equal(e.$('crosshair-outlineThickness').disabled,true);
  e.paints.length=0;await e.event('overlay-shape','input','t');
  assert.equal(e.paints.filter(p=>p[0]==='circle').length,0);
  e.paints.length=0;await e.event('overlay-shape','input','circle');
  assert.ok(e.paints.some(p=>p[0]==='circle'));
});

test('older circle profiles with a hidden T flag load consistently and can switch to T',async()=>{
  const e=await editor(true);
  assert.equal(e.$('overlay-shape').value,'circle');assert.equal(e.$('crosshair-tStyle').checked,false);
  await e.event('crosshair-tStyle','change',true);
  assert.equal(e.$('overlay-shape').value,'t');assert.equal(e.$('crosshair-tStyle').checked,true);
});

test('game selector filters without changing draft; a template saves bounded artwork and keeps screen settings',async()=>{
  const e=await editor();
  assert.equal(e.$('crosshair-panel-games').hidden,false);
  assert.equal(e.$('crosshair-panel-classic').hidden,true);
  assert.equal(e.$('crosshair-game').children.length,13);
  await e.event('crosshair-game','change','valorant');
  assert.equal(e.$('crosshair-game-presets').children.length,3);
  await e.event('crosshair-save','click');
  assert.equal(e.saves.at(-1).input.overlay.shape,'circle','browsing must preserve the existing crosshair');
  await e.$('crosshair-game-presets').children[1].listeners.click();
  await e.event('crosshair-save','click');
  const saved=e.saves.at(-1).input.overlay;
  assert.equal(saved.gamePreset,'valorant:dot');assert.equal(saved.shape,'image');
  assert.equal(saved.target,e.info.overlay.target);assert.equal(saved.enabled,e.info.overlay.enabled);
  assert.equal(saved.artwork.pixels,CROSSHAIR_GAMES.find(g=>g.id==='valorant').presets[1].artwork.pixels);
  await e.event('crosshair-game','change','wow');
  assert.equal(e.$('crosshair-game-presets').children.length,0);
  assert.match(e.$('crosshair-game-note').textContent,/keine passende/);
  await e.event('crosshair-save','click');assert.equal(e.saves.at(-1).input.overlay.gamePreset,'valorant:dot');
});

test('CS2 config controls follow game selection and imported CFG becomes the editable draft',async()=>{
 const e=await editor();assert.equal(e.$('crosshair-cs2-open').hidden,false);
 await e.event('crosshair-game','change','valorant');assert.equal(e.$('crosshair-cs2-open').hidden,true);
 await e.event('crosshair-game','change','cs2');assert.equal(e.$('crosshair-cs2-open').hidden,false);
 e.$('crosshair-cfg-text').value='cl_crosshairsize 4; cl_crosshairdot 1; bind mouse1 quit';
 await e.event('crosshair-cfg-import','click');
 assert.equal(e.$('cs2-crosshair-size').value,4);assert.equal(e.$('cs2-crosshair-dot').checked,true);
 assert.equal(e.$('overlay-shape').value,'circle','native CS2 edit must preserve overlay draft');
 assert.match(e.$('crosshair-cfg-status').textContent,/1 andere Befehle ignoriert/);
 assert.equal(e.saves.length,0,'import must not save or write game files');
 await e.event('crosshair-save','click');assert.equal(e.saves[0].input.crosshair.size,e.info.crosshair.size,'overlay still has its own values');
});
