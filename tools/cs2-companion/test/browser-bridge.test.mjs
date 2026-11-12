import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, utimes } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import { createBrowserBridge } from "../browser-bridge.mjs";
import { createCompanion } from "../server.mjs";
import { recordingFailure, crashSince, PLUGIN_SHA256 } from "../recording-engine.mjs";
const origin = "https://tecmon.online";
const code = "CSGO-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA";
const job = {
  format: "tecmon-cs2-job",
  branding:{enabled:false},
  version: 1,
  shareCode: code,
  tickRate: 64,
  sequences: [{ startTick: 256, endTick: 384, steamId: "76561197992597660", playerName: "Player" }],
};
test("browser grants require local approval, persist only hashes, bind origin and support revocation", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-pair-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const bridge = await createBrowserBridge(dir);
  assert.equal(bridge.allowed("https://evil.tecmon.online"), false);
  assert.equal(bridge.allowed("null"), false);
  assert.throws(() => bridge.pair("https://evil.example"));
  const pair = bridge.pair(origin);
  assert.equal(bridge.poll(origin, pair.request).approved, false);
  assert.throws(() => bridge.poll("https://app.tecmon.app", pair.request));
  assert.throws(() => bridge.poll(origin, "wrong"));
  await bridge.approve(bridge.state().pending[0].id);
  const { token } = bridge.poll(origin, pair.request);
  const id = bridge.authorize(origin, token);
  assert.ok(id);
  assert.equal(bridge.authorize("https://app.tecmon.app", token), null);
  const persisted = await readFile(path.join(dir, "bridge-devices.json"), "utf8");
  assert.ok(!persisted.includes(token));
  assert.ok(!JSON.stringify(bridge.state()).includes(token));
  const restarted = await createBrowserBridge(dir);
  assert.equal(restarted.authorize(origin, token), id);
  await restarted.revoke(id);
  assert.equal(restarted.authorize(origin, token), null);
  assert.equal((await createBrowserBridge(dir)).authorize(origin, token), null);
  bridge.pair(origin);
  assert.throws(() => bridge.pair(origin), /läuft bereits/);
});

