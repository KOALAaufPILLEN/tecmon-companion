import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCompanion } from "../server.mjs";
import { internalProblem } from "../internal-recorder.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Setup „Nur Stats und Tipps“: Video-Aufnahme fehlt, lässt sich aber im Companion nachinstallieren. */
test("Video-Aufnahme nachinstallieren: Status in /api/state, Installation im Hintergrund", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-beginner-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const installation = {
    dataDir: path.join(dir, "data"),
    profileDir: path.join(dir, "private", "csdm-user"),
    hlaeExe: path.join(dir, "tools", "hlae", "hlae.exe"),
    ffmpegExe: path.join(dir, "tools", "ffmpeg", "bin", "ffmpeg.exe"),
    outputDir: path.join(dir, "data", "Videos"),
    cs2Exe: "",
  };
  await mkdir(installation.profileDir, { recursive: true });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const videoTools = async (_root, _run, progress) => {
    calls.push("install");
    progress("HLAE vom Originalanbieter herunterladen und SHA256 prüfen …");
    await gate;
    for (const exe of [installation.hlaeExe, installation.ffmpegExe]) {
      await mkdir(path.dirname(exe), { recursive: true });
      await writeFile(exe, "");
    }
  };
  const { server, token } = await createCompanion({
    installation,
    verifyGame: async (file) => ({ ok: true, reason: "", path: file }),
    detectTools: async () => ({}),
    engineSystem: { videoTools },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = async () => (await fetch(base + "/api/state", { headers: { "x-tecmon-token": token } })).json();
  const post = (route, body = {}) =>
    fetch(base + route, { method: "POST", headers: { "x-tecmon-token": token, "content-type": "application/json" }, body: JSON.stringify(body) });

  let current = await state();
  assert.deepEqual(current.videoTools.installed, { hlae: false, ffmpeg: false });
  assert.equal(current.videoTools.busy, false);
  assert.match(await internalProblem(installation, process.execPath, { sequences: [{ slot: 1 }] }).catch((e) => e.message), /nachinstallieren|Windows/);

  assert.equal((await post("/api/video-tools/install")).status, 200);
  current = await state();
  assert.equal(current.videoTools.busy, true);
  assert.equal(current.active, true, "Video installation reserves processing while tool files change");
  assert.match(current.videoTools.message, /SHA256/);
  await post("/api/video-tools/install"); // läuft schon: kein zweiter Download
  release();
  for (let i = 0; i < 50 && (await state()).videoTools.busy; i++) await new Promise((r) => setTimeout(r, 10));
  current = await state();
  assert.deepEqual(current.videoTools.installed, { hlae: true, ffmpeg: true });
  assert.equal(current.videoTools.error, "");
  assert.equal(current.active, false, "The reservation is released after installation");
  assert.deepEqual(calls, ["install"]);

  // Ansicht und Tutorial speichert der Companion in desktop.json.
  const saved = await (await post("/api/desktop/settings", { ui: "simple", tutorial: 1 })).json();
  assert.equal(saved.desktop.ui, "simple");
  assert.equal((await state()).desktop.ui, "simple");
});

test("Ohne Windows-Installation gibt es keine Video-Aufnahme zum Nachinstallieren", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-beginner-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { server, token } = await createCompanion({ dataDir: dir, detectTools: async () => ({}) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const state = await (await fetch(base + "/api/state", { headers: { "x-tecmon-token": token } })).json();
  assert.equal(state.videoTools, null);
  const response = await fetch(base + "/api/video-tools/install", { method: "POST", headers: { "x-tecmon-token": token, "content-type": "application/json" }, body: "{}" });
  assert.notEqual(response.status, 200);
});

test("Oberfläche: Einstellungen-Karte, Rundgang und Setup-Fragen passen zusammen", async () => {
  const html = await readFile(path.join(here, "..", "public", "index.html"), "utf8");
  const app = await readFile(path.join(here, "..", "public", "app.js"), "utf8");
  const native = await readFile(path.join(here, "..", "windows", "TecMon.cs"), "utf8");
  const { TUTORIAL_VERSION } = await import("../desktop-settings.mjs");
  // Das Figurmenü springt zu #figur („Einstellungen öffnen“): die Karte muss es geben.
  for (const id of ["figur", "ui-mode", "tutorial-start", "video-tools", "video-tools-install", "figure-quality"])
    assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(app, new RegExp(`const TOUR_VERSION=${TUTORIAL_VERSION};`));
  // Jeder Schritt des Rundgangs zeigt auf eine vorhandene Karte.
  const steps = [...app.slice(app.indexOf("const TOUR=[")).matchAll(/\{sel:'([^']+)'/g)].map((m) => m[1]);
  assert.ok(steps.length >= 5);
  for (const selector of steps) {
    const needle = selector.startsWith("#") ? `id="${selector.slice(1)}"` : `class="card ${selector.slice(1)}"`;
    assert.ok(html.includes(needle), selector);
  }
  // Die Antworten des Setup-Assistenten gehen an install-backend.mjs.
  assert.match(native, /games=chosen\.ToArray\(\),videoTools=cs2\.Checked&&full\.Checked,ui=simple\.Checked\?"simple":"advanced"/);
  assert.match(native, /id=="tutorial"\?"window\.startTutorial/);
});
