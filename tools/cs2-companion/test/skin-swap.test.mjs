import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { validateJob } from "../job.mjs";
import {
  createSkinSwap,
  rewriteRequest,
  cs2GameDir,
  DEFAULT_KNIVES,
  DEFAULT_GLOVES,
  hasSkins,
  REWRITER_SHA256,
  REWRITER_URL,
  REWRITER_REVISION,
  SKIN_NOTICE_VERSION,
  SKIN_TAG,
  MAX_SKINS,
} from "../skin-swap.mjs";

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

test("Rewriter-Anfrage behält SteamID64 als Text und markiert getauschte Waffen", () => {
  const clean = validateJob(job([ak, { weapon: 9, paintKit: 344, wear: 0, seed: 0 }], [{ weapon: 61, paintKit: 504, wear: 0.3, seed: 1 }]));
  const request = rewriteRequest(clean, "C:/d/a.dem", "C:/d/a.tecmon-skins.dem");
  assert.equal(request.schema_version, 2);
  assert.equal(request.input_dem, "C:/d/a.dem");
  assert.equal(request.output_dem, "C:/d/a.tecmon-skins.dem");
  assert.deepEqual(request.passes.map((p) => p.steam_id64), [STEAM, OTHER]);
  assert.equal(typeof request.passes[0].steam_id64, "string");
  const awp = request.passes[0].items[1];
  assert.equal(awp.definition_index, 9);
  assert.equal(awp.paint_kit, 344);
  assert.ok(awp.wear > 0, "Abnutzung 0 wird auf den kleinsten gültigen Wert gesetzt");
  assert.equal(awp.custom_name, SKIN_TAG);
  assert.equal(awp.team, "ANY");
  assert.equal(awp.replacement_definition_index, null);
});

test("Zwei Szenen desselben Spielers dürfen einer Waffe keine verschiedenen Skins geben", () => {
  const value = job([ak]);
  value.sequences[1] = { ...value.sequences[1], steamId: STEAM, skins: [{ ...ak, paintKit: 180 }] };
  assert.throws(() => rewriteRequest(validateJob(value), "a.dem", "b.dem"), /zwei Szenen verschiedene Skins/);
  value.sequences[1].skins = [ak];
  assert.equal(rewriteRequest(validateJob(value), "a.dem", "b.dem").passes[0].items.length, 1);
});

test("Messer und Handschuhe ersetzen die Standard-Gegenstände (skin-swap-v2)", () => {
  const knife = { weapon: 507, paintKit: 0, wear: 0, seed: 0, from: 515 };
  const glove = { weapon: 5030, paintKit: 10018, wear: 0.2, seed: 7 };
  const clean = validateJob(job([ak, knife, glove]));
  assert.deepEqual(clean.sequences[0].skins, [ak, knife, glove]);
  assert.throws(() => rewriteRequest(clean, "a.dem", "b.dem"), /CS2-Ordner/);
  const request = rewriteRequest(clean, "a.dem", "b.dem", "C:/cs2/game/csgo");
  assert.equal(request.cs2_game_dir, "C:/cs2/game/csgo");
  const items = request.passes[0].items;
  const knives = items.filter((i) => i.replacement_definition_index === 507);
  assert.deepEqual(knives.map((i) => i.definition_index), [...DEFAULT_KNIVES, 515]);
  const gloves = items.filter((i) => i.replacement_definition_index === 5030);
  assert.deepEqual(gloves.map((i) => i.definition_index), DEFAULT_GLOVES);
  assert.ok(gloves.every((i) => i.paint_kit === 10018 && i.quality === 3 && i.custom_name === SKIN_TAG));
  assert.equal(items.find((i) => i.definition_index === 7).replacement_definition_index, null);
  // Ohne Messer kein Spielordner in der Anfrage
  assert.equal(rewriteRequest(validateJob(job([glove])), "a.dem", "b.dem").cs2_game_dir, undefined);
  const value = job([knife]);
  value.sequences[1] = { ...value.sequences[1], steamId: STEAM, skins: [{ ...knife, weapon: 515 }] };
  assert.throws(() => rewriteRequest(validateJob(value), "a.dem", "b.dem", "x"), /verschiedene Messer/);
  // Gleiches Messer wie in der Demo, nur neue Lackierung: das eigene Messer muss mit in die Liste.
  const own = rewriteRequest(validateJob(job([{ ...knife, weapon: 515, paintKit: 38 }])), "a.dem", "b.dem", "x");
  assert.deepEqual(own.passes[0].items.map((i) => i.definition_index), [...DEFAULT_KNIVES, 515]);
  assert.equal(cs2GameDir(""), "");
  assert.match(cs2GameDir(path.join("C:", "cs2", "game", "bin", "win64", "cs2.exe")), /game[\\/]csgo$/);
});

