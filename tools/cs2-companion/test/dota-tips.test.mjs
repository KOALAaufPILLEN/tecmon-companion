import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { DOTA_GSI_BLOCKS, dotaGsiConfigText, dotaGsiConfigPath, cleanDotaPayload } from "../dota-gsi.mjs";
import { createDotaTips, DOTA_FEATURES, BRIEFING_LIMIT } from "../dota-tips.mjs";
import { createCompanion } from "../server.mjs";

const TOKEN = "a".repeat(64);
const STEAM = "76561198000000001";
const IN_PROGRESS = "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS";

function payload({ state = IN_PROGRESS, clock = 600, alive = true, paused = false, gold = 500, items = {}, matchid = "7000000001", ...rest } = {}) {
  return {
    auth: { token: TOKEN },
    provider: { name: "Dota 2", appid: 570 },
    map: { matchid, game_state: state, clock_time: clock, paused, win_team: rest.winTeam ?? "none" },
    player: { steamid: STEAM, team_name: "radiant", kills: 3, deaths: 2, assists: 7, last_hits: rest.lastHits ?? 40, denies: 5, gold, gpm: 420, xpm: 510 },
    hero: { name: "npc_dota_hero_axe", level: 12, alive, buyback_cost: rest.buybackCost ?? 1500, buyback_cooldown: 0 },
    items,
  };
}

test("Dota-GSI: nur eigene Blöcke, keine Gegner-, Karten- oder Roshan-Daten", () => {
  const text = dotaGsiConfigText(TOKEN);
  assert.match(text, /"uri" "http:\/\/127\.0\.0\.1:31977\/gsi\/dota2"/);
  assert.deepEqual(DOTA_GSI_BLOCKS, ["provider", "map", "player", "hero", "items"]);
  for (const forbidden of ["buildings", "minimap", "roshan", "couriers", "draft", "neutralitems", "events", "league", "wearables", "abilities", "allplayers"])
    assert.doesNotMatch(text, new RegExp(`"${forbidden}"`), forbidden);
  assert.throws(() => dotaGsiConfigText("kurz"), /Token/);
  assert.equal(dotaGsiConfigPath("C:\\x\\cs2.exe"), "");
  assert.match(dotaGsiConfigPath(path.join("D", "game", "bin", "win64", "dota2.exe")), /dota[\\/]cfg[\\/]gamestate_integration[\\/]gamestate_integration_tecmon\.cfg$/);
});

test("Dota-GSI: Zuschauer- und Replay-Daten beider Teams werden verworfen", () => {
  assert.equal(cleanDotaPayload({ ...payload(), player: { team2: { player0: {} }, team3: {} } }), null);
  assert.equal(cleanDotaPayload({ ...payload(), hero: { team2: {} } }), null);
  assert.equal(cleanDotaPayload({ ...payload(), player: { ...payload().player, steamid: "123" } }), null);
  const clean = cleanDotaPayload(payload({ items: { slot0: { name: "item_blink", can_cast: true, cooldown: 0 }, slot1: { name: "empty" }, stash0: { name: "item_tango" } } }));
  assert.equal(clean.player.steamid, STEAM);
  assert.deepEqual(clean.items.map((i) => i.name), ["item_blink"]);
  assert.equal("auth" in clean, false);
});

test("Dota-Tipps: still, solange du lebst; Tipps nach dem Tod, höchstens BRIEFING_LIMIT", () => {
  let time = 0;
  const tips = createDotaTips({ now: () => time });
  const step = (opts) => { time += 5000; tips.ingest(cleanDotaPayload(payload(opts))); };
  step({ clock: 1700, gold: 3000 });
  assert.equal(tips.state().quiet, true);
  assert.equal(tips.state().tip, null, "lebend im laufenden Spiel kein Tipp");
  const items = { slot0: { name: "item_black_king_bar", can_cast: true, cooldown: 0 } };
  step({ clock: 1710, alive: false, gold: 3000, items, buybackCost: 4000 });
  assert.equal(tips.state().quiet, false);
  assert.equal(tips.state().tip.category, "actives");
  for (let i = 0; i < 6; i++) step({ clock: 1712 + i, alive: false, gold: 3000, items, buybackCost: 4000 });
  assert.equal(tips.state().history.length, BRIEFING_LIMIT);
  // Wiederbelebt: still, Warteschlange geleert.
  step({ clock: 1760, gold: 3000 });
  assert.equal(tips.state().quiet, true);
  const count = tips.state().history.length;
  step({ clock: 1770, gold: 3000 });
  assert.equal(tips.state().history.length, count);
});

