import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { validateJob, recordingConfig, jobCameras } from "../job.mjs";
import {
  buildActions,
  jobSlots,
  installPlugin,
  uninstallPlugin,
  hlaeArgs,
  cs2Root,
  encodeSequences,
  recordInternal,
} from "../internal-recorder.mjs";
import { decodeShareCode, demoLinks, ensureBoiler, downloadValveDemo, BOILER } from "../valve-download.mjs";

const STEAM = "76561198000000001";
const OTHER = "76561198000000002";
const baseJob = (extra = {}) => ({
  format: "tecmon-cs2-job",
  version: 1,
  title: "Test",
  map: "de_mirage",
  tickRate: 64,
  branding: { enabled: false },
  sequences: [
    { startTick: 9000, endTick: 9640, steamId: OTHER, playerName: "Zwei", slot: 4 },
    { startTick: 3000, endTick: 3640, steamId: STEAM, playerName: "Eins", slot: 2 },
  ],
  ...extra,
});
const temp = () => mkdtemp(path.join(os.tmpdir(), "tecmon-engine-"));

test("Auftrag übernimmt gültige Spieler-Slots und lehnt ungültige ab", () => {
  const job = validateJob(baseJob());
  assert.deepEqual(job.sequences.map((s) => s.slot), [4, 2]);
  assert.equal(jobSlots(job).get(STEAM), 2);
  const old = validateJob(baseJob({ sequences: [{ startTick: 100, endTick: 200, steamId: STEAM, playerName: "A" }] }));
  assert.equal(old.sequences[0].slot, undefined);
  assert.equal(jobSlots(old), null, "ohne Slot bleibt nur CS Demo Manager");
  for (const slot of [0, 65, 1.5, "3"])
    assert.throws(() => validateJob(baseJob({ sequences: [{ startTick: 1, endTick: 2, steamId: STEAM, slot }] })));
  const clash = validateJob(baseJob({ sequences: [
    { startTick: 100, endTick: 200, steamId: STEAM, slot: 2 },
    { startTick: 300, endTick: 400, steamId: STEAM, slot: 3 },
  ] }));
  assert.equal(jobSlots(clash), null, "widersprüchliche Slots nicht raten");
});

test("Aktionsdatei folgt der CSDM-Befehlsfolge, sortiert nach Starttick", () => {
  const job = validateJob(baseJob());
  const recording = recordingConfig(job, "C:\\Demos\\a.dem", "C:\\Out\\job", "1080p60");
  const plan = buildActions(recording, { tickRate: 64, slots: jobSlots(job) });
  assert.equal(plan.length, 2);
  const [first, second] = plan.map((p) => p.actions);
  // Szene 2 (Tick 3000) kommt zuerst.
  assert.ok(first.some((a) => a.cmd === 'mirv_streams record name "C:/Out/job/2-sequence"'));
  assert.ok(first.some((a) => a.tick === 3000 && a.cmd === "mirv_streams record start"));
  assert.ok(first.some((a) => a.tick === 3640 && a.cmd === "mirv_streams record end"));
  assert.ok(first.some((a) => a.cmd === "spec_player 2" && a.tick === 3000));
  assert.deepEqual(first.at(-1), { tick: 3704, cmd: "go_to_next_sequence" });
  assert.ok(first.some((a) => a.cmd === "demo_gototick 2935" && a.tick === 96));
  assert.ok(first.some((a) => a.cmd === "pause_playback" && a.tick === 2996));
  assert.ok(first.some((a) => a.cmd.startsWith("mirv_streams settings add ffmpeg csdmPreset2 \"-c:v libx264 -pix_fmt yuv420p -crf 20 {QUOTE}C:/Out/job/2-sequence\\\\video.mp4{QUOTE}\"")));
  assert.ok(first.some((a) => a.cmd === `mirv_deathmsg filter add attackerMatch=x${STEAM} attackerIsLocal=0 block=0`));
  assert.ok(first.some((a) => a.cmd === "spec_show_xray 1"));
  assert.ok(first.some((a) => a.cmd === "mirv_streams record fps 60"));
  assert.ok(second.some((a) => a.cmd === "spec_player 4"));
  assert.deepEqual(second.at(-1), { tick: 9704, cmd: "quit" });
  assert.ok([...first, ...second].every((a) => a.tick >= 96), "keine Befehle vor Tick 96");
});

