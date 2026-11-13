import test from "node:test";
import { once } from "node:events";
import { createCompanion } from "../server.mjs";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  verifyBrandingPack,
  loadBrandingPack,
  BRANDING_SHA256,
  BRANDING_URL,
  sha256,
} from "../branding-assets.mjs";
import {
  renderBranding,
  brandingTitle,
  sequenceFile,
  visualPlayerName,
} from "../video-branding.mjs";
import { validateJob } from "../job.mjs";
const packed = await readFile(new URL("../branding/TecMon-Branding-v3.json", import.meta.url));
const job = {
  format: "tecmon-cs2-job",
  version: 1,
  tickRate: 64,
  map: "de_dust2",
  title: "Highlights",
  sequences: [
    { startTick: 128, endTick: 256, steamId: "76561198000000000", playerName: "❟❛❟ KOALA ❟❛❟" },
    { startTick: 500, endTick: 628, steamId: "76561198000000001", playerName: "fiLoX" },
  ],
};
test("branding assets use a pinned release/hash; changed downloads or cache fail closed", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-assets-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(sha256(packed), BRANDING_SHA256);
  let calls = 0;
  const assets = await loadBrandingPack(dir, async (url) => {
    calls++;
    assert.equal(url, BRANDING_URL);
    return new Response(packed);
  });
  assert.ok(assets["font.ttf"].length > 1000);
  await loadBrandingPack(dir, async () => {
    throw new Error("cache should avoid download");
  });
  assert.equal(calls, 1);
  const changed = Buffer.from(packed);
  changed[100] ^= 1;
  assert.throws(() => verifyBrandingPack(changed), /Prüfsumme/);
  await writeFile(path.join(dir, "TecMon-Branding-v3.json"), changed);
  await assert.rejects(
    loadBrandingPack(dir, async () => {
      throw new Error("must not hide changed cache");
    }),
    /Prüfsumme/,
  );
  const other = path.join(dir, "other");
  await assert.rejects(
    loadBrandingPack(other, async () => new Response(changed)),
    /Prüfsumme/,
  );
  assert.deepEqual(await readdir(other), []);
});

test("legacy jobs get branding; single/team titles use players and ignore supplied asset paths or checksums", () => {
  const clean = validateJob({
    ...job,
    branding: {
      outro: true,
      subtitle: "Clutch",
      url: "https://evil.example",
      sha256: "attacker",
      filter: "movie=private",
    },
  });
  assert.deepEqual(clean.branding, { enabled: true, intro: true, outro: true, subtitle: "Clutch" });
  assert.equal(brandingTitle(clean).title, "TEAM-HIGHLIGHTS");
  assert.equal(
    brandingTitle({ ...clean, sequences: [clean.sequences[0]] }).title,
    "KOALA · HIGHLIGHTS",
  );
  assert.equal(visualPlayerName("❟❛❟ KOALA ❟❛❟"), "KOALA");
  for (const branding of [{ enabled: "yes" }, { outro: 1 }, "unsafe", []])
    assert.throws(() => validateJob({ ...job, branding }));
});

