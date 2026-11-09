import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import { createGameTips, nextLossBonus, roundKind } from "../game-tips.mjs";
import { cleanInsights, createInsightsStore } from "../insights.mjs";
import { gsiConfigText, gsiConfigPath } from "../gsi-config.mjs";
import { createCompanion } from "../server.mjs";

const ME = "76561198000000001";
const MATE = "76561198000000002";

function frame({
  round = 3,
  roundPhase = "freezetime",
  mapPhase = "live",
  mode = "competitive",
  name = "de_mirage",
  steamid = ME,
  team = "T",
  state = {},
  weapons = {},
  stats = {},
  map = {},
} = {}) {
  return {
    provider: { steamid: ME, timestamp: 1 },
    map: {
      mode,
      name,
      phase: mapPhase,
      round,
      team_ct: { score: 2 },
      team_t: { score: 1 },
      ...map,
    },
    round: { phase: roundPhase },
    player: {
      steamid,
      team,
      state: { health: 100, armor: 100, helmet: true, money: 800, equip_value: 4000, round_kills: 0, round_killhs: 0, flashed: 0, burning: 0, ...state },
      weapons,
      match_stats: { kills: 5, assists: 1, deaths: 3, mvps: 0, score: 10, ...stats },
    },
  };
}

function clock() {
  let time = 1_000_000;
  return { now: () => time, advance: (ms) => (time += ms) };
}

test("Verlustbonus und Rundenarten", () => {
  assert.equal(nextLossBonus(0), 1400);
  assert.equal(nextLossBonus(2), 2400);
  assert.equal(nextLossBonus(9), 3400);
  assert.equal(roundKind(0, 12), "pistol");
  assert.equal(roundKind(12, 12), "pistol");
  assert.equal(roundKind(11, 12), "last-of-half");
  assert.equal(roundKind(23, 12), "last-of-half");
  assert.equal(roundKind(24, 12), "overtime-start");
  assert.equal(roundKind(26, 12), "last-of-half");
  assert.equal(roundKind(5, 12), "normal");
  assert.equal(roundKind(7, 8), "last-of-half");
});

test("Wirtschaftstipp zu Beginn der Kaufzeit", () => {
  const time = clock();
  const tips = createGameTips(time);
  tips.ingest(frame({ round: 4, roundPhase: "over" }));
  time.advance(7000);
  tips.ingest(
    frame({ round: 5, state: { money: 2200 }, map: { team_t: { score: 1, consecutive_round_losses: 2 } } }),
  );
  assert.equal(tips.state().tip.category, "map", "Zur ersten Kaufzeit kommt zuerst die Map-Übersicht");
  time.advance(12000);
  tips.ingest(
    frame({ round: 5, state: { money: 2200 }, map: { team_t: { score: 1, consecutive_round_losses: 2 } } }),
  );
  const tip = tips.state().tip;
  assert.match(tip.text, /Eco empfohlen/);
  assert.match(tip.text, /4\.600 \$/);
  assert.equal(tip.category, "economy");
});

test("Kein Tipp aus Daten eines anderen Spielers oder ohne Wirtschaftsmodus", () => {
  const time = clock();
  const tips = createGameTips(time);
  tips.ingest(frame({ steamid: MATE, state: { money: 2200 } }));
  assert.equal(tips.state().tip, null);
  const casual = createGameTips(time);
  casual.ingest(frame({ mode: "deathmatch", round: 4, roundPhase: "over" }));
  casual.ingest(frame({ mode: "deathmatch", round: 5, state: { money: 2200 } }));
  assert.equal(casual.state().tip, null);
});

