import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, appendFile, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  parseChatLine, detectLanguage, modelsFor, keepEmotes, sameText, MAX_LOADED_MODELS, cleanSay, chatCfg, keysCfg, consoleLogPath, createTail, lineTime, sourceText,
  ensureEngine, ensureModel, patchEngineFile, ENGINE_PATCH, cleanLook, CHAT_LOOK_DEFAULT, createChatTranslator, LANGUAGES, CHAT_OVERLAY_NOTICE_VERSION, SAY_MAX,
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
  // Echte Zeile vom 22.11.2026: Kyrillisch mit Umschrift in Klammern.
  assert.equal(detectLanguage("Ты хороший игрок. (Ty khoroshiy igrok)"), "ru");
  assert.equal(detectLanguage("я тут, їх двоє"), "uk");
  assert.equal(detectLanguage("ich bin B, kommt alle"), "de");
  assert.equal(detectLanguage("hola amigos, vamos a"), "es");
  assert.equal(detectLanguage("you guys are so bad"), "en");
  assert.equal(detectLanguage("rush b no stop"), "en");
  assert.equal(detectLanguage("3 kısı ıle mi"), "tr");
  // Echte Zeilen vom 23.11.2026: Englisch mit türkischer Tastatur und türkischer Chat-Slang.
  assert.equal(detectLanguage("fuck your aımbot"), "en");
  assert.equal(detectLanguage("why cheatıng"), "en");
  assert.equal(detectLanguage("naber"), "tr");
  assert.equal(detectLanguage("anani sikeyim"), "tr");
  assert.equal(detectLanguage("Anani sikeyim amk"), "tr");
  assert.equal(detectLanguage("siktir git"), "tr");
  assert.equal(detectLanguage("nasılsın?"), "tr");
  assert.equal(detectLanguage("AFERİN SANA"), "tr");
  assert.equal(detectLanguage("Dobra robota, idziemy na B"), "pl");
  // Seit 0.47.0: alle Sprachen der Firefox-Modelle (Schrift oder typische Wörter/Buchstaben).
  const samples = {
    nl: "ik ben niet goed vandaag jongens", af: "ek is baie lekker, dankie", da: "jeg ved ikke hvad vi skal", nb: "jeg vet ikke hva vi skal",
    sv: "jag vet inte vad vi ska göra", fi: "en tiedä mitä teen, kiitos", is: "ég veit ekki hvað við gerum", lt: "aš nežinau kur eiti, ačiū",
    lv: "es nezinu kur iet, paldies", hu: "nem tudom hol vagyok srácok", ro: "nu știu unde sunt frate", sk: "neviem kde som, ďakujem",
    sl: "ne vem kje sem, hvala", hr: "ne znam gdje sam brate", sr: "šta radiš ovde bre", sq: "nuk e di ku jam vëlla",
    ca: "no sé on sóc, gràcies", gl: "non sei onde estou, grazas", eu: "ez dakit non nago, eskerrik asko", az: "mən bilmirəm harada",
    id: "aku tidak tahu kenapa", ms: "saya tak tahu kenapa", tl: "hindi ko alam bakit pre", vi: "tôi không biết tại sao",
    et: "aitäh, ma olen siin", el: "καλό παιχνίδι", ar: "لعبة جيدة يا شباب", fa: "بازی خوبی بود رفیق", ur: "اچھا کھیل ہے بھائی",
    ug: "ياخشى ئويۇن", he: "משחק טוב חברים", th: "เกมดีมาก", ko: "잘했어 친구들", ja: "いいゲームでした", zh: "打得好兄弟",
    hi: "अच्छा खेल भाई", mr: "मी आहे इथे", bn: "ভালো খেলা", gu: "સારી રમત", ta: "நல்ல விளையாட்டு", te: "మంచి ఆట", kn: "ಒಳ್ಳೆಯ ಆಟ",
    ml: "നല്ല കളി", be: "добрая гульня, дзякуй ўсім", bg: "какво правиш, много добре",
  };
  for (const [lang, text] of Object.entries(samples)) assert.equal(detectLanguage(text), lang, text);
  assert.equal(detectLanguage("добра игра, ђе си"), "sr");
  assert.equal(detectLanguage("gg"), "");
  assert.equal(detectLanguage("ez"), "");
  assert.equal(detectLanguage("xyz qwe rty", { assumeEnglish: false }), "");
});