const body = (bytes) => ({ ok: true, body: [bytes] });

test("Skin-Tausch ist standardmäßig aus und braucht den bestätigten Hinweis", async () => {
  const dir = await temp();
  let downloads = 0;
  const swap = await createSkinSwap({ dir, cacheDir: dir, request: async () => (downloads++, body(Buffer.from("x"))) });
  assert.equal(swap.enabled, false);
  assert.equal(swap.state().needsNotice, true);
  assert.equal(swap.state().credit.author, "Lyan-edit");
  await assert.rejects(swap.set(true), /Hinweis/);
  assert.equal(downloads, 0);
  await assert.rejects(swap.rewrite(validateJob(job([ak])), path.join(dir, "a.dem")), /ausgeschaltet/);
});

test("Download vom festen Commit mit falscher Prüfsumme wird abgelehnt", async () => {
  const dir = await temp();
  let url = "";
  const swap = await createSkinSwap({
    dir,
    cacheDir: dir,
    request: async (u) => ((url = u), body(Buffer.from("MZ falsch"))),
  });
  await assert.rejects(swap.set(true, SKIN_NOTICE_VERSION), /Prüfsumme/);
  assert.equal(url, REWRITER_URL);
  assert.ok(url.includes(REWRITER_REVISION));
  assert.equal(swap.enabled, false);
  assert.equal(existsSync(path.join(dir, "skin-swap.json")), false);
});

test("Eingeschaltet: Demo-Kopie umschreiben, Hilfsdateien löschen, Ausschalten entfernt das Programm", async () => {
  const dir = await temp();
  const exe = Buffer.from("geprüftes Programm");
  const expected = createHash("sha256").update(exe).digest("hex");
  const demo = path.join(dir, "match.dem");
  await writeFile(demo, "PBDEMS2\0original");
  const calls = [];
  let answer = { ok: true, matched_player_count: 1, weapon_count: 1 };
  const swap = await createSkinSwap({
    dir,
    cacheDir: path.join(dir, "cache"),
    expected,
    request: async () => body(exe),
    run: async (program, args) => {
      calls.push(args);
      const request = JSON.parse(await readFile(args[1], "utf8"));
      await writeFile(request.output_dem, "PBDEMS2\0kopie");
      await writeFile(args[3], JSON.stringify(answer));
    },
  });
  assert.equal((await swap.set(true, SKIN_NOTICE_VERSION)).enabled, true);
  const logs = [];
  const copy = await swap.rewrite(validateJob(job([ak])), demo, (m) => logs.push(m));
  assert.equal(copy, path.join(dir, "match.tecmon-skins.dem"));
  assert.equal(calls[0][0], "--request");
  assert.equal(await readFile(demo, "utf8"), "PBDEMS2\0original");
  assert.ok(logs.some((m) => m.includes("Lyan-edit")));
  assert.deepEqual((await readdir(dir)).sort(), ["cache", "match.dem", "match.tecmon-skins.dem", "skin-swap.json"]);
  await swap.cleanup(copy);
  await swap.cleanup(demo); // Original wird nie gelöscht
  assert.ok(existsSync(demo));
  assert.equal(existsSync(copy), false);

  answer = { ok: false, error: "unsupported request schema 9" };
  await assert.rejects(swap.rewrite(validateJob(job([ak])), demo), /unsupported request schema 9/);
  assert.equal(existsSync(copy), false);

  // Einstellung bleibt nach Neustart erhalten.
  const again = await createSkinSwap({ dir, cacheDir: path.join(dir, "cache"), expected, request: async () => body(exe) });
  assert.equal(again.enabled, true);
  assert.equal(again.state().needsNotice, false);
  await again.set(false);
  assert.equal(existsSync(path.join(dir, "cache", "skin-swap")), false);
});

test("Ohne Netz lässt sich nichts einschalten", async () => {
  const dir = await temp();
  const swap = await createSkinSwap({
    dir,
    cacheDir: dir,
    request: async () => {
      throw new Error("kein Netz im Test");
    },
  });
  await assert.rejects(swap.set(true, SKIN_NOTICE_VERSION), /kein Netz/);
  assert.equal(swap.enabled, false);
});

test("Die feste Prüfsumme gehört zum veröffentlichten Rewriter", () => {
  assert.match(REWRITER_SHA256, /^[0-9a-f]{64}$/);
  assert.match(REWRITER_REVISION, /^[0-9a-f]{40}$/);
});
