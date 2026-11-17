import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { validateJob } from "../job.mjs";
import { createSkinSwap, skinPlan, hasSkins, SKIN_NOTICE, SKIN_NOTICE_VERSION, MAX_SKINS } from "../skin-swap.mjs";

const STEAM = "76561198000000001";
const OTHER = "76561198000000002";
const job = (skinsA, skinsB) => ({
  format: "tecmon-cs2-job",
  version: 1,
  title: "Test",
  map: "de_mirage",
  tickRate: 64,
  branding: { enabled: false },
  sequences: [
    { startTick: 1000, endTick: 1640, steamId: STEAM, playerName: "Eins", slot: 2, ...(skinsA ? { skins: skinsA } : {}) },
    { startTick: 3000, endTick: 3640, steamId: OTHER, playerName: "Zwei", slot: 4, ...(skinsB ? { skins: skinsB } : {}) },
  ],
});
const ak = { weapon: 7, paintKit: 282, wear: 0.15, seed: 661 };
const temp = () => mkdtemp(path.join(os.tmpdir(), "tecmon-skins-"));

test("Auftrag übernimmt nur geprüfte Skin-Zahlen", () => {
  const clean = validateJob(job([{ ...ak, extra: "x" }]));
  assert.deepEqual(clean.sequences[0].skins, [ak]);
  assert.equal(clean.sequences[1].skins, undefined);
  assert.equal(hasSkins(clean), true);
  assert.equal(hasSkins(validateJob(job())), false);
  const bad = [
    [{ ...ak, weapon: 42 }], // Standard-Messer nie als Ziel
    [{ weapon: 507, paintKit: 0, wear: 0, seed: 0, from: 7 }], // Quelle muss ein Messer sein
    [{ weapon: 5030, paintKit: 0, wear: 0, seed: 0 }], // Handschuhe brauchen einen Skin
    [{ weapon: 507, paintKit: 0, wear: 0, seed: 0 }, { weapon: 515, paintKit: 0, wear: 0, seed: 0 }], // nur ein Messer
    [{ ...ak, from: 42 }], // from nur bei Messern
    [{ ...ak, weapon: "7" }],
    [{ ...ak, paintKit: 0 }],
    [{ ...ak, paintKit: 1.5 }],
    [{ ...ak, wear: 1.2 }],
    [{ ...ak, wear: Number.NaN }],
    [{ ...ak, seed: 1001 }],
    [ak, ak], // gleiche Waffe doppelt
    Array.from({ length: MAX_SKINS + 1 }, (_, i) => ({ ...ak, weapon: [1, 4, 7, 9, 16][i] })),
    "ak",
  ];
  for (const skins of bad) assert.throws(() => validateJob(job(skins)), /Ungültiger TecMon-Auftrag/);
});

test("Skin-Plan behält SteamID64 als Text und übergibt nur Zahlen", () => {
  const clean = validateJob(job([ak, { weapon: 9, paintKit: 344, wear: 0, seed: 0 }], [{ weapon: 61, paintKit: 504, wear: 0.3, seed: 1 }]));
  const plan = skinPlan(clean);
  assert.deepEqual([...plan.keys()], [STEAM, OTHER]);
  assert.deepEqual(plan.get(STEAM), [
    { kind: "weapon", def: 7, paint_kit: 282, seed: 661, wear: 0.15 },
    { kind: "weapon", def: 9, paint_kit: 344, seed: 0, wear: 0 },
  ]);
  assert.deepEqual(plan.get(OTHER), [{ kind: "weapon", def: 61, paint_kit: 504, seed: 1, wear: 0.3 }]);
});

test("Zwei Szenen desselben Spielers dürfen einer Waffe keine verschiedenen Skins geben", () => {
  const value = job([ak]);
  value.sequences[1] = { ...value.sequences[1], steamId: STEAM, skins: [{ ...ak, paintKit: 180 }] };
  assert.throws(() => skinPlan(validateJob(value)), /zwei Szenen verschiedene Skins/);
  value.sequences[1].skins = [ak];
  assert.equal(skinPlan(validateJob(value)).get(STEAM).length, 1);
});