test("Freecam-Punkte kommen ohne Datenbank direkt aus dem Auftrag", () => {
  const job = validateJob(baseJob({ sequences: [{
    startTick: 3000, endTick: 3640, steamId: STEAM, playerName: "Eins", slot: 2,
    cuts: [{ tick: 3000, kind: "free", x: 1, y: 2, z: 3, pitch: 4, yaw: 5 }, { tick: 3300, kind: "player" }],
  }] }));
  let n = 0;
  const cameras = jobCameras(job, () => `cam-${++n}`);
  const recording = recordingConfig(job, "C:\\a.dem", "C:\\out", "720p30", cameras);
  const [{ actions }] = buildActions(recording, { tickRate: 64, slots: jobSlots(job), cameras });
  assert.ok(actions.some((a) => a.tick === 3000 && a.cmd === "spec_goto 1 2 3 4 5"));
  assert.ok(actions.some((a) => a.tick === 3300 && a.cmd === "spec_player 2"));
  assert.ok(!actions.some((a) => a.tick === 3000 && a.cmd === "spec_player 2"), "kein Wechsel auf den Spieler vor dem Freecam-Start");
});

test("Plugin wird eingehängt und danach rückstandsfrei entfernt", async () => {
  const root = await temp();
  const csgo = path.join(root, "game", "csgo");
  await mkdir(path.join(root, "game", "bin", "win64"), { recursive: true });
  await mkdir(csgo, { recursive: true });
  const original = '"GameInfo"\r\n{\r\n\tFileSystem\r\n\t{\r\n\t\tSearchPaths\r\n\t\t{\r\n\t\t\tGame_LowViolence\tcsgo_lv\r\n\t\t\tGame\tcsgo\r\n\t\t\tGame\tcsgo_imported\r\n\t\t}\r\n\t}\r\n}\r\n';
  await writeFile(path.join(csgo, "gameinfo.gi"), original);
  await writeFile(path.join(root, "game", "bin", "win64", "csdm.log"), "alt");
  await installPlugin(root, Buffer.from("dll"));
  const patched = await readFile(path.join(csgo, "gameinfo.gi"), "utf8");
  assert.match(patched, /\t\t\tGame\tcsgo\/csdm\r\n\t\t\tGame\tcsgo\r\n/);
  assert.equal(await readFile(path.join(csgo, "csdm", "bin", "server.dll"), "utf8"), "dll");
  assert.ok(!existsSync(path.join(root, "game", "bin", "win64", "csdm.log")));
  await installPlugin(root, Buffer.from("dll"));
  assert.equal(await readFile(path.join(csgo, "gameinfo.gi"), "utf8"), patched, "kein doppelter Eintrag");
  await uninstallPlugin(root);
  assert.equal(await readFile(path.join(csgo, "gameinfo.gi"), "utf8"), original);
  assert.ok(!existsSync(path.join(csgo, "csdm")));
  await rm(root, { recursive: true, force: true });
});

test("HLAE-Aufruf und CS2-Ordner", () => {
  const args = hlaeArgs({ hlaeExe: "C:\\T\\hlae\\hlae.exe", cs2Exe: "C:\\cs2.exe", demo: "D:\\x y.dem", width: 1920, height: 1080 });
  assert.deepEqual(args.slice(0, 5), ["-noGui", "-autoStart", "-noConfig", "-afxDisableSteamStorage", "-customLoader"]);
  assert.equal(args.at(-1), '-insecure -novid +playdemo "D:\\x y.dem" -width 1920 -height 1080 -sw');
  assert.equal(cs2Root(path.join("S", "game", "bin", "win64", "cs2.exe")), path.resolve("S"));
});

async function fakeRecording(output, sequences) {
  for (const s of sequences) {
    const folder = path.join(output, `${s.number}-sequence`);
    await mkdir(path.join(folder, "take0000"), { recursive: true });
    await writeFile(path.join(folder, "video.mp4"), "v");
    await writeFile(path.join(folder, "take0000", "audio.wav"), "a");
  }
}