test("renderer locks/hash-checks assets, literal text, graphs and scene inputs; final list keeps player order", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-brand-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const spec = validateJob({
    ...job,
    branding: { outro: true, subtitle: "';movie=private,drawtext=%{localtime}" },
  });
  for (let i = 0; i < spec.sequences.length; i++)
    await writeFile(path.join(dir, sequenceFile(spec.sequences[i], i)), "source " + i);
  const seen = [];
  const result = await renderBranding({
    job: spec,
    directory: dir,
    assets: verifyBrandingPack(packed),
    ffmpeg: "unused",
    launcher: "unused",
    probe: async () => ({ width: 1280, height: 720, fps: 30, duration: 2, audio: false }),
    execute: async (request) => {
      for (const file of request.files)
        assert.equal(sha256(await readFile(file.path)), file.sha256);
      const index = request.args.indexOf("-filter_complex_script");
      if (index !== -1) {
        const graph = await readFile(path.join(request.cwd, request.args[index + 1]), "utf8");
        assert.ok(graph.includes("expansion=none"));
        assert.ok(!graph.includes("movie=private"));
        if(path.basename(request.args.at(-1)).startsWith('scene-')){
          assert.ok(graph.includes('[2:v]scale='));
          assert.ok(!graph.includes('crop='),'Native radar must stay untouched');
          assert.ok(!graph.includes("enable="),'HUD must remain visible for the entire scene, including repeated POVs');
          for(const prefix of ['name-','caption-','counter-'])assert.ok(request.files.some(file=>path.basename(file.path).startsWith(prefix)));
        }
        seen.push(path.basename(request.args.at(-1)));
      } else {
        const list = await readFile(path.join(request.cwd, "parts.txt"), "utf8");
        assert.equal(
          list,
          "file 'intro.mp4'\nfile 'scene-0.mp4'\nfile 'switch-1.mp4'\nfile 'scene-1.mp4'\nfile 'outro.mp4'",
        );
      }
      await writeFile(request.args.at(-1), "encoded fixture");
    },
  });
  assert.deepEqual(seen, ["intro.mp4", "scene-0.mp4", "switch-1.mp4", "scene-1.mp4", "outro.mp4"]);
  assert.equal(await readFile(result, "utf8"), "encoded fixture");
  assert.deepEqual(await readdir(path.join(dir, "branding-work")), []);
});

test("changed in-memory visuals abort before any encoder runs", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-brand-fail-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const assets = verifyBrandingPack(packed);
  assets["logo.webp"][0] ^= 1;
  await assert.rejects(
    renderBranding({
      job,
      directory: dir,
      assets,
      execute: async () => {
        assert.fail("encoder must not run");
      },
    }),
    /Prüfsumme/,
  );
  assert.deepEqual(await readdir(path.join(dir, "branding-work")), []);
});

test("asset integrity failure stops the recording pipeline before CS2 and cannot publish raw output", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-brand-api-"));
  const demo=path.join(dir,"match.dem"),exe=path.join(dir,"csdm.exe");
  await writeFile(demo,Buffer.from("PBDEMS2\0fixture"));await writeFile(exe,"fixture");
  const installation = {
    dataDir: dir,
    profileDir: path.join(dir, "profile"),
    postgresBin: path.join(dir, "pg"),
    port: 31000,
    csdmExe: path.join(dir, "csdm.exe"),
    cs2Exe: "",
  };
  let calls = 0;
  const { server, token } = await createCompanion({
    installation,
    runProcess: async () => {
      calls++;
    },
    loadAssets: async () => {
      throw new Error("Branding-Prüfsumme stimmt nicht");
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const post = async (route, body) =>
    fetch(base + route, { method: "POST", headers, body: JSON.stringify(body) });
  const imported = await (await post("/api/import", job)).json();
  assert.equal((await post("/api/start", { id: imported.id, confirm: true,csdm:exe,demo })).status, 202);
  let state;
  for (let i = 0; i < 50; i++) {
    state = await (await fetch(base + "/api/state", { headers })).json();
    if (!state.active) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(state.jobs[0].status, "error");
  assert.match(state.jobs[0].log, /Prüfsumme/);
  assert.equal(calls, 0);
  assert.equal(
    (await fetch(base + `/api/video?job=${imported.id}&file=0`, { headers })).status,
    404,
  );
});

test("Szenenbeschreibung (scene-label-v1): optional, bereinigt, auf 40 Zeichen gekürzt", () => {
  const first = job.sequences[0];
  const clean = validateJob({
    ...job,
    sequences: [
      { ...first, label: "  3 Kills <b>an der</b>\n Treppe  " },
      { ...first, label: "x".repeat(90) },
      { ...first, label: "   " },
      first,
    ],
  });
  assert.equal(clean.sequences[0].label, "3 Kills ban der/b Treppe");
  assert.equal(clean.sequences[1].label.length, 40);
  assert.equal("label" in clean.sequences[2], false);
  assert.equal("label" in clean.sequences[3], false);
  assert.throws(() => validateJob({ ...job, sequences: [{ ...first, label: 5 }] }));
  assert.throws(() => validateJob({ ...job, sequences: [{ ...first, label: { filter: "movie=x" } }] }));
});