test("Messer und Handschuhe gelten ohne Seite für T und CT (skin-swap-v2)", () => {
  const knife = { weapon: 507, paintKit: 0, wear: 0, seed: 0, from: 515 };
  const glove = { weapon: 5030, paintKit: 10018, wear: 0.2, seed: 7 };
  const clean = validateJob(job([ak, knife, glove]));
  assert.deepEqual(clean.sequences[0].skins, [ak, knife, glove]);
  const items = skinPlan(clean).get(STEAM);
  assert.deepEqual(
    items.filter((i) => i.kind === "knife").map((i) => [i.def, i.side, i.paint_kit]),
    [[507, "t", 0], [507, "ct", 0]],
  );
  assert.deepEqual(items.filter((i) => i.kind === "glove").map((i) => i.side), ["t", "ct"]);
  // `from` geht nicht an den Rewriter: er ersetzt jedes Messer des Spielers.
  assert.ok(items.every((i) => !("from" in i)));
  const value = job([knife]);
  value.sequences[1] = { ...value.sequences[1], steamId: STEAM, skins: [{ ...knife, weapon: 515 }] };
  assert.throws(() => skinPlan(validateJob(value)), /verschiedene Messer/);
});

test("Alte Skins bekommen das alte Waffenmodell (skin-legacy-v1)", () => {
  const lore = { weapon: 9, paintKit: 344, wear: 0.01, seed: 0, legacy: 1 };
  const modern = { ...ak, legacy: 0 };
  const items = skinPlan(validateJob(job([lore, modern]))).get(STEAM);
  assert.equal(items.find((i) => i.def === 9).legacy, 1);
  assert.equal(items.find((i) => i.def === 7).legacy, 0);
  // Ohne Angabe kein Eingriff ins Modell
  assert.equal(skinPlan(validateJob(job([ak]))).get(STEAM)[0].legacy, undefined);
  assert.throws(() => validateJob(job([{ ...lore, legacy: 2 }])));
  assert.throws(() => validateJob(job([{ weapon: 507, paintKit: 0, wear: 0, seed: 0, legacy: 1 }])));
});

test("Messer und Handschuhe je Seite (skin-side-v1)", () => {
  const tKnife = { weapon: 507, paintKit: 0, wear: 0, seed: 0, side: "t" };
  const ctKnife = { weapon: 515, paintKit: 38, wear: 0.01, seed: 3, side: "ct" };
  const tGlove = { weapon: 5030, paintKit: 10018, wear: 0.2, seed: 7, side: "t" };
  const value = job([tKnife, tGlove]);
  value.sequences[1] = { ...value.sequences[1], steamId: STEAM, skins: [ctKnife] };
  const clean = validateJob(value);
  assert.equal(clean.sequences[1].skins[0].side, "ct");
  const items = skinPlan(clean).get(STEAM);
  assert.deepEqual(
    items.map((i) => [i.kind, i.side, i.def]),
    [["knife", "t", 507], ["glove", "t", 5030], ["knife", "ct", 515]],
  );
  // Seite nur bei Messer/Handschuh und nur t/ct
  assert.throws(() => validateJob(job([{ ...ak, side: "t" }])));
  assert.throws(() => validateJob(job([{ ...tKnife, side: "x" }])));
  // Messer ohne Seite gilt für beide: Widerspruch zu einem anderen T-Messer
  const clash = job([{ ...tKnife, side: undefined }]);
  delete clash.sequences[0].skins[0].side;
  clash.sequences[1] = { ...clash.sequences[1], steamId: STEAM, skins: [{ ...ctKnife, side: "t" }] };
  assert.throws(() => skinPlan(validateJob(clash)), /verschiedene Messer für T/);
});

test("Skin-Tausch ist standardmäßig aus, braucht den bestätigten Hinweis und lädt nichts nach", async () => {
  const dir = await temp();
  const swap = await createSkinSwap({ dir });
  assert.equal(swap.enabled, false);
  assert.equal(swap.state().needsNotice, true);
  assert.equal(swap.state().notice, SKIN_NOTICE);
  assert.doesNotMatch(SKIN_NOTICE, /nskinz/i);
  assert.equal(swap.state().credit, undefined);
  await assert.rejects(swap.set(true), /Hinweis/);
  assert.equal(existsSync(path.join(dir, "skin-swap.json")), false);
  assert.equal((await swap.set(true, SKIN_NOTICE_VERSION)).enabled, true);
  // Einstellung bleibt nach Neustart erhalten.
  const again = await createSkinSwap({ dir });
  assert.equal(again.enabled, true);
  assert.equal(again.state().needsNotice, false);
  await again.set(false);
  assert.equal((await createSkinSwap({ dir })).enabled, false);
});
