import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, appendFile, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  parseChatLine, detectLanguage, modelsFor, cleanSay, chatCfg, keysCfg, consoleLogPath, createTail, lineTime, sourceText,
  ensureEngine, ensureModel, createChatTranslator, LANGUAGES, CHAT_OVERLAY_NOTICE_VERSION, SAY_MAX,
} from "../chat-translate.mjs";
import { CHAT_MODELS } from "../chat-models.mjs";
import { CHAT_LAUNCH_URL, cleanLaunchOptions, launchUrl } from "../chat-translate.mjs";

test("Fester Steam-Startlink mit -condebug", () => {
  assert.equal(CHAT_LAUNCH_URL, "steam://run/730//%2Bcl_input_enable_raw_keyboard%20true%20-condebug/");
  assert.equal(cleanLaunchOptions("-novid +fps_max 400"), "-novid +fps_max 400 -condebug");
  assert.equal(cleanLaunchOptions("-condebug -high"), "-condebug -high");
  assert.equal(cleanLaunchOptions(""), "-condebug");
  for (const bad of ['-x "a b"', "-x; quit", "+exec /etc/x", "-x\\..\\y", "+connect 1.2.3.4/x", "novid", "-x `y`", "a".repeat(400)])
    assert.throws(() => cleanLaunchOptions(bad), undefined, bad);
  assert.equal(launchUrl("-novid"), "steam://run/730//-novid%20-condebug/");
});

test("Chatzeilen aus console.log", () => {
  assert.deepEqual(parseChatLine("[ALL] KOALA\u200e: gg wp"), { channel: "all", team: "", dead: false, location: "", name: "KOALA", text: "gg wp" });
  const team = parseChatLine("11/22 15:30:01  [CT] Ivan\u200e [DEAD] @ B Site: давай быстрее на б");
  assert.equal(team.channel, "team");
  assert.equal(team.team, "ct");
  assert.equal(team.dead, true);
  assert.equal(team.location, "B Site");
  assert.equal(team.name, "Ivan");
  assert.equal(team.text, "давай быстрее на б");
  // Echte Team-Zeile aus CS2 (22.11.2026): Ort hinter „﹫“ (U+FE6B), Windows-Zeilenende.
  assert.deepEqual(parseChatLine("11/22 19:56:34  [T] HyperMarkus\u200e\uFE6BT Start: smoke mıd atıcam\r"),
    { channel: "team", team: "t", dead: false, location: "T Start", name: "HyperMarkus", text: "smoke mıd atıcam" });
  assert.equal(parseChatLine("11/22 19:56:34  [CT] Ivan\u200e [DEAD] \uFE6BB Site: go").location, "B Site");
  assert.equal(parseChatLine("[T] Ohne Mark \uFE6BMid: rush").name, "Ohne Mark");
  // Name mit Doppelpunkt: das Richtungszeichen trennt eindeutig.
  assert.equal(parseChatLine("[T] a: b\u200e: hallo").name, "a: b");
  assert.equal(parseChatLine("[ALL] Player *DEAD*: nice").dead, true);
  assert.equal(parseChatLine("[ALLE] Spieler: servus").channel, "all");
  // Andere Konsolenzeilen sind kein Chat.
  for (const line of ["[Client] connected", "ConVar foo: 1", "[NetSteamConn] Ping: 20", "", "[ALL] : leer", "x".repeat(700)])
    assert.equal(parseChatLine(line), null, line.slice(0, 30));
  // Steuerzeichen und unsichtbare Zeichen verschwinden.
  assert.equal(parseChatLine("[ALL] A\u200e: hi\u202ethere\x07").text, "hithere");
});

