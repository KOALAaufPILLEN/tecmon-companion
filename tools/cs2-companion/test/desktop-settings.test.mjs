import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanDesktopSettings, createDesktopSettings, DESKTOP_DEFAULTS } from "../desktop-settings.mjs";

test("Desktop-Einstellungen: Standard ist 3D, Umherfliegen an, Autostart aus", () => {
  assert.deepEqual(cleanDesktopSettings(null), { quality: "high", wander: true, animate: true, foreground: true, autostart: false });
});

test("Desktop-Einstellungen übernehmen nur bekannte Felder mit gültigen Werten", () => {
  const next = cleanDesktopSettings({ quality: "ultra", wander: "nein", autostart: true, extra: 1, animate: false }, DESKTOP_DEFAULTS);
  assert.deepEqual(next, { ...DESKTOP_DEFAULTS, autostart: true, animate: false });
  assert.equal(cleanDesktopSettings({ quality: "low" }).quality, "low");
});

test("Desktop-Einstellungen bleiben über einen Neustart erhalten", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tecmon-desktop-"));
  const first = await createDesktopSettings(dir);
  await first.set({ wander: false, quality: "low" });
  const again = await createDesktopSettings(dir);
  assert.equal(again.get().wander, false);
  assert.equal(again.get().quality, "low");
  assert.equal(JSON.parse(await readFile(path.join(dir, "desktop.json"), "utf8")).wander, false);
});

test("Kaputte desktop.json fällt auf Standardwerte zurück", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tecmon-desktop-"));
  await writeFile(path.join(dir, "desktop.json"), "{kaputt");
  assert.deepEqual((await createDesktopSettings(dir)).get(), DESKTOP_DEFAULTS);
});
