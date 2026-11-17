import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { browserDemos, DEMO_MAX } from "../browser-demo.mjs";
import { createCompanion } from "../server.mjs";

test("browser demo chunks retain all bytes, reject invalid data/offsets and bind ownership", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tecmon-demo-chunks-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = browserDemos(directory),
    bytes = Buffer.concat([Buffer.from("PBDEMS2\0"), Buffer.alloc(200, 65), Buffer.alloc(200, 90)]);
  await assert.rejects(store.start("owner", DEMO_MAX + 1));
  await assert.rejects(store.start("owner", 0));
  const upload = await store.start("owner", bytes.length);
  await assert.rejects(store.chunk("other", upload.id, 0, Readable.from([bytes])));
  await assert.rejects(
    store.chunk("owner", upload.id, 0, Readable.from([Buffer.from("not a demo")])),
  );
  await store.chunk("owner", upload.id, 0, Readable.from([bytes.subarray(0, 128)]));
  await assert.rejects(store.chunk("owner", upload.id, 0, Readable.from([bytes])));
  assert.throws(() => store.consume("owner", upload.id));
  const completed = await store.chunk(
    "owner",
    upload.id,
    128,
    Readable.from([bytes.subarray(128)]),
  );
  assert.equal(completed.ready, true);
  assert.throws(() => store.consume("other", upload.id));
  const file = store.consume("owner", upload.id);
  assert.deepEqual(await readFile(file), bytes);
  assert.throws(() => store.consume("owner", upload.id));
  const canceled = await store.start("owner", 16);
  await assert.rejects(store.cancel("other", canceled.id));
  await store.cancel("owner", canceled.id);
  assert.throws(() => store.consume("owner", canceled.id));
});

test("approved browser transfers original demo without sharecode and obtains rendered video without local UI", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tecmon-browser-capture-"));
  const bytes = Buffer.concat([Buffer.from("PBDEMS2\0"), Buffer.alloc(300, 79)]);
  const installation = { dataDir: directory, profileDir: path.join(directory, "profile"), hlaeExe: "", ffmpegExe: "", cs2Exe: "" };
  await mkdir(installation.profileDir, { recursive: true });
  const { server, token } = await createCompanion({
    installation,
    detectTools: async () => ({ cs2: "" }),
    engineSystem: { recorder: { isRunning: async () => false } },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`,
    origin = "https://tecmon.online";
  let grant = "";
  const post = (route, body) =>
    fetch(base + route, {
      method: "POST",
      headers: {
        Origin: origin,
        "content-type": body instanceof Buffer ? "application/octet-stream" : "application/json",
        "x-tecmon-bridge-token": grant,
      },
      body: body instanceof Buffer ? body : JSON.stringify(body),
    });
  const pending = await (await post("/bridge/pair", {})).json();
  const state = await (
    await fetch(base + "/api/state", { headers: { "x-tecmon-token": token } })
  ).json();
  await fetch(base + "/api/bridge/approve", {
    method: "POST",
    headers: { "x-tecmon-token": token, "content-type": "application/json" },
    body: JSON.stringify({ id: state.bridge.pending[0].id }),
  });
  grant = (await (await post("/bridge/pair/poll", { request: pending.request })).json()).token;
  const upload = await (await post("/bridge/demo/start", { size: bytes.length })).json();
  assert.equal(
    (await post(`/bridge/demo/chunk?id=${upload.id}&offset=0`, bytes.subarray(0, 128))).status,
    200,
  );
  assert.equal(
    (await post(`/bridge/demo/chunk?id=${upload.id}&offset=128`, bytes.subarray(128))).status,
    200,
  );
  const job = {
    format: "tecmon-cs2-job",
    version: 1,
    branding: { enabled: false },
    tickRate: 64,
    sequences: [
      { startTick: 256, endTick: 384, steamId: "76561197992597660", playerName: "Player" },
    ],
  };
  assert.equal(
    (await post("/bridge/capture", { job, demoId: upload.id, confirm: false })).status,
    400,
  );
  // Ältere Auswertung ohne Spieler-Slots: abgelehnt, die hochgeladene Demo bleibt für den nächsten Versuch.
  const old = await post("/bridge/capture", { job, demoId: upload.id, confirm: true });
  assert.equal(old.status, 400);
  assert.match((await old.json()).error, /neu auswerten/);
  const slotted = { ...job, sequences: job.sequences.map((s) => ({ ...s, slot: 2 })) };
  const started = await (
    await post("/bridge/capture", {
      job: slotted,
      demoId: upload.id,
      demo: "C:\\not-allowed.dem",
      confirm: true,
    })
  ).json();
  assert.ok(started.id);
  const headers = { Origin: origin, "x-tecmon-bridge-token": grant };
  let result;
  for (let i = 0; i < 100; i++) {
    result = await (await fetch(base + `/bridge/job?id=${started.id}`, { headers })).json();
    if (["error", "done"].includes(result.status)) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  // Ohne CS2 bricht die eigene Engine ab (der Erfolgsweg steht in internal-video.test.mjs).
  assert.equal(result.status, "error");
  assert.ok(!JSON.stringify(result).includes(directory));
  // Die Demo ist verbraucht: ein zweiter Auftrag damit geht nicht.
  assert.equal((await post("/bridge/capture", { job: slotted, demoId: upload.id, confirm: true })).status, 400);
});
