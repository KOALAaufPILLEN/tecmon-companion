import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createGsiSettings, DEFAULTS_VERSION } from "../gsi-config.mjs";
import { createAutoHighlights } from "../auto-highlights.mjs";
import { createChatTranslator } from "../chat-translate.mjs";

/* Nutzerentscheid 23.11.2026: in CS2 ist alles standardmäßig an, außer dem Fadenkreuz-Overlay.
   Alte Dateien (damals war „aus“ der Standard) bekommen die neuen Standards einmal, danach zählt die eigene Wahl. */

const temp = async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-defaults-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
};
const token = "a".repeat(64);

test("Rundentipps: neu an, alte Datei einmal eingeschaltet, eigene Wahl danach erhalten", async (t) => {
  const dir = await temp(t);
  assert.equal((await createGsiSettings(path.join(dir, "neu"), { defaultEnabled: true })).enabled, true);
  assert.equal((await createGsiSettings(path.join(dir, "dota"))).enabled, false, "Dota 2 bleibt aus");

  const old = path.join(dir, "alt");
  await createGsiSettings(old);
  await writeFile(path.join(old, "gsi.json"), JSON.stringify({ version: 1, enabled: false, token, features: { map: false } }));
  const migrated = await createGsiSettings(old, { defaultEnabled: true });
  assert.equal(migrated.enabled, true);
  assert.equal(migrated.token, token, "Token bleibt, CS2 muss nicht neu gestartet werden");
  assert.equal(migrated.feature("map"), false, "selbst abgeschaltete Funktion bleibt aus");
  assert.equal(migrated.feature("bombLive"), true);
  assert.equal(JSON.parse(await readFile(path.join(old, "gsi.json"), "utf8")).defaults, DEFAULTS_VERSION);

  await migrated.setEnabled(false);
  assert.equal((await createGsiSettings(old, { defaultEnabled: true })).enabled, false, "bewusst ausgeschaltet bleibt aus");

  await migrated.resetDefaults();
  const reset = await createGsiSettings(old, { defaultEnabled: true });
  assert.equal(reset.enabled, true);
  assert.equal(reset.feature("map"), true);
});

test("Auto-Highlights: neu an, alte Datei einmal eingeschaltet, Ausschalten bleibt", async (t) => {
  const dir = await temp(t);
  assert.equal((await createAutoHighlights({ dir: path.join(dir, "neu"), defaultEnabled: true })).enabled, true);
  assert.equal((await createAutoHighlights({ dir: path.join(dir, "ohne") })).enabled, false, "ohne CS2-Paket aus");
  const old = path.join(dir, "alt");
  await createAutoHighlights({ dir: old });
  await writeFile(path.join(old, "auto-highlights.json"), JSON.stringify({ version: 1, enabled: false }));
  const auto = await createAutoHighlights({ dir: old, defaultEnabled: true });
  assert.equal(auto.enabled, true);
  await auto.setEnabled(false);
  assert.equal((await createAutoHighlights({ dir: old, defaultEnabled: true })).enabled, false);
});

test("Chat-Übersetzer: neu an mit Sprechblase, Overlay bleibt bis zum Hinweis aus", async (t) => {
  const dir = await temp(t);
  const fresh = await createChatTranslator({ dir: path.join(dir, "neu"), cacheDir: path.join(dir, "cache"), defaultEnabled: true });
  t.after(() => fresh.close());
  const state = fresh.state();
  assert.equal(state.enabled, true);
  assert.equal(state.bubble, true);
  assert.equal(state.overlay, false);
  assert.equal(state.window, false);

  const off = await createChatTranslator({ dir: path.join(dir, "ohne"), cacheDir: path.join(dir, "cache") });
  t.after(() => off.close());
  assert.equal(off.state().enabled, false, "ohne CS2-Paket aus");

  // Alte Datei mit Chat-Fenster: Übersetzer an, aber keine zusätzliche Sprechblase (sonst doppelt).
  const old = path.join(dir, "alt");
  await mkdir(old, { recursive: true });
  await writeFile(path.join(old, "chat-translate.json"), JSON.stringify({ enabled: false, overlay: true, window: true, accepted: 1 }));
  const migrated = await createChatTranslator({ dir: old, cacheDir: path.join(dir, "cache"), defaultEnabled: true });
  t.after(() => migrated.close());
  assert.equal(migrated.state().enabled, true);
  assert.equal(migrated.state().bubble, false);
  await migrated.setSettings({ enabled: false });
  const again = await createChatTranslator({ dir: old, cacheDir: path.join(dir, "cache"), defaultEnabled: true });
  t.after(() => again.close());
  assert.equal(again.state().enabled, false, "bewusst ausgeschaltet bleibt aus");
});
