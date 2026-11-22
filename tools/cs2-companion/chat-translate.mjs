import path from "node:path";
import { existsSync } from "node:fs";
import { open, stat, readFile, writeFile, rename, mkdir, rm, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { tarEntries } from "./valve-download.mjs";
import { CHAT_MODELS } from "./chat-models.mjs";

/**
 * Chat-Übersetzer für CS2 (Funktion des CS2-Pakets, standardmäßig aus).
 *
 * CS2 schreibt mit der Startoption `-condebug` seine Konsole in `game/csgo/console.log`.
 * Der Companion liest nur diese Datei mit (ab dem Einschalten, nur neue Zeilen), erkennt
 * Chatzeilen und übersetzt sie lokal mit Bergamot (Firefox-Übersetzung, MPL-2.0, WebAssembly).
 * Kein Hook, kein Speicherzugriff, keine Eingaben ans Spiel. Chattexte verlassen den PC nie und
 * werden nicht gespeichert, nur im Arbeitsspeicher gehalten.
 *
 * Antworten: Der Spieler schreibt in TecMon, der Companion übersetzt und legt den Text in
 * eigene cfg-Dateien (`tecmon_chat_all.cfg`, `tecmon_chat_team.cfg`), die CS2 auf eine selbst
 * gesetzte Taste ausführt (`say`/`say_team`). Die Oberfläche kopiert ihn zusätzlich in die
 * Zwischenablage. Es werden nie Tasten simuliert.
 */

export const CHAT_HOTKEYS = ["F5", "F6", "F7", "F8", "F9", "F10", "F11"];
export const CHAT_FILES = ["tecmon_chat_all.cfg", "tecmon_chat_team.cfg", "tecmon_chat_keys.cfg"];
export const CHAT_SETUP_EXEC = "exec tecmon_chat_keys";
export const LANGUAGES = {
  de: "Deutsch", en: "Englisch", es: "Spanisch", fr: "Französisch", it: "Italienisch", pt: "Portugiesisch",
  ru: "Russisch", uk: "Ukrainisch", bg: "Bulgarisch", cs: "Tschechisch", et: "Estnisch",
};
export const MAX_MESSAGES = 40;
export const SAY_MAX = 120;
const NAME_MAX = 40;
const TEXT_MAX = 256;
const MAX_READ = 256 * 1024;

/** Unveränderliches npm-Paket der Bergamot-Engine, Prüfsumme aus der npm-Registry. */
export const ENGINE = {
  version: "0.4.9",
  url: "https://registry.npmjs.org/@browsermt/bergamot-translator/-/bergamot-translator-0.4.9.tgz",
  integrity: "sha512-bNuuCwM/JnsIYQCKXcYKFT4Qc5vLMoB8Nbvz8ReIgs7xzebK8Sa+R8iEK8mLvNBe/WaZ6zrPaUQilLsRT/ea8Q==",
};
const ENGINE_FILES = ["translator.js", "worker/translator-worker.js", "worker/bergamot-translator-worker.js", "worker/bergamot-translator-worker.wasm"];

export const CHAT_OVERLAY_NOTICE_VERSION = 1;
export const CHAT_OVERLAY_NOTICE = [
  "Das Chat-Overlay ist ein eigenes, durchklickbares TecMon-Fenster über der Stelle, an der CS2 den Chat zeigt. Es greift nicht in CS2 ein: kein Hook, keine Injektion, kein Speicherzugriff, keine Eingaben.",
  "Es erscheint nur, wenn CS2 im Modus „Vollbild-Fenstermodus“ läuft und im Vordergrund ist. Im echten Vollbild bleibt es aus; die Übersetzungen siehst du dann im Companion-Fenster.",
  "Valve hat solche Overlays bisher nicht mit VAC-Banns belegt. Eine Garantie gibt es dafür nicht, und andere Anti-Cheats oder Ligen (z. B. FACEIT, ESEA, Turniere) können Overlays verbieten. Dort schaltest du es bitte aus.",
  "Du nutzt das Overlay auf eigenes Risiko. TecMon haftet nicht für Sperren, Banns oder andere Folgen.",
];

/* ---------- Chatzeilen erkennen ---------- */

/** Kanal-Kennungen am Zeilenanfang: „[ALL]“ und übersetzte Varianten, Team als „[T]“/„[CT]“. */
const ALL_TAGS = ["ALL", "ALLE", "TODOS", "TOUS", "TUTTI", "WSZYSCY", "VŠICHNI", "HEPSİ", "ВСЕ", "ВСІ", "ВСИЧКИ"];
const TEAM_TAGS = { T: "t", CT: "ct", TT: "t", "Т": "t", "КТ": "ct" };
const SPEC_TAGS = ["SPEC", "ZUSCHAUER", "SPECTATOR", "НАБЛЮДАТЕЛЬ"];
const DEAD = /\s*(?:\[(?:DEAD|TOT|MUERTO|MORT|MORTO|МЁРТВ|МЕРТВ|МЕРТВИЙ)\]|\*(?:DEAD|TOT|MUERTO|MORT|MORTO|МЁРТВ|МЕРТВ)\*)\s*$/iu;
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g;

function cleanText(value, max) {
  return String(value || "").replace(INVISIBLE, "").replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Eine Zeile aus console.log zu `{ channel: "all"|"team"|"spec", team: "t"|"ct"|"", dead, location, name, text }`
 * oder null. CS2 schreibt etwa `[ALL] Name‎: Text` oder `[CT] Name‎ [DEAD] @ B Site: Text`
 * (mit `-condebug` oft mit Zeitstempel davor, nach dem Namen ein unsichtbares Richtungszeichen U+200E).
 */
export function parseChatLine(raw) {
  let line = String(raw || "").replace(/\r?\n$/, "");
  if (line.length > 600) return null;
  line = line.replace(/^\s*(?:L\s+)?\d{2}\/\d{2}(?:\/\d{4})?\s*(?:-\s*)?\d{2}:\d{2}:\d{2}(?:\.\d+)?:?\s+/, "");
  const head = line.match(/^\s*\[([^\]\s]{1,14})\]\s+(.+)$/u);
  if (!head) return null;
  const tag = head[1].toUpperCase();
  let channel = "", team = "";
  if (ALL_TAGS.includes(tag)) channel = "all";
  else if (TEAM_TAGS[tag]) { channel = "team"; team = TEAM_TAGS[tag]; }
  else if (SPEC_TAGS.includes(tag)) channel = "spec";
  else return null;
  const rest = head[2];
  // Mit Richtungszeichen nach dem Namen ist die Trennung eindeutig, auch wenn der Name „: “ enthält.
  let name, tail;
  const mark = rest.indexOf("‎");
  if (mark > 0) { name = rest.slice(0, mark); tail = rest.slice(mark + 1); }
  else {
    const split = rest.match(/^(.+?)((?:\s*(?:\[[^\]]{1,12}\]|\*[^*]{1,12}\*))?(?:\s*@\s*[^:]{1,48})?:\s.*)$/u);
    if (!split) return null;
    name = split[1];
    tail = split[2];
  }
  const meta = tail.match(/^((?:\s*(?:\[[^\]]{1,12}\]|\*[^*]{1,12}\*))?)(?:\s*@\s*([^:]{1,48}))?:\s(.*)$/su);
  if (!meta) return null;
  const dead = DEAD.test(meta[1]) || DEAD.test(name);
  name = cleanText(name.replace(DEAD, ""), NAME_MAX);
  const text = cleanText(meta[3], TEXT_MAX);
  if (!name || !text) return null;
  return { channel, team, dead, location: cleanText(meta[2], 48), name, text };
}

