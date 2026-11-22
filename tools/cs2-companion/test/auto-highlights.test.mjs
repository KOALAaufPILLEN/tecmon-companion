import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { createAutoHighlights, QUIET_MS, MENU_MS, RECHECK_MS, GAME_EXES, AUTO_CAPABILITY } from "../auto-highlights.mjs";
import { matchList, downloadLatestDemo, BOILER } from "../valve-download.mjs";

const STEAM = "76561198000000001";
const temp = () => mkdtemp(path.join(os.tmpdir(), "tecmon-auto-"));
const gsi = (phase, extra = {}) => ({
  provider: { steamid: STEAM },
  map: { name: "de_mirage", mode: "competitive", phase, ...extra },
  player: { steamid: STEAM, team: "CT" },
});

test("fragt nach Matchende im Hauptmenü und lädt erst, wenn CS2 zu ist", async () => {
  const dir = await temp();
  let time = 1_000_000;
  let running = true;
  const checks = [];
  const opened = [];
  const auto = await createAutoHighlights({
    dir,
    now: () => time,
    isRunning: async (exe) => (checks.push(exe), running),
    openPage: (id) => opened.push(id),
    fetchLatest: async ({ directory, after }) => {
      assert.ok(after < 1_000_000);
      await mkdir(directory, { recursive: true });
      const demo = path.join(directory, "match730_1.dem");
      await writeFile(demo, "PBDEMS2\0x");
      return { demo, matchId: "1", time };
    },
  });
  assert.equal(AUTO_CAPABILITY, "auto-highlights-v1");
  assert.equal(GAME_EXES.cs2, "cs2.exe");
  const menu = { provider: { steamid: STEAM }, player: { steamid: STEAM, activity: "menu" } };
  // Standardmäßig aus: nichts merken, nichts fragen.
  auto.observe(gsi("gameover"));
  auto.observe(menu);
  time += QUIET_MS * 2;
  await auto.tick();
  assert.equal(auto.state().offer, null);

  await auto.setEnabled(true);
  assert.equal(JSON.parse(await readFile(path.join(dir, "auto-highlights.json"), "utf8")).enabled, true);
  assert.equal(auto.state().gsiAgo, null);
  // Casual hat keine Valve-Demo; die Seite zeigt das an.
  auto.observe(gsi("gameover", { mode: "casual" }));
  assert.deepEqual(auto.state().seen, { map: "de_mirage", mode: "casual", phase: "gameover", demo: false });
  assert.equal(auto.state().gsiAgo, 0);
  auto.observe(menu);
  time += MENU_MS * 2;
  auto.observe(menu);
  await auto.tick();
  assert.equal(auto.state().offer, null);

  // Mitten im Match verlassen: keine Frage.
  auto.observe(gsi("live"));
  auto.observe(menu);
  time += MENU_MS * 2;
  auto.observe(menu);
  await auto.tick();
  assert.equal(auto.state().offer, null, "nicht fertig gespielt: keine Frage");

  auto.observe(gsi("live"));
  auto.observe(gsi("gameover"));
  time += 30_000;
  auto.observe(gsi("gameover"));
  await auto.tick();
  assert.equal(auto.state().offer, null, "Endbildschirm: noch nicht fragen");
  auto.observe(menu);
  time += 3000;
  auto.observe(menu);
  await auto.tick();
  assert.equal(auto.state().offer, null, "gerade erst im Menü");
  time += MENU_MS;
  auto.observe(menu);
  await auto.tick();
  const offer = auto.state().offer;
  assert.equal(offer.map, "de_mirage", "zurück im Hauptmenü: fragen, CS2 läuft noch");
  assert.deepEqual(checks, [], "zum Fragen wird die Exe nicht gebraucht");
  await assert.rejects(auto.answer("falsch", true, dir), /nicht mehr aktuell/);

  // Ja bei offenem CS2: warten, bis die Exe beendet ist.
  const result = await auto.answer(offer.id, true, path.join(dir, "Auto"));
  assert.match(result.message, /Sobald du CS2 schließt/);
  assert.equal(auto.state().run.status, "waiting");
  await auto.tick();
  assert.equal(auto.state().run.status, "waiting");
  const before = checks.length;
  time += 1000;
  await auto.tick();
  assert.equal(checks.length, before, "nicht ständig nachsehen");
  running = false;
  time += RECHECK_MS;
  await auto.tick();
  // Der Download läuft asynchron; langsame Windows-Runner brauchen dafür mehr als 250 ms.
  for (let i = 0; i < 500 && auto.state().run.status !== "ready"; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(auto.state().run.status, "ready");
  assert.deepEqual(opened, [offer.id]);
  const ready = auto.ready(offer.id);
  assert.equal(ready.steamId, STEAM);
  assert.ok(!JSON.stringify(ready).includes(dir), "keine lokalen Pfade an die Webseite");
  assert.equal(auto.ready("x"), null);
  const demo = auto.consume(offer.id);
  assert.match(demo, /match730_1\.dem$/);
  assert.equal(auto.demoPath(offer.id), "", "nur einmal verwendbar");
  assert.throws(() => auto.consume(offer.id));

  // CS2 direkt geschlossen (keine Daten mehr): fragen; Nein = keine Demo, keine Seite.
  auto.observe(gsi("gameover"));
  time += QUIET_MS;
  await auto.tick();
  const second = auto.state().offer;
  assert.ok(second);
  assert.match((await auto.answer(second.id, false, dir)).message, /kein Video/);
  assert.equal(opened.length, 1);
  await auto.setEnabled(false);
  await rm(dir, { recursive: true, force: true });
});

test("Fehler beim Laden der Demo landet im Status", async () => {
  const dir = await temp();
  let time = 5_000_000;
  const auto = await createAutoHighlights({
    dir,
    now: () => time,
    fetchLatest: async () => {
      throw new Error("Steam läuft nicht. Steam starten und anmelden.");
    },
  });
  await auto.setEnabled(true);
  auto.observe(gsi("gameover"));
  time += QUIET_MS * 2;
  await auto.tick();
  await auto.answer(auto.state().offer.id, true, dir);
  for (let i = 0; i < 50 && auto.state().run.status === "downloading"; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(auto.state().run.status, "error");
  assert.match(auto.state().run.error, /Steam/);
  await rm(dir, { recursive: true, force: true });
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
const LINK = (id) => `http://replay183.valve.net/730/00${id}_1234567890.dem.bz2`;
const info = (id, time, link = LINK(id)) =>
  field(4, Buffer.concat([
    varint(1 << 3), varint(BigInt(id)),
    varint(2 << 3), varint(time),
    field(5, field(3, Buffer.from(link))),
  ]));
const BZ2 = Buffer.from("QlpoOTFBWSZTWVUUOFIAAANOiMAAEAAWAkgAAEAAAIAIIAAhJE0ZpCAaaaIu6755qQ9AF8XckU4UJBVFDhSA", "base64");
const response = (body) => ({
  ok: true,
  status: 200,
  body: (async function* () {
    yield body;
  })(),
});

test("letztes Match ohne Sharecode über Steam laden", async () => {
  const list = Buffer.concat([info("3230642215713767580", 1_700_000_000), info("3230642215713767999", 1_700_005_000)]);
  assert.deepEqual(matchList(list).map((m) => [m.matchId, m.time]), [
    ["3230642215713767580", 1_700_000_000],
    ["3230642215713767999", 1_700_005_000],
  ]);
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
      await writeFile(a[0], list);
      return 0;
    },
    request: async (url) => {
      assert.equal(url, LINK("3230642215713767999"), "das neueste Match");
      return response(BZ2);
    },
  };
  const result = await downloadLatestDemo({ directory: path.join(dir, "dl"), cacheDir: cache, after: 1_699_000_000_000, system });
  assert.equal(args.length, 1, "boiler-writter ohne Match-Angaben = letzte Matches");
  assert.equal(result.matchId, "3230642215713767999");
  assert.equal((await readFile(result.demo)).subarray(0, 8).toString(), "PBDEMS2\0");
  assert.deepEqual(await readdir(path.dirname(result.demo)), [path.basename(result.demo)]);
  await assert.rejects(
    downloadLatestDemo({ directory: path.join(dir, "dl2"), cacheDir: cache, after: 1_800_000_000_000, system }),
    /noch keine Demo/,
  );
  await assert.rejects(
    downloadLatestDemo({ directory: path.join(dir, "dl3"), cacheDir: cache, system: { ...system, isRunning: async () => true } }),
    /CS2 schließen/,
  );
  await rm(dir, { recursive: true, force: true });
});
