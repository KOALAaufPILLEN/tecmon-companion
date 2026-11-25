import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createStatsBacklog, CLOSE_DELAY_MS, POLL_MS, BACKLOG_CAPABILITY } from "../stats-backlog.mjs";
import { matchList, decodeShareCode } from "../valve-download.mjs";
import { encodeShareCode } from "../share-code.mjs";

const varint = (value) => {
  let v = BigInt(value);
  const out = [];
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return Buffer.from(out);
};
const field = (number, bytes) => Buffer.concat([varint((number << 3) | 2), varint(bytes.length), bytes]);
const LINK = "http://replay183.valve.net/730/003230642215713767580_1234567890.dem.bz2";

test("Sharecode aus Match-Infos: Match-ID, Reservierung und TV-Port, ohne Rundung", () => {
  const code = "CSGO-SZ3aW-WVPiy-6CLVO-5bVxy-zHJrP";
  const info = decodeShareCode(code);
  assert.equal(encodeShareCode({ matchId: info.matchId, outcomeId: info.outcomeId, tvPort: info.tvPort }), code);
  const buf = field(4, Buffer.concat([
    varint(1 << 3), varint(3230642215713767580n),
    varint(2 << 3), varint(1_700_000_000),
    field(3, Buffer.concat([varint(2 << 3), varint(27015), field(10, Buffer.from("de_mirage"))])),
    field(5, Buffer.concat([varint(1 << 3), varint(3230642215713768001n), field(3, Buffer.from(LINK))])),
  ]));
  const [m] = matchList(buf);
  assert.equal(m.matchId, "3230642215713767580");
  assert.equal(m.link, LINK);
  assert.equal(m.map, "de_mirage");
  const back = decodeShareCode(m.shareCode);
  assert.deepEqual(back, { matchId: "3230642215713767580", outcomeId: "3230642215713768001", tvPort: "27015" });
});

test("ohne TV-Port oder Reservierung kein erfundener Sharecode", () => {
  const buf = field(4, Buffer.concat([varint(1 << 3), varint(1n), field(5, field(3, Buffer.from(LINK)))]));
  assert.equal(matchList(buf)[0].shareCode, "");
});

async function setup(overrides = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-backlog-"));
  let t = 1_800_000_000_000;
  let running = true;
  let calls = 0;
  const opened = [];
  const backlog = await createStatsBacklog({
    dir,
    now: () => t,
    isRunning: async (exe) => exe === "cs2.exe" && running,
    listMatches: async () => {
      calls++;
      return [
        { matchId: "3230642215713767580", time: t / 1000 - 3600, link: LINK, shareCode: "", map: "de_mirage" },
        { matchId: "3230642215713767581", time: t / 1000 - 7200, link: LINK },
        { matchId: "999", time: t / 1000 - 90 * 86400, link: LINK },
        { matchId: "abc", time: 1, link: LINK },
      ];
    },
    openPage: () => opened.push(true),
    ...overrides,
  });
  return {
    dir,
    backlog,
    opened,
    get calls() { return calls; },
    advance: (ms) => (t += ms),
    setRunning: (v) => (running = v),
  };
}

test(`${BACKLOG_CAPABILITY}: fragt erst nach dem Schließen von CS2, mit offenen Matches`, async () => {
  const s = await setup();
  await s.backlog.tick();
  assert.equal(s.backlog.state().offer, null, "CS2 läuft: keine Frage, keine Steam-Abfrage");
  assert.equal(s.calls, 0);
  s.setRunning(false);
  s.advance(POLL_MS);
  await s.backlog.tick();
  assert.equal(s.backlog.state().offer, null, "kurz warten, bis Steam den Coordinator freigibt");
  s.advance(CLOSE_DELAY_MS);
  await s.backlog.tick();
  const offer = s.backlog.state().offer;
  assert.equal(offer.count, 2, "zu alte und ungültige Matches fallen weg");
  const list = s.backlog.list();
  assert.deepEqual(list.matches.map((m) => m.matchId), ["3230642215713767580", "3230642215713767581"]);
  assert.equal(list.matches[0].time, 1_800_000_000_000 + POLL_MS + CLOSE_DELAY_MS - 3_600_000, "Zeit in ms");
  const answer = await s.backlog.answer(offer.id, true);
  assert.match(answer.message, /2 Matches/);
  assert.equal(s.opened.length, 1);
  await assert.rejects(s.backlog.answer(offer.id, true), /nicht mehr aktuell/);
  await rm(s.dir, { recursive: true, force: true });
});

