import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { FEATURES } from "../game-tips.mjs";
import { DOTA_FEATURES } from "../dota-tips.mjs";
import { CFG_CATALOG } from "../cfg-library.mjs";

const root = new URL("../../../", import.meta.url);
const read = (file) => readFileSync(new URL(file, root), "utf8");

test("Menüentwurf behält statische Optionen und alle dynamischen Tipp-/CFG-Kataloge", () => {
  const html = read("docs/companion-menu-mockup.html");
  const inventory = JSON.parse(html.match(/id="tm-menu-inventory">([\s\S]*?)<\/script>/)[1]);
  const ids = new Set(inventory.sections.flatMap((s) => s.controls.map((c) => c.id)));
  const globalNavigation = new Set(["advanced-toggle", "update-banner-install", "shutdown", "shutdown-yes", "shutdown-no"]);
  const current = read("tools/cs2-companion/public/index.html");
  for (const match of current.matchAll(/<(?:button|input|select|textarea)\b[^>]*\bid="([^"]+)"/g))
    assert.ok(ids.has(match[1]) || globalNavigation.has(match[1]), `Option fehlt: ${match[1]}`);
  for (const feature of [...FEATURES, ...DOTA_FEATURES, ...CFG_CATALOG])
    assert.ok(ids.has(feature.id), `Katalogeintrag fehlt: ${feature.id}`);
  assert.ok(!html.includes("__INVENTORY__"));
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(html), "Entwurf verändert keine echten Daten");
  for (const script of html.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g))
    assert.doesNotThrow(() => new vm.Script(script[1]));
});