test("Szenen werden mit Ton zusammengeführt und verbunden", async () => {
  const output = await temp();
  const job = validateJob(baseJob());
  const recording = recordingConfig(job, "x.dem", output, "1080p60");
  await fakeRecording(output, recording.sequences);
  const calls = [];
  const ffmpeg = async (_exe, args) => {
    calls.push(args);
    await writeFile(args.at(-1), "out");
  };
  const files = await encodeSequences(recording, "ffmpeg.exe", () => {}, ffmpeg);
  assert.deepEqual(files, [path.join(output, "tecmon-highlight.mp4")]);
  assert.equal(calls.length, 5, "je Szene Ton + Zusammenführen, dann Verbinden");
  assert.deepEqual(calls[1].slice(-6, -1), ["copy", "-map", "0:v:0", "-map", "1:a:0"]);
  assert.equal(calls[4][calls[4].indexOf("-f") + 1], "concat");
  assert.deepEqual(await readdir(output), ["tecmon-highlight.mp4"]);
  recording.concatenateSequences = false;
  await fakeRecording(output, recording.sequences);
  const separate = await encodeSequences(recording, "ffmpeg.exe", () => {}, ffmpeg);
  assert.deepEqual(separate.map((f) => path.basename(f)), ["sequence-1-tick-9000-to-9640.mp4", "sequence-2-tick-3000-to-3640.mp4"]);
  await rm(output, { recursive: true, force: true });
});

test("Gesamte Aufnahme ohne CS Demo Manager, mit Aufräumen", async () => {
  const dir = await temp();
  const root = path.join(dir, "cs2");
  const cs2Exe = path.join(root, "game", "bin", "win64", "cs2.exe");
  await mkdir(path.dirname(cs2Exe), { recursive: true });
  await writeFile(cs2Exe, "");
  await mkdir(path.join(root, "game", "csgo"), { recursive: true });
  const gameinfo = "\t\t\tGame\tcsgo\n";
  await writeFile(path.join(root, "game", "csgo", "gameinfo.gi"), gameinfo);
  const tools = path.join(dir, "tools");
  await mkdir(path.join(tools, "hlae"), { recursive: true });
  await mkdir(path.join(tools, "ffmpeg"), { recursive: true });
  const installation = {
    hlaeExe: path.join(tools, "hlae", "hlae.exe"),
    ffmpegExe: path.join(tools, "ffmpeg", "ffmpeg.exe"),
    profileDir: path.join(dir, "private", "csdm-user"),
  };
  await writeFile(installation.hlaeExe, "");
  await writeFile(installation.ffmpegExe, "");
  const demo = path.join(dir, "match.dem");
  await writeFile(demo, "PBDEMS2\0");
  const output = path.join(dir, "out");
  const job = validateJob(baseJob());
  const recording = recordingConfig(job, demo, output, "1080p60");
  let cs2 = false;
  let naps = 0;
  let plan = null;
  let launched = null;
  const system = {
    plugin: async () => Buffer.from("dll"),
    isRunning: async (image) => (image === "steam.exe" ? true : cs2),
    sleep: async () => {
      if (cs2 && ++naps > 1) {
        cs2 = false; // CS2 beendet sich nach "quit"
        await fakeRecording(output, recording.sequences);
      }
    },
    launch: (exe, args, env) => {
      launched = { exe, args, env };
      plan = JSON.parse(readFileSync(`${demo}.json`.replaceAll("\\", "/"), "utf8"));
      assert.ok(existsSync(path.join(root, "game", "csgo", "csdm", "bin", "server.dll")));
      const child = new EventEmitter();
      setImmediate(() => {
        cs2 = true;
        child.emit("exit", 0);
      });
      return child;
    },
    ffmpeg: async (_exe, args) => writeFile(args.at(-1), "out"),
  };
  const files = await recordInternal({ recording, job, demo, installation, cs2Exe, cacheDir: path.join(dir, "cache"), system });
  assert.equal(launched.exe, installation.hlaeExe);
  assert.equal(launched.env.USRLOCALCSGO, path.join(dir, "private", "hlae-config"));
  assert.equal(plan.length, 2);
  assert.deepEqual(files, [path.join(output, "tecmon-highlight.mp4")]);
  assert.equal(await readFile(path.join(root, "game", "csgo", "gameinfo.gi"), "utf8"), gameinfo, "gameinfo.gi wiederhergestellt");
  assert.ok(!existsSync(path.join(root, "game", "csgo", "csdm")));
  assert.ok(!existsSync(demo + ".json"), "Aktionsdatei entfernt");
  assert.match(await readFile(path.join(tools, "hlae", "ffmpeg", "ffmpeg.ini"), "utf8"), /Path=.*ffmpeg\.exe/);
  // Läuft CS2 schon, startet nichts.
  cs2 = true;
  await assert.rejects(
    recordInternal({ recording, job, demo, installation, cs2Exe, cacheDir: path.join(dir, "cache"), system }),
    /CS2 läuft bereits/,
  );
  await rm(dir, { recursive: true, force: true });
});

