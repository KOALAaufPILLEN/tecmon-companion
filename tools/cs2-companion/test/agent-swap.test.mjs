import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { validateJob } from "../job.mjs";
import { AGENTS, DEFAULT_CT, DEFAULT_T, agentRequest, cleanAgents, createAgentSwap, hasAgents } from "../agent-swap.mjs";

const STEAM = "76561198000000001";
const OTHER = "76561198000000002";
const job = (a, b, skinsB) =>
  validateJob({
    format: "tecmon-cs2-job",
    version: 1,
    title: "Test",
    map: "de_mirage",
    tickRate: 64,
    branding: { enabled: false },
    sequences: [
      { startTick: 1000, endTick: 1640, steamId: STEAM, playerName: "Eins", slot: 2, ...(a ? { agents: a } : {}) },
      { startTick: 3000, endTick: 3640, steamId: OTHER, playerName: "Zwei", slot: 4, ...(b ? { agents: b } : {}), ...(skinsB ? { skins: skinsB } : {}) },
    ],
  });

test("agent catalogue has fixed model paths per side", () => {
  assert.ok(Object.keys(AGENTS).length > 60);
  for (const [id, [side, model, name]] of Object.entries(AGENTS)) {
    assert.ok(side === "t" || side === "ct", id);
    assert.match(model, /^agents\/models\/(tm|ctm)_[a-z0-9_]+\/[a-z0-9_]+\.vmdl$/);
    assert.equal(model.startsWith(`agents/models/${side === "t" ? "tm_" : "ctm_"}`), true, id);
    assert.ok(name.length > 2);
  }
  assert.equal(AGENTS[DEFAULT_T][0], "t");
  assert.equal(AGENTS[DEFAULT_CT][0], "ct");
});

test("only known agent numbers on the matching side are accepted", () => {
  const fail = () => {
    throw new Error("bad");
  };
  assert.deepEqual(cleanAgents({ t: 4613, ct: 4619 }, fail), { t: 4613, ct: 4619 });
  assert.equal(cleanAgents(undefined, fail), undefined);
  assert.throws(() => cleanAgents({ t: 4619 }, fail));
  assert.throws(() => cleanAgents({ ct: 1 }, fail));
  assert.throws(() => cleanAgents({ t: "agents/models/x.vmdl" }, fail));
  assert.throws(() => cleanAgents({ side: 4613 }, fail));
  assert.throws(() => cleanAgents([4613], fail));
  assert.throws(() => job({ t: 99999 }));
  assert.deepEqual(job({ t: 4613 }).sequences[0].agents, { t: 4613 });
});

test("request lists models per player, steam ids stay text", () => {
  const request = agentRequest(job({ t: 4613 }, { ct: 4619 }), { input: "a.dem", output: "b.dem", original: "a.dem", cache: "c.json" });
  assert.deepEqual(request.players, [
    { steamid: STEAM, t: AGENTS[4613][1] },
    { steamid: OTHER, ct: AGENTS[4619][1] },
  ]);
  assert.equal(request.learn, "a.dem");
  assert.equal(typeof request.players[0].steamid, "string");
  assert.equal(agentRequest(job(), { input: "a", output: "b", original: "a", cache: "c" }), null);
});

test("glove skins add the player for the glove fix only after a skin swap", () => {
  const gloves = [{ weapon: 5030, paintKit: 10037, wear: 0.1, seed: 1 }];
  const j = job(undefined, undefined, gloves);
  assert.equal(hasAgents(j), false);
  assert.equal(agentRequest(j, { input: "a", output: "b", original: "a", cache: "c" }), null);
  assert.deepEqual(agentRequest(j, { input: "s", output: "b", original: "a", cache: "c", skinsSwapped: true }).players, [{ steamid: OTHER }]);
});

test("different agents for one player and side are refused", () => {
  const j = job({ t: 4613 });
  j.sequences[1] = { ...j.sequences[1], steamId: STEAM, agents: { t: AGENTS[4613] ? 4726 : 4613 } };
  assert.throws(() => agentRequest(j, { input: "a", output: "b", original: "a", cache: "c" }), /verschiedene Agenten/);
});

test("rewrite runs the bundled program and cleans up", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-agents-"));
  const demo = path.join(dir, "match.dem");
  await writeFile(demo, "demo");
  const calls = [];
  const swap = await createAgentSwap({
    dir,
    exe: path.join(dir, "tecmon-demo-rewriter.exe"),
    exists: async () => true,
    run: async (exe, args) => {
      calls.push(args);
      const request = JSON.parse(await readFile(args[1], "utf8"));
      await writeFile(request.output, "rewritten");
      return `{"ok":true,"changed":{"${STEAM}":2},"guessed":[]}\n`;
    },
  });
  assert.equal(swap.available, true);
  const log = [];
  const copy = await swap.rewrite(job({ t: 4613 }), { input: demo, original: demo, log: (m) => log.push(m) });
  assert.equal(copy, path.join(dir, "match.tecmon-agents.dem"));
  assert.equal(calls[0][0], "rewrite");
  assert.equal(existsSync(calls[0][1]), false, "request file removed");
  assert.ok(log.some((m) => m.includes("1 Spieler")));
  await swap.cleanup(copy);
  assert.equal(existsSync(copy), false);
  await swap.cleanup(demo);
  assert.equal(existsSync(demo), true, "only own copies are removed");
});

test("without the bundled program nothing is rewritten", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-agents-"));
  const swap = await createAgentSwap({ dir, exe: path.join(dir, "missing.exe") });
  assert.equal(swap.available, false);
  const log = [];
  assert.equal(await swap.rewrite(job({ t: 4613 }), { input: "x.dem", original: "x.dem", log: (m) => log.push(m) }), "");
  assert.ok(log[0].includes("neueren Companion"));
});

test("a failing program reports a short reason", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-agents-"));
  const swap = await createAgentSwap({
    dir,
    exe: "x.exe",
    exists: async () => true,
    run: async () => {
      throw Object.assign(new Error("exit 1"), { stderr: "Error: Demo nicht lesbar\nmore" });
    },
  });
  await assert.rejects(swap.rewrite(job({ t: 4613 }), { input: path.join(dir, "a.dem"), original: path.join(dir, "a.dem") }), /Demo nicht lesbar/);
});
