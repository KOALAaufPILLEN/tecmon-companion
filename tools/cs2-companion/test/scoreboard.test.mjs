import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import { EventEmitter, once } from "node:events";
import os from "node:os";
import path from "node:path";
import {
  createScoreboard,
  parseScoreboard,
  pickBest,
  readNumber,
  burstArgs,
  parseOcrOutput,
  summary,
  OCR_SCRIPT,
  SCOREBOARD_CAPABILITY,
} from "../scoreboard.mjs";
import { createCompanion } from "../server.mjs";

const word = (t, x, y, w = 40, h = 18) => ({ t, x, y, w, h });

/** Nachgebaute Texterkennung eines Scoreboards: Kopfzeile, Gegner, eigene Zeile, HUD-Geld. */
function board({ withMoneyColumn = true, name = "K0ALA" } = {}) {
  const words = [
    word("Name", 200, 100),
    word("K", 800, 100, 14),
    word("D", 880, 100, 14),
    word("A", 960, 100, 14),
    word("Score", 1040, 100, 60),
    ...(withMoneyColumn ? [word("Geld", 1170, 100, 50)] : []),
    word("Gegner", 200, 140, 80),
    word("9", 802, 141, 12),
    word("1", 882, 141, 12),
    word("0", 962, 141, 12),
    word("2.100", 1045, 141, 50),
    ...(withMoneyColumn ? [word("$900", 1170, 141, 50)] : []),
    word(name, 200, 180, 90),
    word("5", 802, 181, 12),
    word("2", 882, 181, 12),
    word("3", 962, 181, 12),
    word("1,250", 1045, 181, 50),
    ...(withMoneyColumn ? [word("$3.400", 1170, 181, 60)] : []),
    word("$4800", 1700, 1000, 70),
  ];
  return { width: 1920, height: 1080, words };
}

test("Scoreboard: Zahlen aus der Texterkennung, typische Verwechslungen", () => {
  assert.equal(readNumber("1.250"), 1250);
  assert.equal(readNumber("1,250"), 1250);
  assert.equal(readNumber("$3400"), 3400);
  assert.equal(readNumber("1O"), 10, "O statt 0");
  assert.equal(readNumber("Name"), null);
  assert.equal(readNumber("12.5"), null, "keine Dezimalzahlen");
});

test("Scoreboard: eigene Zeile über den Namen, Werte je Spalte", () => {
  const parsed = parseScoreboard(board(), "KOALA");
  assert.deepEqual(parsed.values, { kills: 5, deaths: 2, assists: 3, score: 1250, money: 3400 });
  assert.equal(parsed.moneySource, "scoreboard");
  assert.ok(parsed.confidence > 0.5);
  assert.equal(parseScoreboard(board(), "Jemand"), null, "fremder Name → nichts");
  assert.equal(parseScoreboard({ words: [word("KOALA", 10, 10), word("5", 50, 10)] }, "KOALA"), null, "ohne Kopfzeile nichts");
});

test("Scoreboard: ohne Geld-Spalte zählt das Geld aus dem HUD", () => {
  const parsed = parseScoreboard(board({ withMoneyColumn: false }), "KOALA");
  assert.equal(parsed.values.money, 4800);
  assert.equal(parsed.moneySource, "hud");
  assert.equal(summary(parsed.values), "Kills 5 · Tode 2 · Assists 3 · Punkte 1250 · Geld 4800");
});

test("Scoreboard: aus einer Foto-Serie zählt das Foto mit Scoreboard", () => {
  const empty = { width: 1920, height: 1080, words: [word("$4800", 1700, 1000)] };
  const best = pickBest([empty, board(), empty], "KOALA");
  assert.equal(best.values.kills, 5);
  assert.equal(pickBest([empty, empty], "KOALA"), null);
});