test("website bridge enforces CORS, pairing, confirmation, fixed paths, job ownership and one download-to-video lock", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-bridge-api-"));
  const exe = path.join(dir, "csdm.exe");
  await writeFile(exe, "fixture");
  const calls = [];
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  const { server, token: localToken } = await createCompanion({
    dataDir: dir,
    detectTools: async () => ({ csdm: exe, cs2: "" }),
    runProcess: async (engine, args) => {
      assert.equal(engine, exe);
      calls.push(args);
      if (args[0] === "dl-valve") {
        await hold;
        await mkdir(args[3], { recursive: true });
        await writeFile(path.join(args[3], "match.dem"), Buffer.from("PBDEMS2\0fixture"));
      }
      if (args[0] === "video") {
        const config = JSON.parse(await readFile(args[2], "utf8"));
        assert.equal(config.sequences[0].startTick, 256);
        assert.equal(config.concatenateSequences, true);
        await writeFile(path.join(config.outputFolderPath, "result.mp4"), "MP4 fixture");
      }
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    release();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const post = (route, body, token = "", source = origin) =>
    fetch(base + route, {
      method: "POST",
      headers: {
        origin: source,
        "content-type": "application/json",
        "x-tecmon-bridge-token": token,
      },
      body: JSON.stringify(body),
    });
  const get = (route, token) =>
    fetch(base + route, { headers: { origin, "x-tecmon-bridge-token": token } });
  const local = async (route, body) =>
    fetch(base + route, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-tecmon-token": localToken },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await post("/bridge/pair", {}, "", "https://evil.example")).status, 403);
  assert.equal((await post("/api/bridge/approve", { id: "x" })).status, 403);
  assert.equal((await get("/bridge/state", "wrong")).status, 401);
  const preflight = await fetch(base + "/bridge/capture", {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,x-tecmon-bridge-token",
      "access-control-request-private-network": "true",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
  async function pair() {
    const start = await (await post("/bridge/pair", {})).json();
    const state = await (await local("/api/state")).json();
    assert.ok(!JSON.stringify(state.bridge).includes(start.request));
    const pending = state.bridge.pending.find((p) => p.code === start.code);
    assert.equal((await local("/api/bridge/approve", { id: pending.id })).status, 200);
    return (await (await post("/bridge/pair/poll", { request: start.request })).json()).token;
  }
  const grant = await pair();
  const second = await pair();
  assert.equal((await post("/bridge/capture", { job, confirm: false }, grant)).status, 400);
  assert.equal(
    (await post("/bridge/capture", { job: { ...job, shareCode: undefined }, confirm: true }, grant))
      .status,
    400,
  );
  assert.equal(
    (
      await post(
        "/bridge/capture",
        { job: { ...job, shareCode: code + " --output x" }, confirm: true },
        grant,
      )
    ).status,
    400,
  );
  const start = await post(
    "/bridge/capture",
    { job, confirm: true, csdm: "C:\\evil.exe", demo: "C:\\private.dem" },
    grant,
  );
  assert.equal(start.status, 202);
  const { id } = await start.json();
  assert.equal(
    (
      await post(
        "/bridge/download",
        { format: "tecmon-match-download", version: 1, shareCodes: [code], confirm: true },
        grant,
      )
    ).status,
    400,
  );
  assert.equal((await get(`/bridge/job?id=${id}`, second)).status, 404);
  assert.equal((await get(`/bridge/video?id=${id}&file=0`, second)).status, 404);
  release();
  let completed;
  for (let i = 0; i < 100; i++) {
    completed = await (await get(`/bridge/job?id=${id}`, grant)).json();
    if (["done", "error"].includes(completed.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(completed.status, "done");
  assert.equal(completed.files, 1);
  assert.ok(!JSON.stringify(completed).includes(dir));
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["dl-valve", "analyze", "video"],
  );
  const video = await get(`/bridge/video?id=${id}&file=0`, grant);
  assert.equal(await video.text(), "MP4 fixture");
  const state = await (await local("/api/state")).json();
  await local("/api/bridge/revoke", { id: state.bridge.devices[0].id });
  assert.equal((await get("/bridge/state", grant)).status, 401);
});

test("recording diagnostics explain missing hook and absent raw files", () => {
  assert.match(PLUGIN_SHA256, /^[a-f0-9]{64}$/);
  assert.match(
    recordingFailure(new Error("Raw files not found"), "Connected to WebSocket server"),
    /Szenensteuerung/,
  );
  assert.match(
    recordingFailure(new Error("Raw files not found"), "Hooked FrameStageNotify"),
    /keine Rohaufnahme/,
  );
  assert.equal(
    recordingFailure(new Error("engine error"), "Hooked FrameStageNotify"),
    "engine error",
  );
  assert.match(
    recordingFailure(new Error("Raw files not found"), "Hooked FrameStageNotify", "cs2_2026_1112_202651_0_accessviolation.mdmp"),
    /abgestürzt.*accessviolation/,
  );
});

test("crash reports are only counted when written after the recording started", async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "tecmon-crash-"));
  const exe = path.join(folder, "cs2.exe");
  await writeFile(path.join(folder, "cs2_old_accessviolation.mdmp"), "old");
  const since = Date.now() + 60_000;
  assert.equal(await crashSince(exe, since), "");
  await writeFile(path.join(folder, "cs2_new_accessviolation.mdmp"), "new");
  await utimes(path.join(folder, "cs2_new_accessviolation.mdmp"), new Date(since + 1000), new Date(since + 1000));
  await writeFile(path.join(folder, "other.mdmp"), "x");
  await utimes(path.join(folder, "other.mdmp"), new Date(since + 2000), new Date(since + 2000));
  assert.equal(await crashSince(exe, since), "cs2_new_accessviolation.mdmp");
  assert.equal(await crashSince("", since), "");
});
