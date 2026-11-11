import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from "node:fs/promises";
import { EventEmitter, once } from "node:events";
import os from "node:os";
import path from "node:path";
import { createCompanion } from "../server.mjs";

/** Regression: Mit der eigenen Engine fehlte job.output, /bridge/video brach mit "path ... undefined" ab. */
test("Eigene Engine: fertige MP4 kommt über /bridge/video zur Webseite", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-internal-video-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, "cs2");
  const cs2Exe = path.join(root, "game", "bin", "win64", "cs2.exe");
  await mkdir(path.dirname(cs2Exe), { recursive: true });
  await writeFile(cs2Exe, "");
  await mkdir(path.join(root, "game", "csgo"), { recursive: true });
  await writeFile(path.join(root, "game", "csgo", "gameinfo.gi"), "\t\t\tGame\tcsgo\n");
  const tools = path.join(dir, "tools");
  await mkdir(path.join(tools, "hlae"), { recursive: true });
  await mkdir(path.join(tools, "ffmpeg"), { recursive: true });
  const installation = {
    dataDir: path.join(dir, "data"),
    profileDir: path.join(dir, "private", "csdm-user"),
    hlaeExe: path.join(tools, "hlae", "hlae.exe"),
    ffmpegExe: path.join(tools, "ffmpeg", "ffmpeg.exe"),
    cs2Exe,
    csdmExe: path.join(dir, "csdm.exe"),
  };
  await mkdir(installation.profileDir, { recursive: true });
  await writeFile(installation.hlaeExe, "");
  await writeFile(installation.ffmpegExe, "");
  await writeFile(installation.csdmExe, "fixture");
  let cs2 = false;
  let naps = 0;
  let recording = null;
  const system = {
    plugin: async () => Buffer.from("dll"),
    isRunning: async (image) => (image === "steam.exe" ? true : cs2),
    sleep: async () => {
      if (cs2 && ++naps > 1) {
        cs2 = false;
        const jobsDir = path.join(installation.dataDir, "Jobs");
        const [id] = (await readdir(jobsDir)).filter((n) => n !== "Browser-Demos");
        recording = JSON.parse(await readFile(path.join(jobsDir, id, "recording.json"), "utf8"));
        for (const s of recording.sequences) {
          const folder = path.join(recording.outputFolderPath, `${s.number}-sequence`);
          await mkdir(path.join(folder, "take0000"), { recursive: true });
          await writeFile(path.join(folder, "video.mp4"), "v");
          await writeFile(path.join(folder, "take0000", "audio.wav"), "a");
        }
      }
    },
    launch: () => {
      const child = new EventEmitter();
      setImmediate(() => {
        cs2 = true;
        child.emit("exit", 0);
      });
      return child;
    },
    ffmpeg: async (_exe, args) => writeFile(args.at(-1), "fertiges video"),
  };
  const { server, token } = await createCompanion({
    installation,
    detectTools: async () => ({ csdm: "", cs2: cs2Exe }),
    runProcess: async () => {
      throw new Error("CS Demo Manager darf nicht laufen");
    },
    engineSystem: { recorder: system },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const origin = "https://tecmon.online";
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
  const state = await (await fetch(base + "/api/state", { headers: { "x-tecmon-token": token } })).json();
  await fetch(base + "/api/bridge/approve", {
    method: "POST",
    headers: { "x-tecmon-token": token, "content-type": "application/json" },
    body: JSON.stringify({ id: state.bridge.pending[0].id }),
  });
  grant = (await (await post("/bridge/pair/poll", { request: pending.request })).json()).token;
  const bytes = Buffer.concat([Buffer.from("PBDEMS2\0"), Buffer.alloc(300, 79)]);
  const upload = await (await post("/bridge/demo/start", { size: bytes.length })).json();
  assert.equal((await post(`/bridge/demo/chunk?id=${upload.id}&offset=0`, bytes)).status, 200);
  const job = {
    format: "tecmon-cs2-job",
    version: 1,
    map: "de_dust2",
    branding: { enabled: false },
    tickRate: 64,
    sequences: [{ startTick: 256, endTick: 384, steamId: "76561197992597660", playerName: "Player", slot: 3 }],
  };
  const started = await (await post("/bridge/capture", { job, demoId: upload.id, confirm: true })).json();
  assert.ok(started.id, JSON.stringify(started));
  const headers = { Origin: origin, "x-tecmon-bridge-token": grant };
  let result;
  for (let i = 0; i < 300; i++) {
    result = await (await fetch(base + `/bridge/job?id=${started.id}`, { headers })).json();
    if (["error", "done"].includes(result.status)) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  if (result.status !== "done") {
    const all = await (await fetch(base + "/api/state", { headers: { "x-tecmon-token": token } })).json();
    assert.fail(all.jobs?.find((j) => j.id === started.id)?.log);
  }
  const video = await fetch(base + `/bridge/video?id=${started.id}&file=0`, { headers });
  assert.equal(video.status, 200);
  assert.equal(await video.text(), "fertiges video");
});