/* ---------- Sprache erkennen ---------- */

const WORDS = {
  de: "ich du er wir ihr und nicht ist das der die den dem ein eine ja nein bitte danke gut mal kein keine was wie warum wo geh los schnell hab habe bin bist sind auch noch nur schon jetzt hier da mit für auf von zu aber oder wenn dann sorry geil alter digga junge leute komm kommt",
  en: "the you your is are and not i we me my it to of in on for that this what why where how please thanks thank nice good bad go come lol wtf guys rush push noob bro dont don't can't cant im i'm its it's they he she was have has just no yes yeah ok okay sorry man stop wait team",
  es: "que el la los las es no por para hola vamos gracias bien pero muy porque como donde estoy esta está yo tu tú eres soy hermano amigo jaja malo bueno equipo",
  fr: "je tu il le les est pas et oui non merci mais c'est vous nous suis une des du sur avec pour mec putain allez bien",
  it: "che il non sono perché perche grazie ciao andiamo bene io sei è gli della questo fratello cazzo dai",
  pt: "não nao você voce obrigado vamos que é com uma eu tá ta mano cara isso aqui porra time boa",
  cs: "je to ne ano jsem jak proč proc díky diky dobrý dobry kurva tady jsi máme",
  et: "ja ei on mina sina aitäh aitah tere kas mis miks see oled",
};
const WORD_SETS = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v.split(" "))]));
const LETTERS = { de: /[äöüß]/i, es: /[ñ¿¡]/i, fr: /[çèêëàâîœ]/i, pt: /[ãõ]/i, cs: /[ěščřžůý]/i, et: /[õ]/i, it: /[àèìòù]\b/i };

