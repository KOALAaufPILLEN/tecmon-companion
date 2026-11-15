import test from "node:test";
import assert from "node:assert/strict";
import { workState } from "../work-status.mjs";

const capture = (status) => ({ id: "a", status, job: { sequences: [{ steamId: "76561198000000001" }] }, log: "C:/geheim/pfad" });

test("Sprechblase: Schritt und fester Text je Status, keine Pfade", () => {
  assert.equal(workState(new Map()), null);
  const steps = ["downloading", "preparing", "recording", "branding", "done"].map((s) => workState(new Map([["a", capture(s)]])));
  assert.deepEqual(steps.map((w) => w.step), [1, 2, 3, 4, 5]);
  assert.ok(steps.every((w) => w.steps === 5 && w.id === "a"));
  assert.match(steps[3].text, /Video-Branding, das dauert kurz/);
  assert.ok(!JSON.stringify(steps).includes("geheim"));
  assert.equal(workState(new Map([["a", capture("unbekannt")]])), null);
});

test("Letzter Auftrag zählt; reiner Download hat einen Schritt", () => {
  const download = { id: "b", status: "downloading", job: { sequences: [] } };
  const w = workState(new Map([["a", capture("done")], ["b", download]]));
  assert.equal(w.id, "b");
  assert.equal(w.steps, 1);
  assert.match(workState(new Map([["b", { ...download, status: "done" }]])).text, /heruntergeladen/);
  assert.match(workState(new Map([["c", { id: "c", status: "camera", job: { sequences: [] } }]])).text, /Kamerapunkte/);
});
