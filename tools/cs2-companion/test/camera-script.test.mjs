import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, writeFile, readFile, rm, appendFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { validateJob, recordingConfig, jobCameras, needsScript } from "../job.mjs";
import { buildActions, jobSlots, cameraSession } from "../internal-recorder.mjs";
import { scriptPlan, scriptSource, parseMarks, MARK_COMMAND } from "../camera-script.mjs";

const STEAM = "76561198000000001";
const key = (tick, x, yaw = 0) => ({ tick, x, y: 0, z: 100, pitch: 10, yaw });
const job = (cuts) =>
  validateJob({
    format: "tecmon-cs2-job",
    version: 1,
    title: "Kamera",
    map: "de_mirage",
    tickRate: 64,
    branding: { enabled: false },
    sequences: [{ startTick: 1000, endTick: 2000, steamId: STEAM, playerName: "Eins", slot: 3, cuts }],
  });

test("Auftrag nimmt Kamerafahrten und Verfolger-Kamera nur mit gültigen Zahlen an", () => {
  const ok = job([
    { tick: 1000, kind: "path", keys: [key(1000, 0), key(1300, 300, 170), key(1500, 600, -170)] },
    { tick: 1500, kind: "follow", distance: 150, height: 40, orbit: 20 },
    { tick: 1800, kind: "player" },
  ]);
  assert.equal(ok.sequences[0].cuts[0].keys.length, 3);
  assert.equal(ok.sequences[0].cuts[1].distance, 150);
  assert.ok(needsScript(ok));
  assert.ok(!needsScript(job([{ tick: 1200, kind: "player" }])));
  for (const cuts of [
    [{ tick: 1000, kind: "path", keys: [key(1000, 0)] }],
    [{ tick: 1000, kind: "path", keys: [key(1100, 0), key(1200, 1)] }],
    [{ tick: 1000, kind: "path", keys: [key(1000, 0), key(1000, 1)] }],
    [{ tick: 1000, kind: "path", keys: [key(1000, 0), key(2500, 1)] }],
    [{ tick: 1000, kind: "path", keys: Array.from({ length: 9 }, (_, i) => key(1000 + i, i)) }],
    [{ tick: 1000, kind: "path", keys: [key(1000, 0), { ...key(1100, 0), x: "1;quit" }] }],
    [{ tick: 1000, kind: "follow", distance: 10, height: 0, orbit: 0 }],
    [{ tick: 1000, kind: "follow", distance: 100, height: 0, orbit: 999 }],
    [{ tick: 1000, kind: "follow", distance: 100, height: 0 }],
  ])
    assert.throws(() => job(cuts), JSON.stringify(cuts));
});

test("Ohne eigene Engine: Fahrt beginnt am ersten Punkt, Verfolger wird Egoansicht", () => {
  const spec = job([
    { tick: 1000, kind: "path", keys: [key(1000, 5), key(1300, 300)] },
    { tick: 1500, kind: "follow", distance: 150, height: 40, orbit: 0 },
  ]);
  let n = 0;
  const cameras = jobCameras(spec, () => `00000000-0000-4000-8000-00000000000${n++}`);
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].x, 5);
  const config = recordingConfig(spec, "C:/a.dem", "C:/out", "1080p60", cameras);
  assert.deepEqual(config.sequences[0].playerCameras.map((c) => c.tick), [1500]);
  assert.deepEqual(config.sequences[0].cameras.map((c) => c.tick), [1000]);
});

test("Kameraplan enthält nur Zahlen; Skript wird einmal geladen", () => {
  const spec = job([
    { tick: 1000, kind: "path", keys: [key(1000, 0), key(1300, 300)] },
    { tick: 1500, kind: "follow", distance: 150, height: 40, orbit: 20 },
  ]);
  const plan = scriptPlan(spec);
  assert.deepEqual(plan.segments.map((s) => [s.kind, s.from, s.to]), [["path", 1000, 1500], ["follow", 1500, 2000]]);
  assert.equal(plan.segments[1].slot, 3);
  const source = scriptSource(plan);
  assert.ok(source.startsWith(`var TECMON_PLAN = ${JSON.stringify(plan)};`));
  assert.throws(() => scriptSource({ ...plan, segments: [{ from: 1, to: 2, kind: "path", keys: [["x", 1, 2, 3, 4, 5]] }] }));
  assert.throws(() => scriptSource({ ...plan, segments: [{ from: 1, to: 2, kind: "exec" }] }));
  const recording = recordingConfig(spec, "C:/a.dem", "C:/out", "1080p60");
  const actions = buildActions(recording, { tickRate: 64, slots: jobSlots(spec), script: "C:\\Demos\\a.dem.tecmon-camera.js" });
  const loads = actions.flatMap((a) => a.actions).filter((a) => a.cmd.startsWith("mirv_script_load"));
  assert.deepEqual(loads.map((a) => a.cmd), ['mirv_script_load "C:/Demos/a.dem.tecmon-camera.js"']);
  assert.throws(() => buildActions(recording, { tickRate: 64, slots: jobSlots(spec), script: 'C:/x";quit;".js' }));
});

