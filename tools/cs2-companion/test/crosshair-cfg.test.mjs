import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCrosshairConfig,crosshairConfigText,DEFAULT_CROSSHAIR} from '../crosshair.mjs';
test('CFG imports only known numerical crosshair values, last assignment wins, no commands are executed',()=>{
 const result=parseCrosshairConfig('\uFEFF// autoexec\ncl_crosshairsize "1.5"; cl_crosshairgap -3\ncl_crosshairsize 2.5\ncl_crosshairdot 1\ncl_crosshair_t 1\nbind mouse1 quit\nexec other.cfg\nsensitivity 20\ncl_crosshair_recoil 1');
 assert.equal(result.crosshair.size,2.5);assert.equal(result.crosshair.gap,-3);assert.equal(result.crosshair.dot,true);assert.equal(result.crosshair.tStyle,true);
 assert.equal(result.ignored,4);assert.deepEqual(result.unsupported,['cl_crosshair_recoil']);
 assert.doesNotMatch(crosshairConfigText(result.crosshair),/bind |exec other|sensitivity|cl_crosshair_recoil/);
});
test('CFG handles colors, opacity, partial imports and own generated CFG',()=>{
 const base={...DEFAULT_CROSSHAIR,color:[1,2,3],alpha:120};
 assert.deepEqual(parseCrosshairConfig('cl_crosshaircolor 5; cl_crosshaircolor_g 200',base).crosshair.color,[1,200,3]);
 assert.deepEqual(base.color,[1,2,3]);
 assert.deepEqual(parseCrosshairConfig('cl_crosshairsize 2.2').rounded,['size']);
 assert.deepEqual(parseCrosshairConfig('cl_crosshaircolor 1; cl_crosshaircolor_r 9').crosshair.color,[50,250,50]);
 assert.equal(parseCrosshairConfig('cl_crosshairalpha 80; cl_crosshairusealpha 0').crosshair.alpha,255);
 assert.equal(parseCrosshairConfig('cl_crosshairalpha 80; cl_crosshairusealpha 1').crosshair.alpha,80);
 assert.deepEqual(parseCrosshairConfig(crosshairConfigText(base)).crosshair,base);
});
test('CFG rejects malformed, out-of-range or oversized input without changing the draft',()=>{
 for(const text of ['exec autoexec','cl_crosshairsize "2; quit"','cl_crosshairsize NaN','cl_crosshairdot 2','cl_crosshaircolor 6','cl_crosshairsize 999','cl_crosshairalpha 0.1','x'.repeat(65537),null])assert.throws(()=>parseCrosshairConfig(text));
 assert.throws(()=>parseCrosshairConfig('// '+ 'é'.repeat(40000)),/64 KB/);
});