test("Sprache erkennen", () => {
  assert.equal(detectLanguage("давай быстрее на б"), "ru");
  assert.equal(detectLanguage("я тут, їх двоє"), "uk");
  assert.equal(detectLanguage("ich bin B, kommt alle"), "de");
  assert.equal(detectLanguage("hola amigos, vamos a"), "es");
  assert.equal(detectLanguage("you guys are so bad"), "en");
  assert.equal(detectLanguage("rush b no stop"), "en");
  assert.equal(detectLanguage("3 kısı ıle mi"), "tr");
  assert.equal(detectLanguage("AFERİN SANA"), "tr");
  assert.equal(detectLanguage("Dobra robota, idziemy na B"), "pl");
  assert.equal(detectLanguage("gg"), "");
  assert.equal(detectLanguage("ez"), "");
  assert.equal(detectLanguage("xyz qwe rty", { assumeEnglish: false }), "");
});

test("Modelle direkt oder über Englisch", () => {
  assert.deepEqual(modelsFor("de", "en"), ["deen"]);
  assert.deepEqual(modelsFor("ru", "de"), ["ruen", "ende"]);
  assert.deepEqual(modelsFor("de", "de"), []);
  assert.deepEqual(modelsFor("pl", "de"), ["plen", "ende"]);
  assert.deepEqual(modelsFor("nl", "de"), []);
  for (const from of Object.keys(LANGUAGES)) for (const to of Object.keys(LANGUAGES))
    if (from !== to) assert.ok(modelsFor(from, to).length, `${from}→${to}`);
  for (const [key, files] of Object.entries(CHAT_MODELS)) {
    assert.match(key, /^[a-z]{4}$/);
    for (const [part, info] of Object.entries(files)) {
      if (part === "config") continue;
      assert.match(info.url, /^https:\/\/(?:bergamot\.s3\.amazonaws\.com\/models\/[a-z]{4}\/[\w.]+|firefox-settings-attachments\.cdn\.mozilla\.net\/main-workspace\/translations-models\/[0-9a-f-]+\.(?:bin|spm))$/);
      assert.match(info.sha256, /^[0-9a-f]{64}$/);
      assert.ok(info.size > 0 && info.size < 40 * 1024 * 1024);
    }
  }
});

test("Antwort-cfg ist bereinigt und kann keine Befehle anhängen", () => {
  assert.equal(cleanSay('hi"; quit; "x'), "hi'' quit' 'x");
  assert.equal(cleanSay("a\nbind x quit"), "a bind x quit");
  assert.equal(cleanSay("http://x"), "http:/x");
  assert.equal(cleanSay("x".repeat(500)).length, SAY_MAX);
  const cfg = chatCfg('привет "друг"; disconnect', false);
  assert.match(cfg, /\nsay "привет 'друг'' disconnect"\n$/);
  assert.equal(cfg.split("\n").filter((l) => l && !l.startsWith("//")).length, 1);
  assert.match(chatCfg("hi", true), /\nsay_team "hi"\n/);
  assert.equal(chatCfg("   ", false), "");
  const keys = keysCfg({ all: "F6", team: "F6" });
  assert.match(keys, /bind "F6" "exec tecmon_chat_all"/);
  assert.match(keys, /bind "F8" "exec tecmon_chat_team"/);
  assert.doesNotMatch(keysCfg({ all: "mouse1; quit" }), /quit/);
  assert.match(consoleLogPath(path.join("x", "game", "bin", "win64", "cs2.exe")), /csgo[\\/]console\.log$/);
  assert.equal(consoleLogPath("C:\\x\\notcs2.exe"), "");
});

test("console.log mitlesen: nur neue Zeilen, Neustart von vorn", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-tail-"));
  const file = path.join(dir, "console.log");
  await writeFile(file, "[ALL] alt: vorher\n");
  const lines = [];
  const tail = createTail(file, (l) => lines.push(l));
  await tail.poll();
  assert.deepEqual(lines, []);
  await appendFile(file, "[ALL] a: eins\n[ALL] b: zw");
  await tail.poll();
  assert.deepEqual(lines, ["[ALL] a: eins"]);
  await appendFile(file, "ei\n");
  await tail.poll();
  assert.deepEqual(lines, ["[ALL] a: eins", "[ALL] b: zwei"]);
  await writeFile(file, "[ALL] c: neu\n");
  await tail.poll();
  assert.equal(lines.at(-1), "[ALL] c: neu");
});