/** Das HLAE-Skript in einer Attrappe von mirv ausführen. */
function runScript(plan, world) {
  const handlers = {};
  const commands = {};
  const out = [];
  const mirv = {
    events: { cViewRenderSetupView: { on: (id, fn) => (handlers[id] = fn), off: (id) => delete handlers[id] } },
    isPlayingDemo: () => true,
    getDemoTick: () => world.tick,
    getDemoTime: () => world.tick / 64,
    getEntityFromIndex: (i) => world.entities[i] || null,
    isHandleValid: (h) => h > 0,
    getHandleEntryIndex: (h) => h,
    message: (m) => out.push(m),
    warning: (m) => out.push(m),
  };
  class AdvancedfxConCommand {
    constructor(fn) {
      this.fn = fn;
    }
    register(name) {
      commands[name] = this.fn;
    }
    unregister() {}
  }
  const context = vm.createContext({ mirv, AdvancedfxConCommand, Math, JSON });
  context.globalThis = context;
  vm.runInContext(scriptSource(plan), context);
  const frame = () => {
    const current = { x: 1, y: 2, z: 3, rX: 4, rY: 5, rZ: 0, fov: 90 };
    return handlers["tecmon/camera"]({ currentView: current, lastView: current });
  };
  return { frame, commands, out };
}

test("Skript fährt weich zwischen den Punkten und folgt dem Spieler", () => {
  const spec = job([
    { tick: 1000, kind: "path", keys: [key(1000, 0, 170), key(1200, 200, -170)] },
    { tick: 1500, kind: "follow", distance: 100, height: 0, orbit: 0 },
  ]);
  const pawn = { getRenderEyeOrigin: () => [500, 0, 64], getRenderEyeAngles: () => [0, 0, 0] };
  const world = { tick: 900, entities: { 3: { getPlayerPawnHandle: () => 7 }, 7: pawn } };
  const { frame, commands, out } = runScript(scriptPlan(spec), world);
  assert.equal(frame(), undefined, "vor der Szene keine Übernahme");
  world.tick = 1000;
  assert.equal(frame().x, 0);
  world.tick = 1100;
  const mid = frame();
  assert.ok(mid.x > 90 && mid.x < 110, `Mitte ${mid.x}`);
  assert.ok(Math.abs(Math.abs(mid.rY) - 180) < 1, `kurzer Weg über 180°: ${mid.rY}`);
  world.tick = 1400;
  assert.equal(frame().x, 200, "nach dem letzten Punkt stehen bleiben");
  world.tick = 1600;
  const follow = frame();
  assert.deepEqual([Math.round(follow.x), Math.round(follow.y), Math.round(follow.z)], [400, 0, 64]);
  assert.equal(Math.round(follow.rY), 0, "schaut auf den Spieler");
  commands[MARK_COMMAND]();
  const marks = parseMarks(out.join(""));
  assert.equal(marks.length, 1);
  assert.equal(marks[0].tick, 1600);
  assert.equal(Math.round(marks[0].x), 400);
});

test("Verfolger mit Startwinkel 180 steht vor dem Spieler (Spieler-Intro)", () => {
  const spec = job([{ tick: 1000, kind: "follow", distance: 90, height: 0, orbit: 0, angle: 180 }]);
  assert.equal(spec.sequences[0].cuts[0].angle, 180);
  assert.equal(job([{ tick: 1000, kind: "follow", distance: 90, height: 0, orbit: 0 }]).sequences[0].cuts[0].angle, 0);
  assert.throws(() => job([{ tick: 1000, kind: "follow", distance: 90, height: 0, orbit: 0, angle: 400 }]));
  const pawn = { getRenderEyeOrigin: () => [500, 0, 64], getRenderEyeAngles: () => [0, 0, 0] };
  const world = { tick: 1100, entities: { 3: { getPlayerPawnHandle: () => 7 }, 7: pawn } };
  const { frame } = runScript(scriptPlan(spec), world);
  const front = frame();
  assert.deepEqual([Math.round(front.x), Math.round(front.y) + 0], [590, 0], "vor dem Spieler in Blickrichtung");
  assert.equal(Math.round(Math.abs(front.rY)), 180, "schaut zurück auf das Gesicht");
});