test("Sharecode wird ohne Rundung dekodiert", () => {
  assert.deepEqual(decodeShareCode("CSGO-GADqf-jjyJ8-cSP2r-smZRo-TO2xK"), {
    matchId: "3230642215713767580",
    outcomeId: "3230647599455273103",
    tvPort: "55788",
  });
});

const varint = (n) => {
  const out = [];
  let v = BigInt(n);
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return Buffer.from(out);
};
const field = (number, bytes) => Buffer.concat([varint((number << 3) | 2), varint(bytes.length), bytes]);
const LINK = "http://replay183.valve.net/730/003230642215713767580_1234567890.dem.bz2";
const matchList = (link = LINK) =>
  field(4, Buffer.concat([
    Buffer.concat([varint(1 << 3), varint(3230642215713767580n)]),
    field(5, Buffer.concat([varint(1 << 3), varint(7), field(3, Buffer.from("x"))])),
    field(5, Buffer.concat([field(3, Buffer.from(link))])),
  ]));

test("Demo-Link aus den Match-Infos lesen", () => {
  assert.deepEqual(demoLinks(matchList()), [LINK]);
  assert.deepEqual(demoLinks(matchList("http://evil.example/x.dem.bz2")), [null]);
  assert.throws(() => demoLinks(Buffer.from([0x22, 0x50])));
});

function tar(files) {
  const parts = [];
  for (const [name, content] of Object.entries(files)) {
    const header = Buffer.alloc(512);
    header.write(name, 0);
    header.write(content.length.toString(8).padStart(11, "0") + "\0", 124);
    header.write("0", 156);
    parts.push(header, content, Buffer.alloc((512 - (content.length % 512)) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  body: (async function* () {
    for (let i = 0; i < body.length; i += 7) yield body.subarray(i, i + 7);
  })(),
});

test("boiler-writter nur mit passender npm-Prüfsumme", async () => {
  const dir = await temp();
  const fake = tar({ "package/dist/bin/win32-x64/boiler-writter.exe": Buffer.from("exe") });
  await assert.rejects(ensureBoiler(dir, async () => response(fake)), /Prüfsumme/);
  assert.equal(BOILER.url.startsWith("https://registry.npmjs.org/@akiver/boiler-writter/-/"), true);
  await rm(dir, { recursive: true, force: true });
});

// "PBDEMS2\0" + 3000 x, mit bzip2 -9 gepackt.
const BZ2 = Buffer.from("QlpoOTFBWSZTWVUUOFIAAANOiMAAEAAWAkgAAEAAAIAIIAAhJE0ZpCAaaaIu6755qQ9AF8XckU4UJBVFDhSA", "base64");

test("Demo-Download über Steam und Valve, lokal entpackt", async () => {
  const dir = await temp();
  const cache = path.join(dir, "cache");
  const folder = path.join(cache, `boiler-writter-${BOILER.version}`);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "boiler-writter.exe"), "");
  await writeFile(path.join(folder, "integrity.txt"), BOILER.integrity);
  let args = null;
  const system = {
    isRunning: async (image) => image === "steam.exe",
    runBoiler: async (_exe, a) => {
      args = a;
      await writeFile(a[0], matchList());
      return 0;
    },
    request: async (url) => {
      assert.equal(url, LINK);
      return response(BZ2);
    },
  };
  const demo = await downloadValveDemo({ code: "CSGO-GADqf-jjyJ8-cSP2r-smZRo-TO2xK", directory: path.join(dir, "dl"), cacheDir: cache, system });
  assert.deepEqual(args.slice(1), ["3230642215713767580", "3230647599455273103", "55788"]);
  const bytes = await readFile(demo);
  assert.equal(bytes.length, 3008);
  assert.equal(bytes.subarray(0, 8).toString(), "PBDEMS2\0");
  assert.deepEqual(await readdir(path.dirname(demo)), [path.basename(demo)], "keine Reste");
  await assert.rejects(
    downloadValveDemo({ code: "CSGO-GADqf-jjyJ8-cSP2r-smZRo-TO2xK", directory: path.join(dir, "dl2"), cacheDir: cache, system: { ...system, runBoiler: async () => 8 } }),
    /abgelaufen/,
  );
  await assert.rejects(
    downloadValveDemo({ code: "CSGO-GADqf-jjyJ8-cSP2r-smZRo-TO2xK", directory: path.join(dir, "dl3"), cacheDir: cache, system: { ...system, isRunning: async () => true } }),
    /CS2 schließen/,
  );
  await rm(dir, { recursive: true, force: true });
});
