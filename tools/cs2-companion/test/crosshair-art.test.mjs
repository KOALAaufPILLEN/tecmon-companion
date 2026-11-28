import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {cleanArtwork,cleanOverlayOptions,createOverlaySettings} from '../crosshair.mjs';
import '../public/crosshair-art.js';
const art=globalThis.TecMonArt;
test('colored/transparent RGBA survives a profile restart',async t=>{
  const a=art.blank(4,2);art.paint(a,1,1,[100,50,250,128]);
  const packed=art.pack(a);assert.deepEqual(art.unpack(packed),a);assert.deepEqual(cleanArtwork(packed),packed);
  const dir=await mkdtemp(path.join(tmpdir(),'tecmon-pixel-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const settings=await createOverlaySettings(dir);await settings.configure({shape:'image',artwork:packed,imageSize:48});
  const saved=(await createOverlaySettings(dir)).get();assert.equal(saved.shape,'image');assert.deepEqual(saved.artwork,packed);assert.equal(saved.enabled,false);assert.equal(saved.imageSize,48);
});
test('untrusted artwork cannot expand size, inject a path or save a blank overlay',()=>{
  for(const input of [{width:100000,height:1,pixels:'AAAA'},{width:1,height:1,pixels:'file:///bad.png'},{width:1,height:1,pixels:'AAAA'},{width:1,height:1,pixels:'AAAAAA==\n'},'https://example.com/a.png'])assert.throws(()=>cleanArtwork(input));
  assert.throws(()=>cleanOverlayOptions({shape:'image'}),/sichtbare Pixel/);
  assert.throws(()=>cleanOverlayOptions({shape:'image',artwork:art.pack(art.blank())}),/sichtbare Pixel/);
  assert.equal(cleanOverlayOptions({artwork:null}).shape,'cross');
});
test('continuous strokes, symmetric erasing and centered resize retain pixel colors',()=>{
  const a=art.blank(8);art.line(1,1,5,3,(x,y)=>art.paint(a,x,y,[255,0,0,255],true,true));
  assert.equal(a.data[(1*8+1)*4],255);assert.equal(a.data[(6*8+6)*4],255);
  art.paint(a,1,1,[0,0,0,0],true,true);assert.equal(a.data[(1*8+1)*4+3],0);assert.equal(a.data[(6*8+6)*4+3],0);
  const copy=art.clone(a),resized=art.resize(a,12);assert.deepEqual(art.resize(resized,8),copy);
});
test('PNG dimensions are bounded before the browser decoder runs',()=>{
  const header=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.writeUInt32BE(13,8);header.write('IHDR',12);header.writeUInt32BE(64,16);header.writeUInt32BE(32,20);
  const array=()=>header.buffer.slice(header.byteOffset,header.byteOffset+header.length);
  assert.deepEqual(art.pngDimensions(array()),{width:64,height:32});header.writeUInt32BE(100000,16);assert.throws(()=>art.pngDimensions(array()),/512/);assert.throws(()=>art.pngDimensions(new ArrayBuffer(8)),/PNG/);
});