/** Sprache einer Chatnachricht (`de`, `en`, `ru` …) oder "" wenn unsicher. Kurze Rufe wie „gg“ bleiben unbekannt. */
export function detectLanguage(raw, { assumeEnglish = true } = {}) {
  const text = String(raw || "").toLowerCase();
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) || []).length;
  const latin = (text.match(/[a-zà-ž]/g) || []).length;
  if (cyrillic >= 2 && cyrillic >= latin) {
    if (/[іїєґ]/.test(text)) return "uk";
    if (/[ыэё]/.test(text)) return "ru";
    if (/ъ/.test(text) || /\b(?:аз|съм|какво|защо|много)\b/.test(text)) return "bg";
    return "ru";
  }
  if (latin < 2) return "";
  const words = text.split(/[^a-zà-ž'’]+/u).filter(Boolean).map((w) => w.replace(/’/g, "'"));
  const scores = {};
  for (const [lang, set] of Object.entries(WORD_SETS)) scores[lang] = words.filter((w) => set.has(w)).length;
  for (const [lang, re] of Object.entries(LETTERS)) if (re.test(text)) scores[lang] = (scores[lang] || 0) + 1.5;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] > 0 && ranked[0][1] > ranked[1][1]) return ranked[0][0];
  // Reiner ASCII-Text mit mehreren Wörtern ist im CS2-Chat meist Englisch.
  if (assumeEnglish && ranked[0][1] === 0 && words.length >= 3 && /^[\x20-\x7e]+$/.test(raw)) return "en";
  return "";
}

/** Welche Modelle (`deen`, `ende` …) eine Richtung braucht: direkt oder über Englisch. */
export function modelsFor(from, to) {
  if (!LANGUAGES[from] || !LANGUAGES[to] || from === to) return [];
  if (CHAT_MODELS[from + to]) return [from + to];
  if (CHAT_MODELS[from + "en"] && CHAT_MODELS["en" + to]) return [from + "en", "en" + to];
  return [];
}

/* ---------- Antwort als cfg ---------- */