test("Gemerkte Punkte werden geprüft und begrenzt", () => {
  const text = [
    'TECMON_MARK {"tick":5,"x":1.234,"y":2,"z":3,"pitch":100,"yaw":270}',
    'TECMON_MARK {"tick":5,"x":"1","y":2,"z":3,"pitch":0,"yaw":0}',
    "TECMON_MARK kaputt",
    ...Array.from({ length: 30 }, (_, i) => `TECMON_MARK {"tick":${i},"x":${i},"y":0,"z":0,"pitch":0,"yaw":0}`),
  ].join("\r\n");
  const marks = parseMarks(text);
  assert.equal(marks.length, 24);
  assert.equal(marks.at(-1).x, 29);
  const [first] = parseMarks(text.split("\r\n")[0]);
  assert.deepEqual(first, { tick: 5, x: 1.23, y: 2, z: 3, pitch: 89, yaw: -90 });
});

test("Kamera im Spiel setzen: Demo anhalten, Punkte aus neuen Konsolenzeilen lesen, aufräumen", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-camera-"));
  const root = path.join(dir, "cs2");
  const cs2Exe = path.join(root, "game", "bin", "win64", "cs2.exe");
  await mkdir(path.dirname(cs2Exe), { recursive: true });
  await writeFile(cs2Exe, "");
  const csgo = path.join(root, "game", "csgo");
  await mkdir(csgo, { recursive: true });
  await writeFile(path.join(csgo, "gameinfo.gi"), "\t\t\tGame\tcsgo\n");
  const consoleLog = path.join(csgo, "console.log");
  await writeFile(consoleLog, 'TECMON_MARK {"tick":1,"x":9,"y":9,"z":9,"pitch":0,"yaw":0}\n'); // alte Sitzung
  const installation = { hlaeExe: path.join(dir, "hlae.exe"), profileDir: path.join(dir, "private", "csdm-user") };
  await writeFile(installation.hlaeExe, "");
  const demo = path.join(dir, "match.dem");
  await writeFile(demo, "PBDEMS2\0");
  let cs2 = false;
  let plan = null;
  let args = null;
  let naps = 0;
  const system = {
    plugin: async () => Buffer.from("dll"),
    isRunning: async (image) => (image === "steam.exe" ? true : cs2),
    sleep: async () => {
      if (cs2 && ++naps > 1) {
        await appendFile(consoleLog, 'TecMon: x\nTECMON_MARK {"tick":5000,"x":10,"y":20,"z":30,"pitch":5,"yaw":45}\n');
        cs2 = false;
      }
    },
    launch: (_exe, a) => {
      args = a;
      plan = JSON.parse(readFileSync(`${demo}.json`.replaceAll("\\", "/"), "utf8"));
      assert.ok(existsSync(`${demo}.tecmon-camera.js`.replaceAll("\\", "/")));
      const child = new EventEmitter();
      setImmediate(() => {
        cs2 = true;
        child.emit("exit", 0);
      });
      return child;
    },
  };
  const marks = await cameraSession({ demo, tick: 5000, installation, cs2Exe, cacheDir: path.join(dir, "cache"), system });
  assert.deepEqual(marks, [{ tick: 5000, x: 10, y: 20, z: 30, pitch: 5, yaw: 45 }]);
  const cmds = plan[0].actions.map((a) => a.cmd);
  assert.ok(cmds.includes("demo_gototick 5000"));
  assert.ok(cmds.includes("demo_pause") && cmds.includes("mirv_input camera"));
  assert.ok(cmds.includes(`bind "F8" "${MARK_COMMAND}"`));
  assert.ok(!cmds.includes("quit"), "CS2 bleibt offen, bis der Nutzer es schließt");
  assert.match(args.at(-1), /-insecure -novid -condebug \+playdemo/);
  assert.ok(!existsSync(`${demo}.json`) && !existsSync(`${demo}.tecmon-camera.js`), "aufgeräumt");
  assert.ok(!existsSync(path.join(csgo, "csdm")));
  assert.match(await readFile(consoleLog, "utf8"), /"x":9/, "console.log des Nutzers bleibt erhalten");
  await rm(dir, { recursive: true, force: true });
});
