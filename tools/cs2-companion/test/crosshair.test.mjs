import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cleanCrosshair, crosshairCommands, crosshairConfigText, crosshairConfigPath, decodeCrosshairCode, DEFAULT_CROSSHAIR } from "../crosshair.mjs";
import { createCompanion } from "../server.mjs";

const DICTIONARY = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789";
/* Testcode im CS2-Format erzeugen: 18 Bytes, Byte 0 = Prüfsumme, Zahl zur Basis 57. */
function encode(bytes) {
  bytes[0] = bytes.slice(1).reduce((a, v) => a + v, 0) % 256;
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let chars = "";
  for (let i = 0; i < 25; i++) { chars += DICTIONARY[Number(n % 57n)]; n /= 57n; }
  return `CSGO-${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10, 15)}-${chars.slice(15, 20)}-${chars.slice(20)}`;
}

test("Fadenkreuz: Werte werden begrenzt, Befehle entstehen nur aus Zahlen", () => {
  const c = cleanCrosshair({ size: 99, gap: -9, thickness: "0.34", style: 9, color: [300, -4, "x"], alpha: 128, dot: "ja", outline: false });
  assert.equal(c.size, 10);
  assert.equal(c.gap, -5);
  assert.equal(c.thickness, 0.3);
  assert.equal(c.style, DEFAULT_CROSSHAIR.style);
  assert.deepEqual(c.color, [255, 0, DEFAULT_CROSSHAIR.color[2]]);
  assert.equal(c.dot, DEFAULT_CROSSHAIR.dot);
  const commands = crosshairCommands({ ...c, size: "1; quit" });
  assert.ok(commands.every((line) => /^[a-z_]+ -?\d+(\.\d+)?$/.test(line)), commands.join("\n"));
  assert.ok(commands.includes("cl_crosshairusealpha 1"));
  assert.ok(commands.includes("cl_crosshair_drawoutline 0"));
  assert.match(crosshairConfigText(c), /^\/\/ TecMon Companion/);
  assert.equal(crosshairConfigPath("C:/evil.exe"), "");
  assert.match(crosshairConfigPath("C:/Steam/game/bin/win64/cs2.exe"), /csgo[\\/]cfg[\\/]tecmon_crosshair\.cfg$/);
});

test("Fadenkreuz: CS2-Code einlesen", () => {
  const bytes = new Array(18).fill(0);
  bytes[1] = 1; bytes[2] = 256 - 20; bytes[3] = 2; bytes[4] = 10; bytes[5] = 20; bytes[6] = 30; bytes[7] = 200;
  bytes[10] = 5 | 8; bytes[12] = 15; bytes[13] = ((1 | 4 | 8) << 4) | (4 << 1); bytes[14] = 30;
  const c = decodeCrosshairCode(encode(bytes));
  assert.deepEqual(c, { style: 4, size: 3, gap: -2, thickness: 1.5, outline: true, outlineThickness: 1, color: [10, 20, 30], alpha: 200, dot: true, tStyle: true });
  assert.equal(decodeCrosshairCode("CSGO-aaaaa-bbbbb-ccccc-ddddd-eeeee"), null);
  assert.equal(decodeCrosshairCode("kaputt"), null);
});

test("Companion: Fadenkreuz speichern schreibt eigene cfg in den CS2-Ordner", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-crosshair-"));
  const game = path.join(dir, "game");
  const cs2 = path.join(game, "bin", "win64", "cs2.exe");
  await mkdir(path.dirname(cs2), { recursive: true });
  await mkdir(path.join(game, "csgo", "cfg"), { recursive: true });
  await writeFile(cs2, "fixture");
  const { server, token } = await createCompanion({ dataDir: path.join(dir, "data"), detectTools: async () => ({ csdm: "", cs2 }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const initial = await (await fetch(base + "/api/crosshair", { headers })).json();
  assert.equal(initial.available, true);
  assert.equal(initial.exec, "exec tecmon_crosshair");
  const saved = await (await fetch(base + "/api/crosshair/save", { method: "POST", headers, body: JSON.stringify({ crosshair: { size: 3, dot: true } }) })).json();
  assert.match(saved.message, /exec tecmon_crosshair/);
  const cfg = await readFile(path.join(game, "csgo", "cfg", "tecmon_crosshair.cfg"), "utf8");
  assert.match(cfg, /cl_crosshairsize 3\n/);
  assert.match(cfg, /cl_crosshairdot 1\n/);
  assert.equal((await fetch(base + "/api/crosshair/decode", { method: "POST", headers, body: JSON.stringify({ code: "nein" }) })).status >= 400, true);
  assert.equal((await fetch(base + "/api/crosshair")).status >= 400, true, "ohne Sitzungstoken kein Zugriff");
});