test("Tod mit ungeworfenen Granaten wird erst nach dem Tod gemeldet", () => {
  const time = clock();
  const tips = createGameTips(time);
  const weapons = {
    weapon_0: { name: "weapon_knife", type: "Knife", state: "holstered" },
    weapon_1: { name: "weapon_ak47", type: "Rifle", state: "active", ammo_clip: 30, ammo_clip_max: 30 },
    weapon_2: { name: "weapon_flashbang", type: "Grenade", state: "holstered", ammo_reserve: 2 },
    weapon_3: { name: "weapon_smokegrenade", type: "Grenade", state: "holstered", ammo_reserve: 1 },
  };
  tips.ingest(frame({ round: 6, roundPhase: "live", state: { money: 300 }, weapons }));
  const before = tips.state().tip?.id;
  time.advance(10000);
  tips.ingest(frame({ round: 6, roundPhase: "live", steamid: MATE }));
  const tip = tips.state().tip;
  assert.notEqual(tip?.id, before);
  assert.match(tip.text, /2 × Flash und Smoke gestorben/);
});

test("Kauf-Check kurz vor Ende der Kaufzeit: Helm und Defuse-Kit", () => {
  const time = clock();
  const tips = createGameTips(time);
  const buy = (endsIn) => ({
    ...frame({ team: "CT", round: 7, state: { money: 1500, helmet: false } }),
    phase_countdowns: { phase: "freezetime", phase_ends_in: String(endsIn) },
  });
  tips.ingest(buy(19));
  time.advance(10000);
  tips.ingest(buy(9));
  assert.notEqual(tips.state().tip?.category, "buy");
  time.advance(5000);
  tips.ingest(buy(4.5));
  const tip = tips.state().tip;
  assert.equal(tip.category, "buy");
  assert.match(tip.text, /Kein Helm/);
  assert.match(tip.text, /Defuse-Kit/);
});

test("Ab Rundenstart still: keine neuen Tipps, solange du lebst", () => {
  const time = clock();
  const tips = createGameTips(time);
  tips.ingest(frame({ round: 4, roundPhase: "over" }));
  time.advance(7000);
  tips.ingest(frame({ round: 5, state: { money: 2200 } }));
  const first = tips.state().tip.id;
  time.advance(16000);
  tips.ingest(frame({ round: 5, roundPhase: "live", state: { money: 300 } }));
  assert.equal(tips.state().quiet, true);
  time.advance(30000);
  tips.ingest(frame({ round: 5, roundPhase: "live", state: { money: 300 } }));
  const during = tips.state().tip.id;
  assert.ok(during - first <= 1, "höchstens ein weiterer Tipp noch aus der Kaufzeit");
  tips.ingest(frame({ round: 5, roundPhase: "live", steamid: MATE }));
  assert.equal(tips.state().quiet, false, "nach dem Tod darf die Sprechblase wieder erscheinen");
});

test("Höchstens drei Tipps pro Kaufzeit", () => {
  const time = clock();
  const tips = createGameTips({ ...time, radarPath: () => "C:/r.png" });
  const ak = { weapon_1: { name: "weapon_ak47", type: "Rifle", state: "active", ammo_clip: 30, ammo_clip_max: 30 } };
  let shown = 0;
  let last = 0;
  for (let i = 0; i < 20; i++) {
    tips.ingest(frame({ round: 0, state: { money: 800 }, weapons: ak }));
    const id = tips.state().tip?.id || 0;
    if (id !== last) shown++;
    last = id;
    time.advance(2000);
  }
  assert.ok(shown <= 3, `gezeigt: ${shown}`);
});

test("Funktionen lassen sich einzeln abschalten", () => {
  const time = clock();
  const off = new Set(["map", "economy"]);
  const tips = createGameTips({ ...time, enabled: (id) => !off.has(id) });
  tips.ingest(frame({ round: 0 }));
  assert.equal(tips.state().tip, null);
});

test("Gegnerserie: Timeout-Hinweis", () => {
  const time = clock();
  const tips = createGameTips({ ...time, enabled: (id) => id === "team" });
  const round_wins = { 1: "ct_win_elimination", 2: "t_win_elimination", 3: "t_win_bomb", 4: "t_win_elimination", 5: "t_win_elimination" };
  tips.ingest(frame({ round: 4, roundPhase: "over", team: "CT" }));
  tips.ingest(frame({ round: 5, team: "CT", map: { round_wins, team_ct: { score: 1, timeouts_remaining: 2 } } }));
  assert.match(tips.state().tip.text, /4 Runden in Folge geholt\. Ein taktisches Timeout \(noch 2 übrig\)/);
});