test("Dota-Tipps: Spielpause öffnet ein Fenster, Matchende bringt Bilanz", () => {
  let time = 0;
  const tips = createDotaTips({ now: () => time });
  const step = (opts) => { time += 5000; tips.ingest(cleanDotaPayload(payload(opts))); };
  step({ clock: 600 });
  step({ clock: 600, paused: true, lastHits: 20 });
  assert.equal(tips.state().tip.category, "farm");
  step({ clock: 2400, state: "DOTA_GAMERULES_STATE_POST_GAME", winTeam: "radiant" });
  assert.equal(tips.state().tip.category, "summary");
  assert.match(tips.state().tip.text, /^Sieg: 3\/2\/7/);
});

test("Dota-Tipps: abgeschaltete Funktionen schweigen", () => {
  let time = 0;
  const off = new Set(["actives", "gold", "buyback", "farm"]);
  const tips = createDotaTips({ now: () => time, enabled: (id) => !off.has(id) });
  assert.deepEqual(DOTA_FEATURES.map((f) => f.id), ["farm", "buyback", "actives", "gold", "summary"]);
  time = 5000;
  tips.ingest(cleanDotaPayload(payload({ clock: 1700 })));
  time = 10000;
  tips.ingest(cleanDotaPayload(payload({ clock: 1710, alive: false, gold: 5000, items: { slot0: { name: "item_blink", can_cast: true, cooldown: 0 } } })));
  assert.equal(tips.state().tip, null);
});

test("Dota-Paket: Route nur mit Paket, Token und ohne Origin; Entfernen räumt die cfg auf", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-dota-"));
  const dota2 = path.join(dir, "dota 2 beta", "game", "bin", "win64", "dota2.exe");
  await mkdir(path.dirname(dota2), { recursive: true });
  await mkdir(path.join(dir, "dota 2 beta", "game", "dota", "cfg"), { recursive: true });
  await writeFile(dota2, "");
  const { server, token } = await createCompanion({ dataDir: path.join(dir, "data"), detectTools: async () => ({ csdm: "", cs2: "", dota2 }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const post = (route, body) => fetch(base + route, { method: "POST", headers, body: JSON.stringify(body) });
  const state = async () => (await (await fetch(base + "/api/state", { headers })).json());
  const cfg = path.join(dir, "dota 2 beta", "game", "dota", "cfg", "gamestate_integration", "gamestate_integration_tecmon.cfg");
  const exists = (file) => access(file).then(() => true, () => false);

  assert.equal((await fetch(base + "/gsi/dota2", { method: "POST", body: "{}" })).status, 409, "ohne Paket gesperrt");
  assert.equal((await post("/api/dota2/enable", { confirm: true })).status, 400);
  assert.equal((await post("/api/games/install", { id: "dota2" })).status, 200);
  assert.equal((await post("/api/dota2/enable", {})).status, 400, "nur ausdrücklich");
  assert.equal((await post("/api/dota2/enable", { confirm: true })).status, 200);
  assert.equal(await exists(cfg), true);
  const realToken = (await readFile(cfg, "utf8")).match(/"token" "([a-f0-9]{64})"/)[1];
  const send = (body, extra = {}) => fetch(base + "/gsi/dota2", { method: "POST", headers: { "content-type": "application/json", ...extra }, body: JSON.stringify(body) });
  assert.equal((await send(payload())).status, 401, "falsches Token");
  assert.equal((await send({ ...payload(), auth: { token: realToken } }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await send({ ...payload(), auth: { token: realToken } })).status, 200);
  const s = await state();
  assert.equal(s.dota.connected, true);
  assert.equal(s.gsi.dotaActive, true);
  assert.equal(s.gsi.quiet, true);
  assert.equal((await post("/api/dota2/features", { features: { gold: false, bogus: true } })).status, 200);
  assert.equal((await state()).dota.features.find((f) => f.id === "gold").enabled, false);

  assert.equal((await post("/api/games/remove", { id: "dota2", confirm: true })).status, 200);
  assert.equal(await exists(cfg), false, "cfg beim Entfernen gelöscht");
  assert.equal((await state()).dota.enabled, false);
  assert.equal((await post("/api/dota2/features", { features: { gold: true } })).status, 400);
});