test("Scoreboard: nur Bildschirmfotos, Texterkennung von Windows, Ausgabe robust", () => {
  const args = burstArgs();
  assert.ok(args.some((a) => a.startsWith("ddagrab=")));
  assert.ok(args.includes("foto%02d.png"));
  assert.match(OCR_SCRIPT, /Windows\.Media\.Ocr\.OcrEngine/);
  assert.match(OCR_SCRIPT, /IAsyncOperation`1/);
  assert.doesNotMatch(OCR_SCRIPT, /Invoke-WebRequest|Net\.WebClient|Start-Process/, "nichts nachladen, nichts starten");
  const out = parseOcrOutput('Warnung\n{"file":"foto01.png","width":1920,"height":1080,"words":{"t":"K","x":1,"y":2,"w":3,"h":4}}\n{kaputt');
  assert.equal(out.length, 1);
  assert.equal(out[0].words[0].t, "K", "einzelnes Wort ohne Array (ConvertTo-Json)");
  assert.equal(SCOREBOARD_CAPABILITY, "scoreboard-v1");
});

/** FFmpeg legt Fotos an, PowerShell gibt die nachgebaute Texterkennung aus. */
function fakeTools({ ocr = board() } = {}) {
  const calls = [];
  const spawn = (exe, args, options) => {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = () => setImmediate(() => proc.emit("close", null));
    calls.push({ exe, args, cwd: options.cwd });
    setImmediate(async () => {
      if (exe === "ffmpeg.exe") {
        for (let i = 1; i <= 3; i++) await writeFile(path.join(options.cwd, `foto0${i}.png`), "png");
      } else {
        const files = (await readdir(options.cwd)).filter((n) => n.endsWith(".png"));
        for (const file of files) proc.stdout.emit("data", JSON.stringify({ file, ...ocr }) + "\n");
      }
      proc.emit("close", 0);
    });
    return proc;
  };
  return { spawn, calls };
}

test("Scoreboard: Foto-Serie wird ausgewertet, Fotos gelöscht, nur eigene Werte gespeichert", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-scoreboard-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tools = fakeTools();
  const sb = await createScoreboard({ dir, ffmpeg: "ffmpeg.exe", powershell: "powershell.exe", spawnProcess: tools.spawn, now: () => 1000 });
  assert.equal(sb.state().enabled, false, "standardmäßig aus");
  await assert.rejects(sb.capture(), /aus/);
  await assert.rejects(sb.setSettings({ enabled: true }), /Ingame-Namen/);
  await sb.setSettings({ enabled: true, playerName: 'KOALA"<x>' });
  assert.equal(sb.state().playerName, "KOALAx");
  await sb.setSettings({ playerName: "KOALA" });
  const shot = await sb.capture();
  assert.deepEqual(shot.values, { kills: 5, deaths: 2, assists: 3, score: 1250, money: 3400 });
  assert.equal(tools.calls[1].args[tools.calls[1].args.indexOf("-File") + 1].endsWith("ocr.ps1"), true);
  assert.deepEqual((await readdir(dir)).sort(), ["scoreboard-stats.json", "scoreboard.json"], "Fotos und Skript sind weg");
  const saved = await readFile(path.join(dir, "scoreboard-stats.json"), "utf8");
  assert.doesNotMatch(saved, /Gegner/, "keine Daten anderer Spieler");
  assert.equal(sb.state().last.values.kills, 5);
  await sb.reset();
  assert.deepEqual(await readdir(dir), []);
});

test("Scoreboard: kein Scoreboard erkannt → verständlicher Fehler, Fotos trotzdem gelöscht", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-scoreboard-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tools = fakeTools({ ocr: { width: 1920, height: 1080, words: [word("Hallo", 1, 1)] } });
  const sb = await createScoreboard({ dir, ffmpeg: "ffmpeg.exe", powershell: "powershell.exe", spawnProcess: tools.spawn });
  await sb.setSettings({ enabled: true, playerName: "KOALA" });
  await assert.rejects(sb.capture(), /Kein Scoreboard mit „KOALA“.*Tab/);
  assert.deepEqual(await readdir(dir), ["scoreboard.json"]);
  assert.match(sb.state().error, /Kein Scoreboard/);
});

test("Wardogs-Paket: API nur installiert, Entfernen löscht die Werte", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-wardogs-"));
  const { server, token } = await createCompanion({ dataDir: dir, detectTools: async () => ({ cs2: "" }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const post = (route, body) => fetch(base + route, { method: "POST", headers, body: JSON.stringify(body) });
  assert.match((await (await post("/api/wardogs/settings", { playerName: "KOALA" })).json()).error, /nicht installiert/);
  assert.equal((await post("/api/games/install", { id: "wardogs" })).status, 200);
  const on = await (await post("/api/wardogs/settings", { enabled: true, playerName: "KOALA" })).json();
  assert.equal(on.scoreboard.enabled, true);
  assert.match(on.message, /Strg\+Alt\+S/);
  const capture = await post("/api/wardogs/capture", {});
  assert.equal(capture.status, 400);
  assert.match((await capture.json()).error, /Windows-Companion/);
  const state = await (await fetch(base + "/api/state", { headers })).json();
  assert.equal(state.scoreboard.playerName, "KOALA");
  assert.equal((await post("/api/games/remove", { id: "wardogs", confirm: true })).status, 200);
  assert.equal((await (await fetch(base + "/api/state", { headers })).json()).scoreboard, null);
  await post("/api/games/install", { id: "wardogs" });
  assert.equal((await (await fetch(base + "/api/wardogs/scoreboard", { headers })).json()).scoreboard.playerName, "", "Werte wurden gelöscht");
});
