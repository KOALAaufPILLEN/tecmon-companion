import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, symlink, link, rm } from "node:fs/promises";
import { checkCs2Exe, steamappsOf, VALVE_SIGNER } from "../cs2-verify.mjs";

const VALVE = { status: "Valid", subject: "CN=Valve Corp., O=Valve Corp., L=Bellevue, S=Washington, C=US" };
const valve = async () => VALVE;

/** Steam-Bibliothek mit cs2.exe (PE-Kopf) und appmanifest_730.acf. */
async function library(dir, { manifest = true, bytes = "MZ\x90\x00" } = {}) {
  const steamapps = path.join(dir, "Steam", "steamapps");
  const exe = path.join(steamapps, "common", "Counter-Strike Global Offensive", "game", "bin", "win64", "cs2.exe");
  await mkdir(path.dirname(exe), { recursive: true });
  await writeFile(exe, bytes, "latin1");
  if (manifest) await writeFile(path.join(steamapps, "appmanifest_730.acf"), '"AppState" { "appid" "730" }');
  return exe;
}

test("echte cs2.exe in der Steam-Bibliothek mit Valve-Signatur wird angenommen", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cs2v-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const exe = await library(dir);
  const result = await checkCs2Exe(exe, { platform: "win32", signature: valve });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.path.toLowerCase(), exe.toLowerCase());
});

test("umbenannte Browser-exe: falscher Signierer oder keine Signatur wird abgelehnt", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cs2v-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const exe = await library(dir);
  const microsoft = async () => ({ status: "Valid", subject: "CN=Microsoft Corporation, O=Microsoft Corporation, C=US" });
  assert.match((await checkCs2Exe(exe, { platform: "win32", signature: microsoft })).reason, /nicht von Valve/);
  const unsigned = async () => ({ status: "NotSigned", subject: "" });
  assert.match((await checkCs2Exe(exe, { platform: "win32", signature: unsigned })).reason, /keine gültige/);
  const broken = async () => ({ status: "HashMismatch", subject: VALVE.subject });
  assert.equal((await checkCs2Exe(exe, { platform: "win32", signature: broken })).ok, false);
});

test("ohne prüfbare Signatur (PowerShell-Fehler) wird nichts gestartet", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cs2v-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const exe = await library(dir, { bytes: "MZerror" });
  const result = await checkCs2Exe(exe, { platform: "win32", signature: async () => ({ status: "Error", subject: "" }) });
  assert.match(result.reason, /ließ sich nicht prüfen/);
});

test("cs2.exe außerhalb einer Steam-Bibliothek oder ohne Manifest wird abgelehnt", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cs2v-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const loose = path.join(dir, "Downloads", "cs2.exe");
  await mkdir(path.dirname(loose), { recursive: true });
  await writeFile(loose, "MZ");
  assert.match((await checkCs2Exe(loose, { platform: "win32", signature: valve })).reason, /Steam-Bibliothek/);
  const other = await library(path.join(dir, "b"), { manifest: false });
  assert.match((await checkCs2Exe(other, { platform: "win32", signature: valve })).reason, /appmanifest_730/);
});

test("Dateiname, PE-Kopf und relative Pfade werden geprüft", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cs2v-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal((await checkCs2Exe("cs2.exe", { platform: "win32", signature: valve })).ok, false);
  assert.match((await checkCs2Exe(path.join(dir, "chrome.exe"), { signature: valve })).reason, /heißt nicht/);
  assert.match((await checkCs2Exe(path.join(dir, "cs2.lnk"), { signature: valve })).reason, /heißt nicht/);
  const text = await library(dir, { bytes: "#!/bin/sh\n" });
  assert.match((await checkCs2Exe(text, { platform: "win32", signature: valve })).reason, /kein Windows-Programm/);
});

test("Symlink cs2.exe auf ein anderes Programm wird abgelehnt", { skip: process.platform === "win32" }, async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cs2v-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const real = await library(dir);
  const browser = path.join(dir, "browser.exe");
  await writeFile(browser, "MZ");
  await rm(real);
  await symlink(browser, real);
  assert.match((await checkCs2Exe(real, { platform: "win32", signature: valve })).reason, /Verknüpfung/);
});

test("Link auf die echte cs2.exe wird zum echten Pfad aufgelöst", { skip: process.platform === "win32" }, async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cs2v-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const real = await library(dir);
  const alias = path.join(dir, "elsewhere", "cs2.exe");
  await mkdir(path.dirname(alias), { recursive: true });
  await symlink(real, alias);
  const result = await checkCs2Exe(alias, { platform: "win32", signature: valve });
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.path, real);
});

test("Hardlink (Datei mit mehreren Namen) wird abgelehnt", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cs2v-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const real = await library(dir);
  await rm(real);
  const browser = path.join(dir, "browser.exe");
  await writeFile(browser, "MZ");
  await link(browser, real);
  assert.match((await checkCs2Exe(real, { platform: "win32", signature: valve })).reason, /Hardlink/);
});

test("steamappsOf und Valve-Signierer", () => {
  assert.equal(steamappsOf(path.join(path.sep, "x", "cs2.exe")), "");
  assert.ok(VALVE_SIGNER.test(VALVE.subject));
  assert.ok(VALVE_SIGNER.test('CN="Valve Corp.", O="Valve Corp.", C=US'));
  assert.ok(!VALVE_SIGNER.test("CN=Valve Corp., O=Valve Corp Fake Ltd, C=US"));
  assert.ok(!VALVE_SIGNER.test("CN=Valve Corp., O=Evil Inc, C=US"));
});

test("Companion: abgelehnte cs2.exe wird nicht benutzt, Grund steht in /api/state", async (t) => {
  const { createCompanion } = await import("../server.mjs");
  const { once } = await import("node:events");
  const dir = await mkdtemp(path.join(os.tmpdir(), "cs2v-api-"));
  const cs2 = path.join(dir, "fake", "cs2.exe");
  await mkdir(path.dirname(cs2), { recursive: true });
  await writeFile(cs2, "MZ");
  const { server, token } = await createCompanion({
    dataDir: path.join(dir, "data"),
    detectTools: async () => ({ csdm: "", cs2 }),
    verifyGame: (file) => checkCs2Exe(file, { platform: "win32", signature: valve }),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const state = await (await fetch(base + "/api/state", { headers })).json();
  assert.equal(state.detected.cs2, "");
  assert.equal(state.cs2Check.ok, false);
  assert.match(state.cs2Check.reason, /Steam-Bibliothek/);
  const gsi = await fetch(base + "/api/gsi/enable", { method: "POST", headers, body: JSON.stringify({ confirm: true }) });
  assert.ok(gsi.status >= 400, "keine cfg-Dateien neben einer abgelehnten cs2.exe");
});
