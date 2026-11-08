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
  const directory = await mkdtemp(path.join(os.tmpdir(), "tecmon-browser-capture-")),
    exe = path.join(directory, "csdm.exe");
  await writeFile(exe, "fixture");
  const bytes = Buffer.concat([Buffer.from("PBDEMS2\0"), Buffer.alloc(300, 79)]);
  const calls = [];
  const { server, token } = await createCompanion({
    dataDir: directory,
    detectTools: async () => ({ csdm: exe, cs2: "" }),
    runProcess: async (_exe, args) => {
      calls.push(args[0]);
      if (args[0] === "analyze") {
        assert.deepEqual(await readFile(args[1]), bytes);
        assert.ok(args[1].startsWith(path.join(directory, "Browser-Demos")));
      }
      if (args[0] === "video") {
        const config = JSON.parse(await readFile(args[2], "utf8"));
        await mkdir(config.outputFolderPath, { recursive: true });
        await writeFile(path.join(config.outputFolderPath, "result.mp4"), "rendered fixture");
      }
    },
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
  const started = await (
    await post("/bridge/capture", {
      job,
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
  assert.equal(result.status, "done");
  assert.deepEqual(calls, ["analyze", "video"]);
  assert.equal(result.files, 1);
  assert.equal(
    await (await fetch(base + `/bridge/video?id=${started.id}&file=0`, { headers })).text(),
    "rendered fixture",
  );
});
