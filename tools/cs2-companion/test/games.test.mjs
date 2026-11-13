import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { createGamePackages, GAME_CATALOG } from "../games.mjs";
import { createCompanion } from "../server.mjs";

test("Spiel-Pakete: CS2 standardmäßig installiert, geplante Spiele nicht installierbar", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-games-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const games = await createGamePackages(dir);
  assert.equal(games.has("cs2"), true);
  assert.deepEqual(GAME_CATALOG.filter((g) => g.status === "planned").map((g) => g.id), ["valorant", "wardogs"]);
  await assert.rejects(games.install("valorant"), /geplant/);
  await assert.rejects(games.install("tetris"), /Unbekanntes Spiel/);
  await games.remove("cs2");
  assert.equal(games.has("cs2"), false);
  assert.equal((await createGamePackages(dir)).has("cs2"), false, "Auswahl bleibt gespeichert");
  await games.install("cs2");
  assert.equal((await createGamePackages(dir)).has("cs2"), true);
});

test("Spiel-Pakete: CS2 entfernen löscht eigene Dateien und sperrt CS2-Funktionen", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-games-api-"));
  const cs2 = path.join(dir, "cs2", "game", "bin", "win64", "cs2.exe");
  await mkdir(path.dirname(cs2), { recursive: true });
  await writeFile(cs2, "");
  const data = path.join(dir, "data");
  const { server, token } = await createCompanion({ dataDir: data, detectTools: async () => ({ csdm: "", cs2 }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const post = (route, body) => fetch(base + route, { method: "POST", headers, body: JSON.stringify(body) });
  const cfgDir = path.join(dir, "cs2", "game", "csgo", "cfg");
  const exists = (file) => access(file).then(() => true, () => false);

  assert.equal((await post("/api/crosshair/save", { crosshair: { size: 3 } })).status, 200);
  assert.equal(await exists(path.join(cfgDir, "tecmon_crosshair.cfg")), true);
  assert.equal((await post("/api/gsi/enable", { confirm: true })).status, 200);
  assert.equal(await exists(path.join(cfgDir, "gamestate_integration_tecmon.cfg")), true);

  assert.equal((await post("/api/games/remove", { id: "cs2" })).status >= 400, true, "nur mit Bestätigung");
  const removed = await (await post("/api/games/remove", { id: "cs2", confirm: true })).json();
  assert.equal(removed.games.find((g) => g.id === "cs2").installed, false);
  assert.equal(removed.gsi.enabled, false);
  assert.equal(await exists(path.join(cfgDir, "tecmon_crosshair.cfg")), false);
  assert.equal(await exists(path.join(cfgDir, "gamestate_integration_tecmon.cfg")), false);
  assert.equal(await exists(path.join(data, "crosshair.json")), false);
  assert.match(await readFile(path.join(data, "games.json"), "utf8"), /"installed":\{\}/);

  assert.equal((await post("/api/gsi/enable", { confirm: true })).status >= 400, true);
  assert.equal((await post("/api/crosshair/save", { crosshair: {} })).status >= 400, true);
  assert.equal((await post("/api/games/install", { id: "valorant" })).status >= 400, true);
  const back = await (await post("/api/games/install", { id: "cs2" })).json();
  assert.equal(back.games.find((g) => g.id === "cs2").installed, true);
  const state = await (await fetch(base + "/api/state", { headers })).json();
  assert.equal(state.games.length, 4);
});