test("Tipps aus TecMon-Matches: oft am selben Spot gestorben", () => {
  const time = clock();
  /* Long A auf Dust2: Radar (880, 420) → Spielkoordinaten x = -2476 + 880·4,4, y = 3239 − 420·4,4. */
  const longA = [-2476 + 880 * 4.4, 3239 - 420 * 4.4];
  const deaths = [...Array(8)].map((_, i) => [longA[0] + i * 5, longA[1], 0]).concat([[0, 0, 0], [-500, 1500, 0]]);
  const insights = { maps: { de_dust2: { matches: 6, deaths, tRounds: 60, tWon: 30 } } };
  const tips = createGameTips({ ...time, enabled: (id) => id === "history", insights: (id) => (id === ME ? insights : null), radarPath: () => "C:/d2.png" });
  tips.ingest(frame({ name: "de_dust2", round: 0, team: "T" }));
  const tip = tips.state().tip;
  assert.equal(tip.category, "history");
  assert.match(tip.text, /^In deinen letzten 6 Matches auf Dust II bist du als T 8× bei Long A gestorben \(80 % deiner Tode\)\. Probier mal eine andere Route, zum Beispiel Short\./);
  assert.equal(tip.visual.marks.length, 10);
});

test("Frühes Nachladen wird gezählt und nach dem dritten Mal gemeldet", () => {
  const time = clock();
  const tips = createGameTips(time);
  const weapon = (state, clip) => ({
    weapon_1: { name: "weapon_ak47", type: "Rifle", state, ammo_clip: clip, ammo_clip_max: 30 },
  });
  for (let i = 0; i < 3; i++) {
    tips.ingest(frame({ round: 8, roundPhase: "live", weapons: weapon("active", 24) }));
    tips.ingest(frame({ round: 8, roundPhase: "live", weapons: weapon("reloading", 24) }));
  }
  time.advance(10000);
  tips.ingest(frame({ round: 8, roundPhase: "over", weapons: weapon("active", 30) }));
  assert.match(tips.state().tip.text, /3× mit fast vollem Magazin/);
});

test("Halbzeit- und Matchzusammenfassung", () => {
  const time = clock();
  const tips = createGameTips(time);
  tips.ingest(frame({ round: 11, roundPhase: "live", state: { round_kills: 2, round_killhs: 1 } }));
  tips.ingest(frame({ round: 11, roundPhase: "over", state: { round_kills: 2, round_killhs: 1 } }));
  time.advance(7000);
  tips.ingest(frame({ round: 12, roundPhase: "over", mapPhase: "intermission", stats: { kills: 10, deaths: 5 } }));
  assert.match(tips.state().tip.text, /^Halbzeit: 10 Kills, 5 Tode \(K\/D 2,00\)/);
  time.advance(7000);
  tips.ingest(frame({ round: 24, roundPhase: "over", mapPhase: "gameover", stats: { kills: 20, deaths: 10 } }));
  assert.match(tips.state().tip.text, /^Match vorbei: 20 Kills/);
  assert.match(tips.state().tip.text, /TecMon/);
});

test("GSI-Konfiguration nutzt nur eigene Spielerblöcke", () => {
  const text = gsiConfigText("a".repeat(64));
  assert.match(text, /"uri" "http:\/\/127\.0\.0\.1:31977\/gsi"/);
  assert.match(text, /"player_state" "1"/);
  assert.match(text, /"phase_countdowns" "1"/);
  assert.doesNotMatch(text, /allplayers|"bomb"|grenades|player_position/);
  assert.throws(() => gsiConfigText("evil\"\n"));
  assert.equal(
    gsiConfigPath(path.join("C:", "CS2", "game", "bin", "win64", "cs2.exe")),
    path.join("C:", "CS2", "game", "csgo", "cfg", "gamestate_integration_tecmon.cfg"),
  );
  assert.equal(gsiConfigPath("C:/evil.exe"), "");
});

