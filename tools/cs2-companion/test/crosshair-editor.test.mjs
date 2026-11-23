import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {DEFAULT_CROSSHAIR, DEFAULT_OVERLAY, PRESETS, STYLES} from '../crosshair.mjs';

// Execute the real browser event handlers; catch inconsistent shape/checkbox/draft state.
async function editor() {
  const elements=new Map(), paints=[];
  const context={createLinearGradient:()=>({addColorStop(){}}),fillRect:(...args)=>paints.push(['rect',...args]),save(){},restore(){},translate(){},rotate(){},beginPath(){},arc:()=>paints.push(['circle']),stroke(){}};
  function element(){return {value:'',checked:false,disabled:false,hidden:true,width:200,nextElementSibling:{tagName:'OUTPUT'},classList:{toggle(){}},listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},replaceChildren(...children){this.children=children;},getContext:()=>context};}
  const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const info={crosshair:{...DEFAULT_CROSSHAIR,color:[...DEFAULT_CROSSHAIR.color]},overlay:{...DEFAULT_OVERLAY,shape:'circle',notice:[],noticeVersion:2},overlayDefaults:DEFAULT_OVERLAY,presets:PRESETS,styles:STYLES};
  const saves=[];
  const api=async(url,input)=>{if(input)saves.push({url,input:structuredClone(input)});return structuredClone(info);};
  const source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const start=source.indexOf('let crosshair=null,'),end=source.indexOf('/* CFG-Sammlung:',start);
  const ctx=vm.createContext({$,el:element,api,notice(){},document:{addEventListener(){}},navigator:{},console});
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