/** Text für `say`: keine Anführungszeichen, Strichpunkte, Backslashes oder Steuerzeichen, höchstens SAY_MAX Zeichen. */
export function cleanSay(value) {
  return cleanText(String(value || "").replace(/["“”„;\\`]/g, "'").replace(/\/\//g, "/"), SAY_MAX);
}

export function chatCfg(text, team) {
  const say = cleanSay(text);
  if (!say) return "";
  return `// TecMon Companion: übersetzte Chat-Antwort. Wird überschrieben.\n${team ? "say_team" : "say"} "${say}"\n`;
}

export function keysCfg(keys) {
  const all = CHAT_HOTKEYS.includes(keys?.all) ? keys.all : "F7";
  const team = CHAT_HOTKEYS.includes(keys?.team) && keys.team !== all ? keys.team : all === "F8" ? "F9" : "F8";
  return `// TecMon Companion: Tasten für übersetzte Chat-Antworten. Einmal in der Konsole: ${CHAT_SETUP_EXEC}\n`
    + `bind "${all}" "exec tecmon_chat_all"\nbind "${team}" "exec tecmon_chat_team"\necho "TecMon: Chat-Tasten ${all} (alle) und ${team} (Team) gesetzt."\n`;
}

/** console.log neben dem cfg-Ordner: …\game\bin\win64\cs2.exe → …\game\csgo\console.log */
export function consoleLogPath(cs2Exe) {
  if (!cs2Exe || path.basename(cs2Exe).toLowerCase() !== "cs2.exe") return "";
  return path.join(path.dirname(cs2Exe), "..", "..", "csgo", "console.log");
}

/* ---------- console.log mitlesen ---------- */

/**
 * Liest neue Zeilen einer wachsenden Datei. Beginnt am aktuellen Ende (keine alten Chats),
 * fängt nach einem Neustart von CS2 (Datei kürzer) von vorn an. Nur lesen, nie schreiben.
 */
export function createTail(file, onLine) {
  let offset = -1, rest = "";
  return {
    async poll() {
      let info;
      try { info = await stat(file); } catch { offset = 0; rest = ""; return { exists: false }; }
      if (offset < 0) offset = info.size;
      if (info.size < offset) { offset = 0; rest = ""; }
      if (info.size > offset) {
        const length = Math.min(MAX_READ, info.size - offset);
        const handle = await open(file, "r");
        try {
          const buffer = Buffer.alloc(length);
          const { bytesRead } = await handle.read(buffer, 0, length, offset);
          offset += bytesRead;
          const text = rest + buffer.subarray(0, bytesRead).toString("utf8");
          const lines = text.split("\n");
          rest = lines.pop().slice(-2000);
          for (const line of lines) onLine(line);
        } finally {
          await handle.close();
        }
      }
      return { exists: true, mtime: info.mtimeMs };
    },
  };
}

/* ---------- Bergamot laden ---------- */

async function download(url, limit, request) {
  const response = await request(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status}).`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error("Download zu groß.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function writeAtomic(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, data);
  await rename(temporary, file);
}

/** Bergamot-Engine einmal laden und prüfen (feste npm-Prüfsumme), danach aus dem Cache. */
export async function ensureEngine(cacheDir, request = fetch) {
  const folder = path.join(cacheDir, `bergamot-${ENGINE.version}`);
  const marker = path.join(folder, "integrity.txt");
  if (existsSync(path.join(folder, "translator.js")) && (await readFile(marker, "utf8").catch(() => "")) === ENGINE.integrity) return folder;
  const archive = await download(ENGINE.url, 20 * 1024 * 1024, request);
  const digest = "sha512-" + createHash("sha512").update(archive).digest("base64");
  if (digest !== ENGINE.integrity) throw new Error("Prüfsumme der Übersetzungs-Engine stimmt nicht. Download abgebrochen.");
  const entries = tarEntries(gunzipSync(archive));
  const temporary = `${folder}.${randomUUID()}.tmp`;
  await mkdir(path.join(temporary, "worker"), { recursive: true });
  try {
    for (const name of ENGINE_FILES) {
      const bytes = entries.get(`package/${name}`);
      if (!bytes) throw new Error("Übersetzungs-Engine unvollständig.");
      await writeFile(path.join(temporary, name), bytes);
    }
    // translator.js ist ein ES-Modul, die Worker-Dateien sind CommonJS.
    await writeFile(path.join(temporary, "package.json"), '{"type":"module"}');
    await writeFile(path.join(temporary, "worker", "package.json"), '{"type":"commonjs"}');
    await writeFile(path.join(temporary, "LICENSE.txt"), "bergamot-translator (https://github.com/browsermt/bergamot-translator), Mozilla Public License 2.0, unverändert.\n");
    await writeFile(marker.replace(folder, temporary), ENGINE.integrity);
    await rm(folder, { recursive: true, force: true });
    await rename(temporary, folder);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return folder;
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Ein Modell (`deen` …) laden; jede Datei muss die feste SHA-256 haben. */
export async function ensureModel(modelDir, key, request = fetch) {
  const entry = CHAT_MODELS[key];
  if (!entry) throw new Error("Für diese Sprache gibt es kein Übersetzungsmodell.");
  const folder = path.join(modelDir, key);
  await mkdir(folder, { recursive: true });
  const files = {};
  for (const [part, info] of Object.entries(entry)) {
    if (part === "config") continue;
    const file = path.join(folder, path.basename(new URL(info.url).pathname));
    const existing = await readFile(file).catch(() => null);
    if (!existing || existing.length !== info.size || sha256(existing) !== info.sha256) {
      // Der Server liefert gzip-kodiert; fetch entpackt selbst.
      const bytes = await download(info.url, 40 * 1024 * 1024, request);
      if (bytes.length !== info.size || sha256(bytes) !== info.sha256) throw new Error("Prüfsumme des Übersetzungsmodells stimmt nicht. Download abgebrochen.");
      await writeAtomic(file, bytes);
    }
    files[part] = { name: file };
  }
  return { from: key.slice(0, 2), to: key.slice(2, 4), files: entry.config ? { ...files, config: entry.config } : files };
}

/* ---------- Gesamtfunktion ---------- */

export async function createChatTranslator({ dir, cacheDir, cs2Exe = "", request = fetch, now = Date.now, loadEngine, busy = () => false } = {}) {
  const file = path.join(dir, "chat-translate.json");
  let settings = { enabled: false, language: "de", overlay: false, accepted: 0, keys: { all: "F7", team: "F8" }, assumeEnglish: true };
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    settings = {
      enabled: saved?.enabled === true,
      language: LANGUAGES[saved?.language] ? saved.language : "de",
      overlay: saved?.overlay === true,
      accepted: Number.isInteger(saved?.accepted) ? saved.accepted : 0,
      keys: { all: CHAT_HOTKEYS.includes(saved?.keys?.all) ? saved.keys.all : "F7", team: CHAT_HOTKEYS.includes(saved?.keys?.team) ? saved.keys.team : "F8" },
      assumeEnglish: saved?.assumeEnglish !== false,
    };
  } catch { /* noch nichts gespeichert */ }
  if (settings.accepted !== CHAT_OVERLAY_NOTICE_VERSION) settings.overlay = false;
  const persist = async () => {
    await mkdir(dir, { recursive: true });
    await writeAtomic(file, JSON.stringify(settings));
  };
  const cfgDir = cs2Exe ? path.join(path.dirname(consoleLogPath(cs2Exe)), "cfg") : "";
  const logFile = consoleLogPath(cs2Exe);

  /** Nur im Arbeitsspeicher: die letzten MAX_MESSAGES Chatzeilen. */
  let messages = [], serial = 0, lastForeign = "";
  let log = { exists: false, mtime: 0 }, engine = { status: "idle", error: "" };
  let paused = false, timer = null, translator = null, loading = null, queue = Promise.resolve();
  const registry = new Map();

  async function backing() {
    if (translator) return translator;
    if (!loading) loading = (async () => {
      engine = { status: "loading", error: "" };
      const folder = loadEngine ? cacheDir : await ensureEngine(cacheDir, request);
      const lib = loadEngine ? await loadEngine(folder) : await import(pathToFileURL(path.join(folder, "translator.js")).href);
      class LocalBacking extends lib.TranslatorBacking {
        async loadModelRegistery() { return [...registry.values()]; }
        async fetch(name) { const b = await readFile(name); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); }
      }
      // Optionen gehen per postMessage an den Worker: dort keine Funktionen hineinlegen.
      const local = new LocalBacking({ downloadTimeout: 0 });
      local.onerror = (e) => { engine = { status: "error", error: String(e?.message || e).slice(0, 200) }; };
      translator = new lib.BatchTranslator({}, local);
      engine = { status: "ready", error: "" };
      return translator;
    })().catch((error) => { loading = null; engine = { status: "error", error: error.message }; throw error; });
    return loading;
  }

  async function translate(text, from, to) {
    const keys = modelsFor(from, to);
    if (!keys.length) throw new Error(`${LANGUAGES[from] || from} → ${LANGUAGES[to] || to} kann TecMon noch nicht übersetzen.`);
    const missing = keys.filter((k) => !registry.has(k));
    if (missing.length) engine = { ...engine, status: "download" };
    for (const key of missing) registry.set(key, await ensureModel(path.join(cacheDir, "chat-models"), key, request));
    const t = await backing();
    // Neue Modelle erst nach dem Laden der Registry: Backing neu fragen lassen.
    if (missing.length && t.backing) { t.backing.registry = Promise.resolve([...registry.values()]); t.backing.models?.clear?.(); }
    engine = { status: "ready", error: "" };
    const response = await t.translate({ from, to, text, html: false, qualityScores: false });
    return cleanText(response?.target?.text, TEXT_MAX);
  }
  /* Nacheinander übersetzen, damit eine Flut im Chat die Engine nicht überlastet. */
  const enqueue = (work) => { const next = queue.then(work, work); queue = next.catch(() => {}); return next; };

  function onLine(line) {
    if (paused || busy()) return;
    const chat = parseChatLine(line);
    if (!chat) return;
    const lang = detectLanguage(chat.text, { assumeEnglish: settings.assumeEnglish });
    const message = { id: ++serial, time: now(), ...chat, lang, translated: "", status: "" };
    if (lang && lang !== settings.language) lastForeign = lang;
    if (!lang) message.status = "unknown";
    else if (lang === settings.language) message.status = "same";
    else if (!modelsFor(lang, settings.language).length) message.status = "unsupported";
    else {
      message.status = "pending";
      enqueue(async () => {
        try { message.translated = await translate(chat.text, lang, settings.language); message.status = "done"; }
        catch (error) { message.status = "error"; message.error = error.message.slice(0, 160); }
      });
    }
    messages = [message, ...messages].slice(0, MAX_MESSAGES);
  }

  const tail = logFile ? createTail(logFile, onLine) : null;
  const tick = async () => { if (tail) log = await tail.poll().catch(() => ({ exists: false })); };
  const start = () => {
    if (timer || !settings.enabled || !tail) return;
    timer = setInterval(() => { tick(); }, 700);
    timer.unref?.();
    tick();
  };
  const stopTimer = () => { if (timer) clearInterval(timer); timer = null; };
  start();

  const condebug = () => !logFile ? "no-cs2" : !log.exists ? "missing" : now() - log.mtime > 10 * 60 * 1000 ? "stale" : "active";
  const api = {
    state: () => ({
      enabled: settings.enabled,
      available: Boolean(logFile),
      language: settings.language,
      languages: LANGUAGES,
      keys: settings.keys,
      assumeEnglish: settings.assumeEnglish,
      overlay: settings.overlay && settings.accepted === CHAT_OVERLAY_NOTICE_VERSION,
      accepted: settings.accepted === CHAT_OVERLAY_NOTICE_VERSION,
      notice: CHAT_OVERLAY_NOTICE,
      noticeVersion: CHAT_OVERLAY_NOTICE_VERSION,
      condebug: settings.enabled ? condebug() : "off",
      engine: engine.status,
      engineError: engine.error,
      replyLanguage: lastForeign || "en",
      setupExec: CHAT_SETUP_EXEC,
    }),
    messages: (limit = MAX_MESSAGES) => messages.slice(0, limit).map(({ error, ...m }) => (error ? { ...m, error } : m)),
    /** Für das Overlay der Figur: nur frische Zeilen. */
    overlayLines(maxAge = 20000, limit = 6) {
      return messages.filter((m) => now() - m.time <= maxAge).slice(0, limit).reverse().map((m) => ({
        id: m.id, channel: m.channel, team: m.team, dead: m.dead, name: m.name, lang: m.lang,
        text: m.status === "done" ? m.translated : m.text, translated: m.status === "done",
      }));
    },
    async setSettings(input = {}) {
      if (typeof input.enabled === "boolean") settings.enabled = input.enabled;
      if (LANGUAGES[input.language]) settings.language = input.language;
      if (typeof input.assumeEnglish === "boolean") settings.assumeEnglish = input.assumeEnglish;
      if (input.keys) {
        const all = CHAT_HOTKEYS.includes(input.keys.all) ? input.keys.all : settings.keys.all;
        const team = CHAT_HOTKEYS.includes(input.keys.team) ? input.keys.team : settings.keys.team;
        if (all === team) throw new Error("Bitte zwei verschiedene Tasten wählen.");
        settings.keys = { all, team };
      }
      if (typeof input.overlay === "boolean") {
        if (input.overlay) {
          if (input.accept !== CHAT_OVERLAY_NOTICE_VERSION && settings.accepted !== CHAT_OVERLAY_NOTICE_VERSION)
            throw new Error("Bitte erst den Hinweis zum Overlay lesen und bestätigen.");
          settings.accepted = CHAT_OVERLAY_NOTICE_VERSION;
        }
        settings.overlay = input.overlay;
      }
      if (!settings.enabled) { stopTimer(); messages = []; }
      await persist();
      if (settings.enabled) start();
      if (settings.enabled && cfgDir && existsSync(cfgDir)) await writeAtomic(path.join(cfgDir, "tecmon_chat_keys.cfg"), keysCfg(settings.keys)).catch(() => {});
      return api.state();
    },
    /** Während einer Demo-Aufnahme schreibt CS2 die Chats der Demo: dann nichts annehmen. */
    pause(value) { paused = Boolean(value); },
    /** Antwort übersetzen und als cfg ablegen. `to` = Zielsprache oder "auto" (letzte fremde Sprache). */
    async reply({ text, to = "auto", team = false } = {}) {
      const source = cleanSay(text);
      if (!source) throw new Error("Bitte erst eine Nachricht schreiben.");
      const target = to === "auto" ? lastForeign || "en" : to;
      if (!LANGUAGES[target]) throw new Error("Unbekannte Zielsprache.");
      const translated = target === settings.language ? source : cleanSay(await enqueue(() => translate(source, settings.language, target)));
      let written = false;
      if (cfgDir && existsSync(cfgDir)) {
        await writeAtomic(path.join(cfgDir, team ? "tecmon_chat_team.cfg" : "tecmon_chat_all.cfg"), chatCfg(translated, team));
        await writeAtomic(path.join(cfgDir, "tecmon_chat_keys.cfg"), keysCfg(settings.keys));
        written = true;
      }
      return { text: translated, to: target, team: Boolean(team), written, key: team ? settings.keys.team : settings.keys.all };
    },
    /** Beim Entfernen des CS2-Pakets: Einstellungen und eigene cfgs löschen. */
    async reset() {
      stopTimer();
      messages = [];
      settings = { enabled: false, language: "de", overlay: false, accepted: 0, keys: { all: "F7", team: "F8" }, assumeEnglish: true };
      for (const target of [file, ...(cfgDir ? CHAT_FILES.map((f) => path.join(cfgDir, f)) : [])])
        try { await unlink(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
    },
    close() { stopTimer(); translator?.delete?.(); },
    /** Für Tests: eine Zeile so verarbeiten, als stünde sie in console.log. */
    feed: onLine,
    tick,
    idle: () => queue,
  };
  return api;
}
