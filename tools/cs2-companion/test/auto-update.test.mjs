import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCompanion, updaterCommand } from "../server.mjs";

async function setup(over = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "tecmon-auto-"));
  const exe = path.join(dir, "csdm.exe");
  await writeFile(exe, "");
  await mkdir(path.join(dir, "profile"), { recursive: true });
  const installation = { dataDir: dir, profileDir: path.join(dir, "profile"), postgresBin: path.join(dir, "pg"), port: 25433, csdmExe: exe, cs2Exe: "" };
  const calls = { found: 0, fetched: 0, launched: 0, exited: 0, stopped: 0 };
  const companion = await createCompanion({
    installation,
    startDatabase: async () => {},
    stopDatabase: async () => { calls.stopped++; },
    detectTools: async () => ({}),
    onUpdateExit: () => { calls.exited++; },
    findUpdate: async () => { calls.found++; return { available: true, latest: "9.9.9", url: "x", size: 1, sha256: "0".repeat(64) }; },
    fetchUpdate: async () => { calls.fetched++; return path.join(dir, "update.exe"); },
    launchUpdate: () => {
      calls.launched++;
      const child = new EventEmitter();
      child.unref = () => {};
      queueMicrotask(() => child.emit("spawn"));
      return child;
    },
    ...over,
  });
  return { ...companion, calls, dir };
}

test("Automatisches Update installiert ein gefundenes Release und beendet den Dienst", async () => {
  const { autoUpdateTick, calls, server } = await setup();
  await autoUpdateTick();
  assert.deepEqual([calls.found, calls.fetched, calls.stopped, calls.launched, calls.exited], [1, 1, 1, 1, 1]);
  server.close();
});

test("Abgeschaltet oder ohne neue Version passiert nichts", async () => {
  const off = await setup();
  await new Promise((resolve) => off.server.listen(0, "127.0.0.1", resolve));
  const port = off.server.address().port;
  const state = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json().catch(() => null);
  if (state?.updates) assert.equal(state.updates.auto, true, "standardmäßig an");
  off.server.close();

  const none = await setup({ findUpdate: async () => ({ available: false, latest: "0.17.0" }) });
  await none.autoUpdateTick();
  assert.equal(none.calls.launched, 0);
  none.server.close();

  const broken = await setup({ fetchUpdate: async () => { throw new Error("Prüfsumme"); } });
  await broken.autoUpdateTick();
  assert.equal(broken.calls.launched, 0, "fehlerhaftes Update startet nicht");
  assert.equal(broken.calls.exited, 0);
  broken.server.close();
});

test("Updater läuft losgelöst vom Dienst, sonst beendet Windows ihn mit dem Dienst", () => {
  const [args, options] = updaterCommand("C:\\TecMon", 4711);
  assert.deepEqual(args, ["--apply-update", "C:\\TecMon", "4711"]);
  assert.equal(options.detached, true, "ohne detached endet der Updater mit dem Dienst (Job-Objekt von Node)");
  assert.equal(options.stdio, "ignore");
  assert.equal(options.windowsHide, true);
});