test("console.log nach dem Start: die letzten Bytes kommen als „alt“, dann nur Neues", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-tail-"));
  const file = path.join(dir, "console.log");
  await writeFile(file, "x".repeat(100) + "\n11/22 19:35:42  [ALL] a: alt\n");
  const seen = [];
  const tail = createTail(file, (l, old) => seen.push([l, old]), { backlog: 40 });
  await tail.poll();
  assert.deepEqual(seen, [["11/22 19:35:42  [ALL] a: alt", true]]);
  await appendFile(file, "[ALL] b: neu\n");
  await tail.poll();
  assert.deepEqual(seen.at(-1), ["[ALL] b: neu", false]);
});

test("Echte CS2-Zeilen mit Windows-Zeilenende (\\r\\n) werden erkannt", async () => {
  assert.deepEqual(parseChatLine("11/22 19:41:23  [ALL] User34\u200e: Kesssss :D\r"), { channel: "all", team: "", dead: false, location: "", name: "User34", text: "Kesssss :D" });
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-tail-"));
  const file = path.join(dir, "console.log");
  await writeFile(file, "");
  const chats = [];
  const tail = createTail(file, (l) => { const c = parseChatLine(l); if (c) chats.push(c.text); });
  await tail.poll();
  await appendFile(file, "11/22 19:41:02  [ALL] User34\u200e: Kudurmayın :D\r\n11/22 19:41:15 [SteamNetSockets] x\r\n11/22 19:41:19  [ALL] JİAÇED\u200e: BİZİM\r\n");
  await tail.poll();
  assert.deepEqual(chats, ["Kudurmayın :D", "BİZİM"]);
});

test("Zeitstempel aus console.log", () => {
  const now = new Date(2026, 10, 22, 19, 36, 0).getTime();
  assert.equal(lineTime("11/22 19:35:48  [ALL] Barut721\u200e: AFERİN SANA", now), new Date(2026, 10, 22, 19, 35, 48).getTime());
  assert.equal(lineTime("12/31 23:59:00  x", new Date(2027, 0, 1, 0, 0, 30).getTime()), new Date(2026, 11, 31, 23, 59, 0).getTime());
  assert.ok(Number.isNaN(lineTime("[ALL] a: b", now)));
});

function fakeResponse(bytes) {
  return { ok: true, status: 200, body: (async function* () { yield bytes; })() };
}

test("Engine und Modelle nur mit fester Prüfsumme", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-bergamot-"));
  await assert.rejects(ensureEngine(dir, async () => fakeResponse(Buffer.from("falsch"))), /Prüfsumme/);
  assert.deepEqual((await readdir(dir)).filter((n) => !n.startsWith(".")), []);
  await assert.rejects(ensureModel(dir, "deen", async () => fakeResponse(Buffer.from("falsch"))), /Prüfsumme/);
  await assert.rejects(ensureModel(dir, "nlen", async () => fakeResponse(Buffer.alloc(1))), /kein Übersetzungsmodell/);
});

/** Unechte Engine: „übersetzt“ als [from>to]Text, damit der Ablauf ohne Download prüfbar ist. */
async function translatorWithFakes(dir, cs2Exe) {
  const files = new Map();
  for (const key of Object.keys(CHAT_MODELS)) for (const [part, info] of Object.entries(CHAT_MODELS[key])) if (part !== "config") files.set(info.url, info);
  const calls = [];
  const fakeModelBytes = new Map();
  const request = async (url) => {
    calls.push(url);
    if (!fakeModelBytes.has(url)) throw new Error("kein Netz im Test");
    return fakeResponse(fakeModelBytes.get(url));
  };
  // Modelldateien vorab mit passender Größe/Prüfsumme „cachen“: Prüfsummen lassen sich nicht fälschen,
  // darum wird ensureModel hier über vorhandene Dateien umgangen (registry wird von der Engine nur gelesen).
  const loadEngine = async () => ({
    TranslatorBacking: class { constructor() { this.registry = this.loadModelRegistery(); this.models = new Map(); } },
    BatchTranslator: class {
      constructor(_o, backing) { this.backing = backing; }
      async translate({ from, to, text }) { return { target: { text: `[${from}>${to}]${text}` } }; }
      delete() {}
    },
  });
  const chat = await createChatTranslator({ dir, cacheDir: dir, cs2Exe, request, loadEngine });
  return { chat, calls };
}

