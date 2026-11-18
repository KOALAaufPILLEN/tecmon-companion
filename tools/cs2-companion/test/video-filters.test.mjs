import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VIDEO_FILTERS, FILTER_V2_IDS, filterId, filterGraph, withFilter } from "../video-filters.mjs";
import { validateJob } from "../job.mjs";
import { renderBranding, sequenceFile } from "../video-branding.mjs";
import { verifyBrandingPack, sha256 } from "../branding-assets.mjs";

test("Pro Looks: IDs only, unknown and inherited keys never become graphs", () => {
  for (const id of FILTER_V2_IDS) {
    assert.equal(filterId(id),id);
    assert.ok(Object.hasOwn(VIDEO_FILTERS,id));
  }
  for (const id of [undefined,"__proto__","constructor","toString","movie=private","arena-pro;null",{}]) {
    assert.equal(filterId(id),undefined);
    assert.equal(filterGraph(id,"in","out",1280,720),"[in]null[out]");
    assert.equal(withFilter("[0:v]null[v]",id,1280,720),"[0:v]null[v]");
  }
});

test("Halation scales its highlight-only blur with image width and keeps final dimensions", () => {
  const small=filterGraph("halation","in","out",1280,720);
  const large=filterGraph("halation","in","out",3840,2160);
  assert.ok(small.includes("val-190"));
  assert.ok(small.includes("gblur=sigma=2.133"));
  assert.ok(large.includes("gblur=sigma=6.400"));
  assert.ok(large.endsWith("scale=3840:2160,setsar=1[out]"));
  assert.throws(()=>withFilter("[0:v]null[bad]","halation",1280,720));
});

test("Every new look survives job validation and runs before the TecMon HUD, with checked inputs and full scene/audio", async(t)=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"tecmon-pro-"));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const job={format:"tecmon-cs2-job",version:1,tickRate:64,map:"cs_office",branding:{intro:false,outro:false},
    sequences:FILTER_V2_IDS.map((filter,i)=>({startTick:64+i*128,endTick:128+i*128,steamId:"76561198000000000",playerName:"Player",filter}))};
  const clean=validateJob(job);
  assert.deepEqual(clean.sequences.map(s=>s.filter),[...FILTER_V2_IDS]);
  for(let i=0;i<clean.sequences.length;i++) await writeFile(path.join(directory,sequenceFile(clean.sequences[i],i)),"source"+i);
  const assets=verifyBrandingPack(await readFile(new URL("../branding/TecMon-Branding-v3.json",import.meta.url)));
  let scenes=0;
  await renderBranding({job,directory,assets,ffmpeg:"unused",probe:async()=>({width:1280,height:720,fps:60,duration:1,audio:true}),
    execute:async(request)=>{
      for(const item of request.files) assert.equal(sha256(await readFile(item.path)),item.sha256);
      const i=request.args.indexOf("-filter_complex_script");
      if(i!==-1){
        const graph=await readFile(path.join(request.cwd,request.args[i+1]),"utf8");
        assert.ok(graph.indexOf("curves=")<graph.indexOf("[2:v]"));
        assert.equal(request.args[request.args.indexOf("-t")+1],"1.000000");
        assert.equal(request.args[request.args.indexOf("-r")+1],"60");
        assert.ok(request.args.includes("0:a:0"));
        scenes++;
      }
      await writeFile(request.args.at(-1),"encoded");
    }});
  assert.equal(scenes,FILTER_V2_IDS.length);
});


test("Bloom Ultra deliberately increases highlight reach and bloom without changing Halation", () => {
  const strong=filterGraph("bloom-ultra","in","out",1920,1080);
  const gentle=filterGraph("halation","in","out",1920,1080);
  assert.ok(strong.includes("val-165"));
  assert.ok(strong.includes("all_opacity=0.3"));
  assert.ok(strong.includes("gblur=sigma=5.000"));
  assert.ok(gentle.includes("val-190") && gentle.includes("all_opacity=0.16"));
});
