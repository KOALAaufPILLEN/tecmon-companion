import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanDesktopSettings, createDesktopSettings, DESKTOP_DEFAULTS, TUTORIAL_VERSION } from "../desktop-settings.mjs";

test("Desktop-Einstellungen: Standard ist 3D, Umherfliegen an, Autostart aus", () => {
  assert.deepEqual(cleanDesktopSettings(null), { quality: "high", motion: "chill", gameEconomy: true, wander: true, animate: true, foreground: true, autostart: false, chatPos: null, ui: "advanced", tutorial: TUTORIAL_VERSION, bubblePlacement: "both", menuKey: "none", menuModifier: "none" });
});

test("Popup-Taste und Anzeigeorte validieren und Neustarts überstehen",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"tecmon-popup-")),settings=await createDesktopSettings(dir);
  await settings.set({menuKey:"M",menuModifier:"Control",bubblePlacement:"pet"});
  const saved=(await createDesktopSettings(dir)).get();
  assert.equal(saved.menuKey,"M");assert.equal(saved.menuModifier,"Control");assert.equal(saved.bubblePlacement,"pet");
  const invalid=cleanDesktopSettings({menuKey:"A+B;quit",menuModifier:"Control+Alt",bubblePlacement:"all"},saved);
  assert.deepEqual(invalid,saved);
  assert.equal(cleanDesktopSettings({menuKey:"F8",menuModifier:"none"},saved).menuKey,"F8");
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

test("Chat-Overlay-Position: nur ganze Zahlen, null setzt zurück, andere Werte bleiben", () => {
  const placed = cleanDesktopSettings({ chatPos: { x: -1700, y: 1060 } });
  assert.deepEqual(placed.chatPos, { x: -1700, y: 1060 });
  assert.deepEqual(cleanDesktopSettings({ chatPos: { x: 1.5, y: 2 } }, placed).chatPos, { x: -1700, y: 1060 });
  assert.deepEqual(cleanDesktopSettings({ chatPos: { x: 1e9, y: 0 } }, placed).chatPos, { x: -1700, y: 1060 });
  assert.deepEqual(cleanDesktopSettings({ chatPos: "unten" }, placed).chatPos, { x: -1700, y: 1060 });
  assert.deepEqual(cleanDesktopSettings({ wander: false }, placed).chatPos, { x: -1700, y: 1060 });
  assert.equal(cleanDesktopSettings({ chatPos: null }, placed).chatPos, null);
});

test("Ansicht und Tutorial: ältere Einstellungen bleiben „Erweitert“ ohne Tutorial, Setup setzt beides", () => {
  // Ältere desktop.json ohne Felder: alles sichtbar wie bisher, kein Tutorial ungefragt.
  const old = cleanDesktopSettings({ quality: "low", wander: false });
  assert.equal(old.ui, "advanced");
  assert.equal(old.tutorial, TUTORIAL_VERSION);
  const fresh = cleanDesktopSettings({ ui: "simple", tutorial: 0 }, old);
  assert.equal(fresh.ui, "simple");
  assert.equal(fresh.tutorial, 0);
  assert.equal(fresh.quality, "low");
  // Unbekannte Werte ändern nichts.
  assert.equal(cleanDesktopSettings({ ui: "profi", tutorial: 99 }, fresh).ui, "simple");
  assert.equal(cleanDesktopSettings({ tutorial: -1 }, fresh).tutorial, 0);
  assert.equal(cleanDesktopSettings({ tutorial: "1" }, fresh).tutorial, 0);
  assert.equal(cleanDesktopSettings({ tutorial: TUTORIAL_VERSION }, fresh).tutorial, TUTORIAL_VERSION);
  // Die Figur schickt nur ihre eigenen Schalter: Ansicht bleibt erhalten.
  assert.equal(cleanDesktopSettings({ wander: true, quality: "high" }, fresh).ui, "simple");
});

test("Bewegungsmodi migrieren den alten Flugschalter und bleiben mit Sparmodus erhalten", async () => {
  assert.equal(cleanDesktopSettings({ wander: false }).motion, "still");
  assert.equal(cleanDesktopSettings({ wander: true }).motion, "chill");
  const hyper = cleanDesktopSettings({ motion: "hyper", wander: false });
  assert.equal(hyper.motion, "hyper");
  assert.equal(hyper.wander, true);
  assert.equal(cleanDesktopSettings({ motion: "unknown" }, hyper).motion, "hyper");
  const dir = await mkdtemp(path.join(tmpdir(), "tecmon-motion-"));
  const settings = await createDesktopSettings(dir);
  await settings.set({ motion: "hyper", gameEconomy: false });
  const again = await createDesktopSettings(dir);
  assert.equal(again.get().motion, "hyper");
  assert.equal(again.get().gameEconomy, false);
  assert.equal(again.get().quality, "high", "Sparmodus überschreibt die bevorzugte Darstellung nicht");
});