test("Chat-Übersetzer: aus, an, Nachrichten, Antwort-cfg, Reset", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecmon-chat-"));
  const exe = path.join(root, "game", "bin", "win64", "cs2.exe");
  const cfg = path.join(root, "game", "csgo", "cfg");
  await mkdir(path.dirname(exe), { recursive: true });
  await mkdir(cfg, { recursive: true });
  const { chat } = await translatorWithFakes(path.join(root, "profil"), exe);
  assert.equal(chat.state().enabled, false);
  assert.equal(chat.state().condebug, "off");
  await assert.rejects(chat.setSettings({ overlay: true }), /Hinweis/);
  let state = await chat.setSettings({ enabled: true, language: "de" });
  assert.equal(state.enabled, true);
  assert.equal(state.condebug, "missing");
  assert.ok(existsSync(path.join(cfg, "tecmon_chat_keys.cfg")));
  state = await chat.setSettings({ overlay: true, accept: CHAT_OVERLAY_NOTICE_VERSION });
  assert.equal(state.overlay, true);
  // Kopfzeile steht auch ohne Nachrichten und sagt, warum noch nichts kommt.
  assert.deepEqual(chat.overlayHeader(), { text: "TECMON CHAT · kein Chat-Log: CS2 über TecMon mit -condebug starten", warn: true });

  chat.feed("[ALL] Hans\u200e: ich bin B");
  chat.feed("[ALL] Ivan\u200e: давай быстрее на б");
  chat.feed("[ALL] Kim\u200e: gg");
  chat.feed("[Client] keine Chatzeile");
  // Modelle fehlen und der Test hat kein Netz: Fehler wird pro Nachricht gezeigt, nichts stürzt ab.
  await chat.idle();
  const list = chat.messages();
  assert.equal(list.length, 3);
  assert.equal(list.find((m) => m.name === "Hans").status, "same");
  assert.equal(list.find((m) => m.name === "Kim").status, "unknown");
  const ivan = list.find((m) => m.name === "Ivan");
  assert.equal(ivan.lang, "ru");
  assert.equal(ivan.status, "error");
  assert.equal(chat.state().replyLanguage, "ru");
  assert.equal(chat.overlayLines().length, 3);
  // Sprechblase: nur fertig übersetzte Zeilen, Schalter wird gespeichert.
  assert.equal(chat.state().bubble, false);
  assert.deepEqual(chat.bubbleLines(), []);
  assert.equal((await chat.setSettings({ bubble: true })).bubble, true);
  assert.equal(chat.state().window, false);
  assert.equal((await chat.setSettings({ window: true })).window, true);
  assert.equal(JSON.parse(await readFile(path.join(root, "profil", "chat-translate.json"), "utf8")).bubble, true);

  // Antwort in der eigenen Sprache braucht keine Übersetzung und landet als cfg.
  const same = await chat.reply({ text: 'Hallo "zusammen"; quit', to: "de", team: true });
  assert.equal(same.written, true);
  assert.equal(same.key, "F8");
  assert.match(await readFile(path.join(cfg, "tecmon_chat_team.cfg"), "utf8"), /say_team "Hallo 'zusammen'' quit"/);
  await assert.rejects(chat.reply({ text: "  " }), /Nachricht/);
  await assert.rejects(chat.reply({ text: "hi", to: "nl" }), /Zielsprache/);

  // Während einer Aufnahme kommen Demo-Chats: ignorieren.
  chat.pause(true);
  chat.feed("[ALL] Demo\u200e: hello there friends");
  assert.equal(chat.messages().length, 3);
  chat.pause(false);

  await chat.reset();
  assert.equal(chat.state().enabled, false);
  assert.equal(chat.messages().length, 0);
  for (const name of ["tecmon_chat_team.cfg", "tecmon_chat_keys.cfg"]) assert.equal(existsSync(path.join(cfg, name)), false);
  chat.close();
});

