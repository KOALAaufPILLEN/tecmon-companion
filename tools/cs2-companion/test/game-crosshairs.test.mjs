import test from 'node:test';
import assert from 'node:assert/strict';
import {CROSSHAIR_GAMES,gameCrosshair} from '../game-crosshairs.mjs';
import {cleanArtwork,cleanOverlayOptions,createOverlaySettings} from '../crosshair.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
test('all platform games plus Wardogs are browsable; presets are bounded visible RGBA',()=>{
  assert.deepEqual(new Set(CROSSHAIR_GAMES.map(g=>g.id)),new Set(['cs2','valorant','lol','apex','fortnite','wow','aion','dota2','deadlock','gearsofwar','poe1','poe2','wardogs']));
  const keys=new Set();
  for(const game of CROSSHAIR_GAMES){
    assert.ok(game.presets.length<=5);assert.ok(game.note);
    for(const p of game.presets){
      const key=game.id+':'+p.id;assert.ok(!keys.has(key));keys.add(key);
      assert.equal(gameCrosshair(key).preset,p);assert.deepEqual(cleanArtwork(p.artwork),p.artwork);
      const bytes=Buffer.from(p.artwork.pixels,'base64');
      assert.equal(bytes.length,32*32*4);assert.ok(bytes.some((n,i)=>i%4===3&&n===255));
      assert.ok(bytes.some((n,i)=>i%4===3&&n===0));
      for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.equal(bytes[(y*32+x)*4+3],bytes[(y*32+31-x)*4+3],'centered symmetric template');
    }
  }
  assert.equal(keys.size,22);assert.equal(gameCrosshair('../bad'),null);
  assert.equal(cleanOverlayOptions({gamePreset:'unknown:bad'}).gamePreset,'');
});
test('selected game artwork survives restart without enabling or broadening the overlay',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'tecmon-game-crosshair-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const settings=await createOverlaySettings(dir),preset=gameCrosshair('cs2:quadrant').preset;
 await settings.configure({target:'monitor',monitor:2,app:'cs2.exe',offsetX:24,shape:'image',artwork:preset.artwork,gamePreset:'cs2:quadrant'});
 const saved=(await createOverlaySettings(dir)).get();assert.equal(saved.gamePreset,'cs2:quadrant');assert.deepEqual(saved.artwork,preset.artwork);
 assert.equal(saved.enabled,false);assert.equal(saved.target,'monitor');assert.equal(saved.monitor,2);assert.equal(saved.app,'cs2');assert.equal(saved.offsetX,24);
});

