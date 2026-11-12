import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPet, flavorTip, petLine, levelOf, quizQuestion, MODES } from "../personality.mjs";
import { createGameTips } from "../game-tips.mjs";
import { createCompanion } from "../server.mjs";

const first = () => 0;

test("Persönlichkeit: Modi färben nur den Einstieg, Inhalt bleibt", () => {
  assert.equal(flavorTip("normal", "death", "Kauf Rüstung."), "Kauf Rüstung.");
  assert.match(flavorTip("huan", "death", "Kauf Rüstung.", first), /^Schon wieder tot\?.*Kauf Rüstung\.$/);
  assert.match(flavorTip("nett", "praise", "Drei Kills.", first), /stolz.*Drei Kills\.$/);
  assert.match(flavorTip("nerdy", "weapon", "AK zieht hoch.", first), /AK zieht hoch\.$/);
  assert.equal(flavorTip("gibtsnicht", "death", "x"), "x");
  for (const m of MODES) for (const e of ["poke", "joke", "compliment", "trick", "sleep", "wake", "win", "lose", "mode"]) assert.ok(petLine(m.id, e).length > 3, `${m.id}/${e}`);
  assert.deepEqual(levelOf(0), { level: 1, xp: 0, next: 100 });
  assert.deepEqual(levelOf(260), { level: 3, xp: 10, next: 200 });
  const q = quizQuestion();
  assert.equal(q.options.length, 4);
  assert.ok(q.answer >= 0 && q.answer < 4);
});

test("Persönlichkeit: Tipps nutzen den gewählten Einstieg", () => {
  const tips = createGameTips({ flavor: (category, text) => `[${category}] ${text}` });
  assert.equal(typeof tips.state, "function");
});

test("TecMon-Werte: Interaktion, Energie, Schlaf, Spiele, Speichern", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-pet-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let clock = 1_000_000;
  const pet = await createPet(dir, { now: () => clock, rand: first });
  let s = await pet.interact("poke");
  assert.equal(s.event.kind, "poke");
  assert.equal(s.counts.poke, 1);
  assert.equal(s.totalXp, 2);
  await assert.rejects(pet.interact("rm -rf"), /Unbekannte/);
  clock += 5 * 3600000;
  s = pet.state();
  assert.ok(s.energy < 80 - 50, `Energie sinkt wach: ${s.energy}`);
  s = await pet.interact("sleep");
  assert.equal(s.asleep, true);
  clock += 2 * 3600000;
  s = await pet.interact("joke");
  assert.equal(s.asleep, false, "Anstupsen weckt");
  assert.equal(s.event.kind, "wake");
  assert.ok(s.energy > 80, `Schlaf lädt auf: ${s.energy}`);
  s = await pet.game("reaction", { win: true, score: 250 });
  s = await pet.game("reaction", { win: false, score: 400 });
  assert.equal(s.best.reaction, 250, "kleinere Reaktionszeit ist besser");
  await pet.game("aim", { win: true, score: 5200 });
  s = await pet.game("aim", { win: false, score: 7000 });
  assert.equal(s.best.aim, 5200, "schnellere Zielzeit ist besser");
  await pet.game("guess", { win: true, score: 6 });
  s = await pet.game("guess", { win: false, score: 9 });
  assert.equal(s.best.guess, 6, "weniger Versuche sind besser");
  await pet.game("memory", { win: false, score: 4 });
  s = await pet.game("memory", { win: true, score: 7 });
  assert.equal(s.best.memory, 7, "längeres Muster ist besser");
  s = await pet.game("price", { win: true, score: 1 });
  assert.equal(s.counts.win_price, 1);
  await assert.rejects(pet.game("poker"), /Unbekanntes Spiel/);
  s = await pet.setMode("huan");
  assert.equal(s.mode, "huan");
  await assert.rejects(pet.setMode("böse"), /Unbekannter Modus/);
  const again = await createPet(dir, { now: () => clock });
  assert.equal(again.state().mode, "huan");
  assert.match(await readFile(path.join(dir, "pet.json"), "utf8"), /"huan"/);
});

test("Companion: TecMon-API mit Sitzungstoken", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-pet-api-"));
  const { server, token } = await createCompanion({ dataDir: path.join(dir, "data"), detectTools: async () => ({ csdm: "", cs2: "" }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const post = (route, body) => fetch(base + route, { method: "POST", headers, body: JSON.stringify(body) });
  const state = await (await fetch(base + "/api/state", { headers })).json();
  assert.equal(state.pet.mode, "normal");
  assert.equal((await (await post("/api/pet/mode", { mode: "nerdy" })).json()).pet.mode, "nerdy");
  assert.equal((await (await post("/api/pet/interact", { action: "trick" })).json()).pet.event.spin, true);
  assert.equal((await post("/api/pet/interact", { action: "kaputt" })).status >= 400, true);
  assert.equal((await (await post("/api/pet/game", { game: "rps", win: true })).json()).pet.counts.win_rps, 1);
  const quiz = await (await fetch(base + "/api/pet/quiz", { headers })).json();
  assert.equal(quiz.options.length, 4);
  assert.equal((await fetch(base + "/api/pet/quiz")).status >= 400, true);
});