test("Companion: Rundentipps einschalten, GSI-Token prüfen, ausschalten", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-gsi-test-"));
  const game = path.join(dir, "Counter-Strike Global Offensive", "game");
  const cs2 = path.join(game, "bin", "win64", "cs2.exe");
  await mkdir(path.dirname(cs2), { recursive: true });
  await mkdir(path.join(game, "csgo", "cfg"), { recursive: true });
  await writeFile(cs2, "fixture");
  const time = clock();
  const { server, token } = await createCompanion({
    dataDir: path.join(dir, "data"),
    detectTools: async () => ({ csdm: "", cs2 }),
    now: time.now,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const post = (route, body, more = {}) =>
    fetch(base + route, { method: "POST", headers: { ...headers, ...more }, body: JSON.stringify(body) });
  const state = async () => (await (await fetch(base + "/api/state", { headers })).json()).gsi;

  assert.equal((await state()).enabled, false);
  assert.equal((await post("/api/gsi/enable", {})).status, 400);
  assert.equal((await post("/api/gsi/enable", { confirm: true })).status, 200);
  const cfg = path.join(game, "csgo", "cfg", "gamestate_integration_tecmon.cfg");
  const gsiToken = (await readFile(cfg, "utf8")).match(/"token" "([a-f0-9]{64})"/)[1];
  assert.notEqual(gsiToken, token, "GSI-Token ist getrennt vom Sitzungstoken");

  const send = (payload, more = {}) =>
    fetch(base + "/gsi", { method: "POST", headers: { "content-type": "application/json", ...more }, body: JSON.stringify(payload) });
  const sample = (round, extra = {}) => ({
    ...frame({ round, ...extra }),
    auth: { token: gsiToken },
  });
  assert.equal((await send({ ...sample(4), auth: { token: "f".repeat(64) } })).status, 401);
  assert.equal((await send(sample(4), { Origin: "https://evil.example" })).status, 403);
  assert.equal((await send(sample(4, { roundPhase: "over" }))).status, 200);
  time.advance(7000);
  assert.equal((await send(sample(5, { state: { money: 2200 } }))).status, 200);
  assert.equal((await state()).tip.category, "map");
  time.advance(12000);
  assert.equal((await send(sample(5, { state: { money: 2200 } }))).status, 200);
  const live = await state();
  assert.equal(live.connected, true);
  assert.equal(live.map, "de_mirage");
  assert.match(live.tip.text, /Eco empfohlen|Knapp bei Kasse/);

  const toggled = await (await post("/api/gsi/features", { features: { map: false, evil: false, spray: "nein" } })).json();
  assert.equal(toggled.gsi.features.find((f) => f.id === "map").enabled, false);
  assert.equal(toggled.gsi.features.find((f) => f.id === "spray").enabled, true);
  assert.equal(toggled.gsi.features.some((f) => f.id === "evil"), false);
  assert.match(await readFile(path.join(dir, "data", "gsi.json"), "utf8"), /"map":false/);
  assert.equal((await post("/api/gsi/disable", {})).status, 200);
  assert.equal(await stat(cfg).catch(() => null), null);
  assert.equal((await state()).enabled, false);
});

test("Map-Übersicht mit Radar und Spots zu Beginn der Halbzeit, Spray-Muster beim Waffenkauf", () => {
  const time = clock();
  const tips = createGameTips({ ...time, radarPath: (map) => `C:/radars/${map}.png` });
  tips.ingest(frame({ round: 0, roundPhase: "warmup", mapPhase: "warmup" }));
  time.advance(12000);
  tips.ingest(frame({ round: 0, team: "CT" }));
  const overview = tips.state().tip;
  assert.equal(overview.category, "map");
  assert.match(overview.text, /^Mirage als CT: Die wichtigsten Spots sind Jungle, Connector, Window und Market\./);
  assert.equal(overview.visual.type, "map");
  assert.equal(overview.visual.image, "C:/radars/de_mirage.png");
  assert.ok(overview.visual.spots.find((spot) => spot.label === "Jungle").hot);
  assert.ok(overview.visual.spots.every((spot) => spot.x > 0 && spot.x < 1 && spot.y > 0 && spot.y < 1));

  const ak = { weapon_1: { name: "weapon_ak47", type: "Rifle", state: "active", ammo_clip: 30, ammo_clip_max: 30 } };
  tips.ingest(frame({ round: 3, roundPhase: "over" }));
  tips.ingest(frame({ round: 4, team: "CT", state: { money: 6000 }, weapons: ak }));
  for (let i = 0; i < 4 && tips.state().tip.category !== "weapon"; i++) {
    time.advance(12000);
    tips.ingest(frame({ round: 4, team: "CT", state: { money: 6000 }, weapons: ak }));
  }
  const spray = tips.state().tip;
  assert.equal(spray.category, "weapon");
  assert.equal(spray.visual.type, "spray");
  assert.equal(spray.visual.points.length, 30);
  assert.match(spray.text, /^AK-47/);
});

test("Ohne lokales Radarbild bleibt es beim Text", () => {
  const time = clock();
  const tips = createGameTips(time);
  tips.ingest(frame({ round: 0 }));
  const tip = tips.state().tip;
  assert.equal(tip.category, "map");
  assert.equal(tip.visual, undefined);
});

test("Früher Tod und starke Runde", () => {
  const time = clock();
  const tips = createGameTips(time);
  tips.ingest(frame({ round: 6, roundPhase: "freezetime" }));
  time.advance(15000);
  tips.ingest(frame({ round: 6, roundPhase: "live" }));
  time.advance(8000);
  tips.ingest(frame({ round: 6, roundPhase: "live", state: { health: 0 } }));
  time.advance(12000);
  tips.ingest(frame({ round: 6, roundPhase: "live", steamid: MATE }));
  assert.match(tips.state().tip.text, /^Früher Tod nach 8 Sekunden/);
  tips.ingest(frame({ round: 7, roundPhase: "freezetime" }));
  time.advance(15000);
  tips.ingest(frame({ round: 7, roundPhase: "live", state: { round_kills: 3, round_killhs: 2 } }));
  time.advance(60000);
  tips.ingest(frame({ round: 7, roundPhase: "over", state: { round_kills: 3, round_killhs: 2 } }));
  assert.match(tips.state().tip.text, /^Starke Runde: 3 Kills, davon 2 Headshots/);
});

test("Match-Auswertung der Webseite wird geprüft, gekürzt und lokal gespeichert", async (t) => {
  assert.throws(() => cleanInsights({ version: 1, steamId: "abc" }));
  const clean = cleanInsights({
    version: 1,
    steamId: ME,
    matches: 3,
    maps: {
      de_dust2: { matches: 3, tRounds: 36, tWon: 12, deaths: [[100.4, -20, 0], ["x", 1, 0], [5, 5, 7], ...Array(500).fill([1, 2, 1])] },
      "../evil": { matches: 1 },
    },
  });
  assert.deepEqual(Object.keys(clean.maps), ["de_dust2"]);
  assert.equal(clean.maps.de_dust2.deaths.length, 400);
  assert.equal(clean.maps.de_dust2.tWon, 12);
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-insights-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await createInsightsStore(dir);
  await store.put({ version: 1, steamId: ME, matches: 3, maps: { de_dust2: { matches: 3, deaths: [[100, -20, 0]] } } });
  const again = await createInsightsStore(dir);
  assert.deepEqual(again.get(ME).maps.de_dust2.deaths, [[100, -20, 0]]);
  assert.equal(again.summary()[0].matches, 3);
});
