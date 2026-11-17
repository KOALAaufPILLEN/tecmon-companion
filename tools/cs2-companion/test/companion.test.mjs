import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import http from "node:http";
import { validateJob, recordingConfig } from "../job.mjs";
import { createCompanion } from "../server.mjs";

const job = {
  format: "tecmon-cs2-job",
  branding:{enabled:false},
  version: 1,
  title: "Ace",
  map: "de_nuke",
  tickRate: 64,
  sequences: [{ startTick: 128, endTick: 640, steamId: "76561198000000000", playerName: "KOALA" }],
};
test("untrusted jobs cannot set executable paths or game/ffmpeg commands", () => {
  const clean = validateJob({
    ...job,
    demoPath: "evil",
    cfg: "quit",
    ffmpegSettings: { outputParameters: "evil" },
  });
  assert.equal(clean.cfg, undefined);
  const config = recordingConfig(clean, "demo.dem", "out", "1080p60");
  assert.equal(config.demoPath, "demo.dem");
  assert.equal(config.recordingSystem, "HLAE");
  assert.equal(config.ffmpegSettings.outputParameters, "");
  assert.equal(config.ffmpegSettings.videoContainer, "mp4");
  assert.equal(config.sequences[0].playerCameras[0].tick, 128);
  assert.equal(config.sequences[0].playerCameras[0].playerSteamId, job.sequences[0].steamId);
  assert.equal(config.sequences[0].playerVoicesEnabled, false);
  assert.equal(config.sequences[0].showXRay, true, "X-Ray ist Standard");
  assert.equal(recordingConfig({ ...job, xray: false }, "d.dem", "o", "720p").sequences[0].showXRay, false);
  assert.throws(() => validateJob({ ...job, xray: "ja" }));
});
test("reject invalid Steam IDs, ticks, excessive duration and schema versions", () => {
  for (const patch of [
    { version: 2 },
    { sequences: [] },
    { tickRate: NaN },
    { sequences: [{ ...job.sequences[0], startTick: -1 }] },
    { sequences: [{ ...job.sequences[0], steamId: "bot" }] },
    { sequences: [{ ...job.sequences[0], endTick: 1000000 }] },
  ])
    assert.throws(() => validateJob({ ...job, ...patch }));
});
test("loopback authentication, import, confirmation and recording pipeline", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-companion-test-"));
  const { server, token } = await createCompanion({ dataDir: dir, detectTools: async () => ({}) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const post = (route, body, more = {}) =>
    fetch(base + route, {
      method: "POST",
      headers: { ...headers, ...more },
      body: JSON.stringify(body),
    });
  assert.equal((await fetch(base + "/api/state")).status, 401);
  const badHost = await new Promise((resolve, reject) => {
    http
      .get(base + "/api/state", { headers: { ...headers, Host: "evil.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      })
      .on("error", reject);
  });
  assert.equal(badHost, 403);
  assert.equal((await post("/api/import", job, { Origin: "https://evil.example" })).status, 403);
  // CS Demo Manager und Datenbank gibt es nicht mehr.
  for (const route of ["/api/database/check", "/api/database/install", "/api/csdm/open", "/api/engine"])
    assert.equal((await post(route, {})).status, 404);
  assert.equal((await fetch(base)).status, 200);
  const imported = await (await post("/api/import", job)).json();
  const demo = path.join(dir, "match.dem");
  await writeFile(demo, "PBDEMS2\0fixture");
  assert.equal((await post("/api/start", { id: imported.id, demo })).status, 400);
  assert.equal(
    (await post("/api/start", { id: imported.id, demo, confirm: true, quality: "1080p60" })).status,
    202,
  );
  let state;
  for (let n = 0; n < 50; n++) {
    state = await (await fetch(base + "/api/state", { headers })).json();
    if (!state.active) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  // Ohne installierten Windows-Companion keine Aufnahme (Erfolgsweg: internal-video.test.mjs).
  assert.equal(state.jobs[0].status, "error");
  assert.match(state.jobs[0].log, /installierten Windows-Companion/);
  assert.equal((await fetch(base + `/api/video?job=${imported.id}&file=0`, { headers })).status, 404);
  assert.equal(
    (await fetch(base + `/api/video?job=${imported.id}&file=../../../secret`, { headers })).status,
    404,
  );
});
