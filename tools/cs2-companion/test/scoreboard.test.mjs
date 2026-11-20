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
  readMoney,
  columnOf,
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

/**
 * Wardogs-„PUNKTELISTE“ mit den Koordinaten aus echten Screenshots (1920×1080): zweizeilige
 * Kopfzeile, abgeschnittenes „WIEDERBELEBUN…“, „VERDIENTES GELD“ aus zwei Wörtern, „$“ als
 * „8“/„s“ verlesen, Kontostand oben rechts, RELAY-Kennung auch in der eigenen Zeile.
 */
function wardogs({ name = "KOALA", relay = "2EP2-NOY" } = {}) {
  const words = [
    word("PUNKTELISTE", 317, 11, 120), word("|", 1704, 11, 4), word("$6685", 1714, 11, 60), word("|", 1804, 11, 4),
    word("RELAY", 1497, 206, 50), word("96", 1528, 192, 20), word(relay, 1530, 206, 80),
    word('"WIEDERBELEBUN!', 1456, 252, 130),
    word("SPIELER", 761, 266, 70), word("VERDIENTES", 894, 266, 85), word("GELD", 984, 266, 40),
    word("TÖTUNGEN", 1086, 266, 80), word("ASSISTS", 1243, 266, 65), word("TODESFÄLLE", 1354, 266, 90),
    word("a", 325, 330, 10), word("Psychomyco007", 478, 330, 120), word("36ms", 759, 330, 40),
    word("89.501", 889, 330, 55), word("4", 1084, 330, 10), word("1", 1250, 330, 10), word("3", 1367, 330, 10), word("2", 1460, 330, 10),
    word("eos500", 454, 402, 60), word("$8.429", 888, 402, 55),
    word("Colonia", 462, 513, 70), word("$7.321", 890, 513, 55),
    word("[TCMN]", 419, 699, 60), word(name, 494, 699, 60), word("2eP2-Noy", 669, 699, 70), word("45ms", 759, 699, 40),
    word("82.413", 889, 699, 55), word("0", 1084, 699, 10), word("0", 1250, 699, 10), word("1", 1366, 699, 10), word("0", 1460, 699, 10),
    word("Cyborg3000", 421, 925, 90), word("so", 902, 937, 20),
  ];
  return { width: 1920, height: 1080, words };
}

test("Wardogs: deutsche, abgeschnittene und zweizeilige Spaltenköpfe", () => {
  assert.equal(columnOf("TÖTUNGEN"), "kills");
  assert.equal(columnOf("TODESFÄLLE"), "deaths");
  assert.equal(columnOf("WIEDERBELEBUN:"), "revives", "abgeschnitten");
  assert.equal(columnOf("VERDIENTES"), "money");
  assert.equal(columnOf("PUNKTELISTE"), "", "Überschrift ist keine Punkte-Spalte");
  assert.equal(readMoney("82.413"), 2413, "$ als 8 gelesen");
  assert.equal(readMoney("so"), 0, "$0 als so gelesen");
  assert.equal(readMoney("$8.429"), 8429);
  assert.equal(readMoney("s485"), 485);
});

test("Wardogs: eigene Zeile aus echtem Layout, Kontostand oben rechts", () => {
  const parsed = parseScoreboard(wardogs(), "KOALA");
  assert.deepEqual(parsed.values, { money: 2413, kills: 0, assists: 0, deaths: 1, revives: 0, cash: 6685 });
  assert.equal(parsed.moneySource, "scoreboard");
  assert.equal(parsed.confidence, 1);
  assert.equal(summary(parsed.values), "Kills 0 · Tode 1 · Assists 0 · Wiederbelebungen 0 · Geld 2413 · Kontostand 6685");
});

test("Wardogs: Name unlesbar → eigene Zeile über die RELAY-Kennung, nur wenn eindeutig", () => {
  const parsed = parseScoreboard(wardogs({ name: "K#@!%" }), "KOALA");
  assert.equal(parsed.matchedBy, "relay");
  assert.equal(parsed.values.deaths, 1);
  assert.ok(parsed.confidence < 1);
  assert.equal(parseScoreboard(wardogs({ name: "K#@!%", relay: "ZZZZ-999" }), "KOALA"), null, "andere Kennung → nichts raten");
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