test("erledigte Matches werden nicht mehr angeboten und bleiben gespeichert", async () => {
  const s = await setup();
  s.setRunning(false);
  await s.backlog.refresh({ force: true });
  await s.backlog.markDone(["3230642215713767580", "3230642215713767581"]);
  assert.equal(s.backlog.state().open, 0);
  await assert.rejects(s.backlog.markDone(["12; rm"]), /Ungültige/);
  await assert.rejects(s.backlog.markDone(new Array(51).fill("1")), /Ungültige/);
  const saved = JSON.parse(await readFile(path.join(s.dir, "stats-backlog.json"), "utf8"));
  assert.deepEqual(saved.done.sort(), ["3230642215713767580", "3230642215713767581"]);
  // CS2 auf und zu: alles erledigt, also keine Frage.
  s.setRunning(true);
  s.advance(POLL_MS);
  await s.backlog.tick();
  s.setRunning(false);
  s.advance(POLL_MS);
  await s.backlog.tick();
  s.advance(CLOSE_DELAY_MS + 60_000);
  await s.backlog.tick();
  assert.equal(s.backlog.state().offer, null);
  await rm(s.dir, { recursive: true, force: true });
});

test("abschaltbar, gedrosselt und nicht bei laufendem CS2 oder Aufnahme", async () => {
  let busy = false;
  const s = await setup({ busy: () => busy });
  await assert.rejects(s.backlog.refresh({ force: true }), /CS2 schließen/);
  s.setRunning(false);
  busy = true;
  await assert.rejects(s.backlog.refresh({ force: true }), /Aufnahme/);
  busy = false;
  await s.backlog.refresh({ force: true });
  await s.backlog.refresh();
  await s.backlog.refresh({ force: true });
  assert.equal(s.calls, 1, "boiler-writter nicht bei jedem Klick");
  await s.backlog.setAsk(false);
  s.setRunning(true);
  await s.backlog.tick();
  s.setRunning(false);
  s.advance(POLL_MS + CLOSE_DELAY_MS);
  await s.backlog.tick();
  s.advance(POLL_MS);
  await s.backlog.tick();
  assert.equal(s.backlog.state().offer, null, "ausgeschaltet: keine Frage");
  const reopened = await createStatsBacklog({ dir: s.dir, listMatches: async () => [] });
  assert.equal(reopened.ask, false, "Einstellung bleibt gespeichert");
  await reopened.reset();
  const fresh = await createStatsBacklog({ dir: s.dir, listMatches: async () => [] });
  assert.equal(fresh.ask, true);
  assert.equal(fresh.list().matches.length, 0);
  await rm(s.dir, { recursive: true, force: true });
});