test("Modelle direkt oder über Englisch", () => {
  assert.deepEqual(modelsFor("de", "en"), ["deen"]);
  assert.deepEqual(modelsFor("ru", "de"), ["ruen", "ende"]);
  assert.deepEqual(modelsFor("de", "de"), []);
  assert.deepEqual(modelsFor("pl", "de"), ["plen", "ende"]);
  assert.deepEqual(modelsFor("nl", "de"), ["nlen", "ende"]);
  assert.deepEqual(modelsFor("ja", "zh"), ["jaen", "enzh"]);
  assert.deepEqual(modelsFor("xx", "de"), []);
  for (const from of Object.keys(LANGUAGES)) for (const to of Object.keys(LANGUAGES))
    if (from !== to) assert.ok(modelsFor(from, to).length, `${from}→${to}`);
  for (const [key, files] of Object.entries(CHAT_MODELS)) {
    assert.match(key, /^[a-z]{4}$/);
    for (const [part, info] of Object.entries(files)) {
      if (part === "config") continue;
      assert.match(info.url, /^https:\/\/(?:bergamot\.s3\.amazonaws\.com\/models\/[a-z]{4}\/[\w.]+|firefox-settings-attachments\.cdn\.mozilla\.net\/main-workspace\/translations-models\/[0-9a-f-]+\.(?:bin|spm))$/);
      assert.match(info.sha256, /^[0-9a-f]{64}$/);
      assert.ok(info.size > 0 && info.size < 80 * 1024 * 1024);
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
  // Ein kyrillisches Zeichen (2 Bytes), das genau zwischen zwei Lesevorgängen geteilt ist.
  const bytes = Buffer.from("[ALL] d: игрок\n", "utf8");
  await appendFile(file, bytes.subarray(0, 10));
  await tail.poll();
  await appendFile(file, bytes.subarray(10));
  await tail.poll();
  assert.equal(lines.at(-1), "[ALL] d: игрок");
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
  await assert.rejects(ensureModel(dir, "xxen", async () => fakeResponse(Buffer.alloc(1))), /kein Übersetzungsmodell/);
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
  // Aussehen: nur geprüfte Zahlen und feste Farben, Zeilen und Anzeigedauer gelten für das Overlay.
  const look = (await chat.setSettings({ look: { width: 50, lines: 2, font: 99, color: "lila", seconds: 1 } })).look;
  assert.deepEqual(look, { width: 50, lines: 2, font: 32, color: "lila", background: 30, seconds: 5 });
  assert.equal(chat.overlayLines().length, 2);
  assert.equal((await chat.setSettings({ look: { color: "#ff0000" } })).look.color, "lila");
  assert.equal(JSON.parse(await readFile(path.join(root, "profil", "chat-translate.json"), "utf8")).bubble, true);

  // Antwort in der eigenen Sprache braucht keine Übersetzung und landet als cfg.
  const same = await chat.reply({ text: 'Hallo "zusammen"; quit', to: "de", team: true });
  assert.equal(same.written, true);
  assert.equal(same.key, "F8");
  assert.match(await readFile(path.join(cfg, "tecmon_chat_team.cfg"), "utf8"), /say_team "Hallo 'zusammen'' quit"/);
  await assert.rejects(chat.reply({ text: "  " }), /Nachricht/);
  await assert.rejects(chat.reply({ text: "hi", to: "xx" }), /Zielsprache/);

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
    assert.equal(ivan.translated, "[ru>de]Давай быстрее");
    assert.deepEqual(chat.bubbleLines().map(({ name, text, channel }) => ({ name, text, channel })), [{ name: "Ivan", text: "[ru>de]Давай быстрее", channel: "all" }]);
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
  assert.equal(sourceText("AFERİN SANA", "tr"), "Aferin sana");
  assert.equal(sourceText("TRUST ME", "en"), "Trust me");
  // Klein beginnende Fragen ergaben doppelte Ausgaben, Abkürzungen kennt das Modell nicht (Chat 23.11.2026).
  assert.equal(sourceText("nasılsın?", "tr"), "Nasılsın?");
  assert.equal(sourceText("naber kanka", "tr"), "Ne haber kanka");
  assert.equal(sourceText("anani sikeyim", "tr"), "Ananı sikeyim");
  assert.equal(sourceText("Naber", "tr"), "Ne haber?");
  assert.equal(sourceText("¿naber?", "tr"), "¿Ne haber?");
  assert.equal(sourceText("naber", "en"), "Naber");
  assert.equal(sourceText("naber", "tr"), "Ne haber?");
  assert.equal(sourceText("hadi gidelim B ye", "tr"), "Hadi gidelim B'ye");
  assert.equal(sourceText("fuck your aımbot", "en"), "Fuck your aimbot");
  assert.equal(sourceText("chat ? i wanne test, i'm here", "en"), "Chat ? I wanne test, I'm here");
  assert.equal(sourceText("ok. ich bin da", "de"), "Ok. Ich bin da");
  assert.equal(sourceText("Nice Shot", "en"), "Nice Shot");
});

test("Türkisch und Polnisch: Modelle mit fester Prüfsumme, über Englisch nach Deutsch", () => {
  assert.deepEqual(modelsFor("tr", "de"), ["tren", "ende"]);
  assert.deepEqual(modelsFor("de", "pl"), ["deen", "enpl"]);
  for (const key of ["tren", "entr", "plen", "enpl"]) for (const part of ["model", "lex", "vocab"]) {
    const info = CHAT_MODELS[key][part];
    assert.match(info.url, /^https:\/\/firefox-settings-attachments\.cdn\.mozilla\.net\/main-workspace\/translations-models\/[0-9a-f-]+\.(?:bin|spm)$/);
    assert.match(info.sha256, /^[0-9a-f]{64}$/);
    assert.ok(info.size > 100000 && info.size < 80 * 1024 * 1024);
  }
});

test("Bergamot-Worker: Windows-Pfad zur .wasm wird genau an einer Stelle repariert", () => {
  // Ausschnitt aus worker/translator-worker.js von Bergamot 0.4.9: url.pathname ergibt unter Windows „/C:/…“.
  const original = Buffer.from("if (url.protocol === 'file:') {\n  const buffer = await readFile(url.pathname);\n}");
  const patched = patchEngineFile(ENGINE_PATCH.file, original).toString();
  assert.match(patched, /fileURLToPath\(url\)/);
  assert.doesNotMatch(patched, /readFile\(url\.pathname\)/);
  // Andere Dateien bleiben unverändert, eine unerwartete Engine bricht ab.
  assert.equal(patchEngineFile("translator.js", original), original);
  assert.throws(() => patchEngineFile(ENGINE_PATCH.file, Buffer.from("anders")), /unerwartet/);
  assert.throws(() => patchEngineFile(ENGINE_PATCH.file, Buffer.concat([original, original])), /unerwartet/);
});

test("Aussehen des Chat-Fensters wird begrenzt", () => {
  assert.deepEqual(cleanLook(), CHAT_LOOK_DEFAULT);
  assert.deepEqual(cleanLook({ width: 5, lines: 40, font: "18", background: -3, seconds: 9999, color: "x" }),
    { width: 15, lines: 15, font: 18, color: "weiss", background: 0, seconds: 600 });
  assert.equal(cleanLook({ width: "abc" }).width, 30);
});

test("Smileys bleiben, unveränderte Ausgaben gelten nicht als Übersetzung (Chat 23.11.2026)", () => {
  assert.equal(keepEmotes("write me please something in your language :D", "Schreibe mir bitte etwas in deiner Sprache:"), "Schreibe mir bitte etwas in deiner Sprache :D");
  assert.equal(keepEmotes(":D hi xD <3", "Hallo"), ":D Hallo xD <3");
  assert.equal(keepEmotes("hi 😂😂", "Hallo 😂😂"), "Hallo 😂😂");
  assert.equal(keepEmotes("ok", "Ok"), "Ok");
  assert.equal(sameText("gristdi oide wuaschthaud", "Gristdi oide wuaschthaud."), true);
  assert.equal(sameText("merhaba", "Hi"), false);
  assert.equal(detectLanguage("ficken dicken"), "de");
  assert.equal(detectLanguage("gegen"), "de");
});

test("Neue Modelle starten den Worker neu, Abstürze werden aufgefangen (Failed to allocate memory)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecmon-chat3-"));
  const exe = path.join(root, "game", "bin", "win64", "cs2.exe");
  await mkdir(path.join(root, "game", "csgo", "cfg"), { recursive: true });
  const bytes = Buffer.from("modell");
  const hash = createHash("sha256").update(bytes).digest("hex");
  const original = structuredClone(CHAT_MODELS);
  const keys = ["ruen", "ende", "esen", "iten", "plen", "pten"];
  for (const key of keys) for (const part of Object.keys(CHAT_MODELS[key])) if (part !== "config") Object.assign(CHAT_MODELS[key][part], { size: bytes.length, sha256: hash });
  try {
    const engines = [];
    let crash = false;
    const loadEngine = async () => ({
      TranslatorBacking: class { constructor() { this.models = new Map(); } },
      BatchTranslator: class {
        constructor(_o, backing) { this.backing = backing; this.deleted = false; this.models = backing.loadModelRegistery(); engines.push(this); }
        async translate({ from, to, text }) { if (crash) { crash = false; throw new Error("Failed to allocate memory on CPU"); } return { target: { text: `[${from}>${to}]${text}` } }; }
        delete() { this.deleted = true; }
      },
    });
    const chat = await createChatTranslator({ dir: path.join(root, "p"), cacheDir: path.join(root, "c"), cs2Exe: exe, request: async () => fakeResponse(bytes), loadEngine });
    await chat.setSettings({ enabled: true });
    const lines = ["[ALL] A\u200e: давай быстрее", "[ALL] B\u200e: hola amigos, vamos a", "[ALL] C\u200e: ciao andiamo bene", "[ALL] D\u200e: Dobra robota, idziemy na B", "[ALL] E\u200e: não você obrigado vamos"];
    for (const line of lines) { chat.feed(line); await chat.idle(); }
    assert.ok(chat.messages().every((m) => m.status === "done"), JSON.stringify(chat.messages()));
    // Jedes neue Modell: neuer Worker, der alte wird beendet; nie mehr als MAX_LOADED_MODELS geladen.
    assert.equal(engines.length, lines.length);
    assert.ok(engines.slice(0, -1).every((e) => e.deleted));
    const loaded = (await engines.at(-1).models).length;
    assert.ok(loaded <= MAX_LOADED_MODELS, String(loaded));
    // Absturz im Worker: Zeile meldet Fehler, die nächste läuft mit frischem Worker.
    crash = true;
    chat.feed("[ALL] E\u200e: não você obrigado vamos");
    await chat.idle();
    assert.equal(chat.messages()[0].status, "error");
    chat.feed("[ALL] E\u200e: não você obrigado vamos");
    await chat.idle();
    assert.equal(chat.messages()[0].status, "done");
    assert.equal(engines.length, lines.length + 1);
    chat.close();
    assert.ok(engines.at(-1).deleted);
  } finally {
    for (const key of Object.keys(original)) CHAT_MODELS[key] = original[key];
  }
});