test("Chat-Übersetzer übersetzt mit geprüften Modellen (unechte Engine)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecmon-chat2-"));
  const exe = path.join(root, "game", "bin", "win64", "cs2.exe");
  await mkdir(path.join(root, "game", "csgo", "cfg"), { recursive: true });
  // Modelldateien mit passenden Prüfsummen lassen sich nicht erzeugen; deshalb prüft dieser Test den
  // Ablauf mit einer Liste, die der Test selbst kennt.
  const bytes = Buffer.from("modell");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const original = structuredClone(CHAT_MODELS);
  for (const key of ["ruen", "ende", "deen", "enru"])
    for (const part of Object.keys(CHAT_MODELS[key])) if (part !== "config") Object.assign(CHAT_MODELS[key][part], { size: bytes.length, sha256: hash });
  try {
    const request = async () => fakeResponse(bytes);
    const loadEngine = async () => ({
      TranslatorBacking: class { constructor() { this.registry = this.loadModelRegistery(); this.models = new Map(); } },
      BatchTranslator: class { constructor(_o, backing) { this.backing = backing; } async translate({ from, to, text }) { return { target: { text: `[${from}>${to}]${text}` } }; } },
    });
    const chat = await createChatTranslator({ dir: path.join(root, "p"), cacheDir: path.join(root, "c"), cs2Exe: exe, request, loadEngine });
    await chat.setSettings({ enabled: true });
    chat.feed("[ALL] Ivan\u200e: давай быстрее");
    await chat.idle();
    const [ivan] = chat.messages();
    assert.equal(ivan.status, "done", ivan.error);
    assert.equal(ivan.translated, "[ru>de]давай быстрее");
    assert.deepEqual(chat.bubbleLines().map(({ name, text, channel }) => ({ name, text, channel })), [{ name: "Ivan", text: "[ru>de]давай быстрее", channel: "all" }]);
    const answer = await chat.reply({ text: "Ich komme" });
    assert.equal(answer.to, "ru");
    assert.equal(answer.text, "[de>ru]Ich komme");
    assert.ok(existsSync(path.join(root, "c", "chat-models", "ruen", "model.ruen.intgemm.alphas.bin")));
    chat.close();
  } finally {
    for (const key of Object.keys(original)) CHAT_MODELS[key] = original[key];
  }
});

test("Großbuchstaben-Rufe vor dem Übersetzen klein, Türkisch mit richtigem i", () => {
  assert.equal(sourceText("AFERİN SANA", "tr"), "aferin sana");
  assert.equal(sourceText("TRUST ME", "en"), "trust me");
  assert.equal(sourceText("Nice Shot", "en"), "Nice Shot");
});

test("Türkisch und Polnisch: Modelle mit fester Prüfsumme, über Englisch nach Deutsch", () => {
  assert.deepEqual(modelsFor("tr", "de"), ["tren", "ende"]);
  assert.deepEqual(modelsFor("de", "pl"), ["deen", "enpl"]);
  for (const key of ["tren", "entr", "plen", "enpl"]) for (const part of ["model", "lex", "vocab"]) {
    const info = CHAT_MODELS[key][part];
    assert.match(info.url, /^https:\/\/firefox-settings-attachments\.cdn\.mozilla\.net\/main-workspace\/translations-models\/[0-9a-f-]+\.(?:bin|spm)$/);
    assert.match(info.sha256, /^[0-9a-f]{64}$/);
    assert.ok(info.size > 100000 && info.size < 40 * 1024 * 1024);
  }
});