test("Bridge: Match-Liste, erledigt melden und Frage beim Schließen von CS2", async (t) => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { once } = await import("node:events");
  const { createCompanion } = await import("../server.mjs");
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-backlog-server-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const cs2Exe = path.join(dir, "cs2", "game", "bin", "win64", "cs2.exe");
  await mkdir(path.dirname(cs2Exe), { recursive: true });
  await writeFile(cs2Exe, "");
  await mkdir(path.join(dir, "cs2", "game", "csgo", "cfg"), { recursive: true });
  const installation = {
    dataDir: path.join(dir, "data"),
    profileDir: path.join(dir, "private", "profile"),
    hlaeExe: path.join(dir, "hlae.exe"),
    ffmpegExe: path.join(dir, "ffmpeg.exe"),
    cs2Exe,
  };
  await mkdir(installation.profileDir, { recursive: true });
  let cs2 = true;
  let clock = Date.now();
  const opened = [];
  const { server, token } = await createCompanion({
    verifyGame: async (file) => ({ ok: true, reason: "", path: file }),
    installation,
    detectTools: async () => ({ cs2: cs2Exe }),
    now: () => clock,
    engineSystem: {
      auto: { every: 5, isRunning: async () => false },
      download: { isRunning: async () => false },
      backlog: {
        isRunning: async (image) => image === "cs2.exe" && cs2,
        openPage: (page) => opened.push(page),
        listMatches: async () => [{ matchId: "3230642215713767580", time: Math.round(clock / 1000) - 600, link: LINK }],
      },
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const origin = "https://tecmon.online";
  let grant = "";
  const post = (route, body) =>
    fetch(base + route, {
      method: "POST",
      headers: { Origin: origin, "content-type": "application/json", "x-tecmon-bridge-token": grant },
      body: JSON.stringify(body),
    });
  const local = (route, body) =>
    fetch(base + route, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-tecmon-token": token, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const pending = await (await post("/bridge/pair", {})).json();
  const state = await (await local("/api/state")).json();
  await local("/api/bridge/approve", { id: state.bridge.pending[0].id });
  grant = (await (await post("/bridge/pair/poll", { request: pending.request })).json()).token;
  const headers = { Origin: origin, "x-tecmon-bridge-token": grant };

  const caps = (await (await fetch(base + "/bridge/state", { headers })).json()).capabilities;
  assert.ok(caps.includes(BACKLOG_CAPABILITY));
  assert.equal((await fetch(base + "/bridge/matches", { headers: { Origin: origin } })).status, 401, "nur mit Bridge-Token");
  const refused = await post("/bridge/matches/refresh", {});
  assert.match((await refused.json()).error, /CS2 schließen/);

  // CS2 wird geschlossen: nach kurzer Wartezeit holt TecMon die Liste und fragt.
  await new Promise((r) => setTimeout(r, 30));
  cs2 = false;
  let offer = null;
  for (let i = 0; i < 300 && !offer; i++) {
    clock += 5_000;
    offer = (await (await local("/api/state")).json()).backlog?.offer;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.ok(offer, "Stats hochladen?");
  assert.equal(offer.count, 1);
  const list = await (await fetch(base + "/bridge/matches", { headers })).json();
  assert.deepEqual(list.matches.map((m) => [m.matchId, m.link, m.done]), [["3230642215713767580", LINK, false]]);
  assert.equal(JSON.stringify(list).includes(dir), false, "keine Pfade");
  assert.equal((await local("/api/backlog/answer", { id: offer.id, yes: true })).status, 200);
  assert.deepEqual(opened, [`${origin}/games/cs2/replay?companion-stats=1#replay-stats`]);
  assert.equal((await post("/bridge/matches/done", { matchIds: ["3230642215713767580"] })).status, 200);
  assert.equal((await (await local("/api/state")).json()).backlog.open, 0);
  assert.equal((await post("/bridge/matches/done", { matchIds: ["x"] })).status >= 400, true);
  assert.equal((await local("/api/backlog/settings", { ask: false })).status, 200);
  assert.equal((await (await local("/api/state")).json()).backlog.ask, false);
});

test("Jetzt auswerten öffnet die Seite nur mit offenen Matches", async () => {
  const s = await setup();
  await assert.rejects(s.backlog.openNow(), /Keine offenen Matches/);
  s.setRunning(false);
  await s.backlog.refresh({ force: true });
  const result = await s.backlog.openNow();
  assert.equal(s.opened.length, 1);
  assert.match(result.message, /tecmon\.online/);
});
