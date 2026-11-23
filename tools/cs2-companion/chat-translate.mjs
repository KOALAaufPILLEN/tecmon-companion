import path from "node:path";
import { existsSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { open, stat, readFile, writeFile, rename, mkdir, rm, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { tarEntries } from "./valve-download.mjs";
import { CHAT_MODELS } from "./chat-models.mjs";

/**
 * Chat-Übersetzer für CS2 (Funktion des CS2-Pakets, seit 0.48.5 standardmäßig an).
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
/** Startoptionen für den Chat-Übersetzer (Nutzerwunsch 22.11.2026: dazu rohe Tastatureingabe von CS2). */
export const CHAT_LAUNCH_OPTIONS = "+cl_input_enable_raw_keyboard true -condebug";
/**
 * Eigene Startoptionen (Nutzerwunsch 22.11.2026). Nur einfache Wörter: `-name`, `+name` und Werte aus
 * Buchstaben, Ziffern, `_ . : -`; keine Anführungszeichen, Strichpunkte, Schrägstriche oder Leerzeichen
 * innerhalb eines Werts. `-condebug` wird immer ergänzt, sonst gibt es keine console.log.
 */
export function cleanLaunchOptions(value) {
  const text = String(value ?? "").trim();
  if (text.length > 300) throw new Error("Startoptionen zu lang (höchstens 300 Zeichen).");
  const words = text ? text.split(/\s+/) : [];
  if (words.length > 30) throw new Error("Zu viele Startoptionen (höchstens 30).");
  for (const word of words)
    if (!/^(?:[-+][A-Za-z][A-Za-z0-9_.]{0,63}|[A-Za-z0-9_.:-]{1,64})$/.test(word))
      throw new Error(`„${word.slice(0, 40)}“ ist als Startoption nicht erlaubt. Nur -name, +name und einfache Werte.`);
  if (words[0] && !/^[-+]/.test(words[0])) throw new Error("Startoptionen beginnen mit - oder +.");
  if (!words.some((w) => w.toLowerCase() === "-condebug")) words.push("-condebug");
  return words.join(" ");
}

/** CS2 einmalig über Steam mit diesen Optionen starten; Steam fragt selbst nach. Die Steam-Einstellungen bleiben unverändert. */
export function launchUrl(options = CHAT_LAUNCH_OPTIONS) {
  return `steam://run/730//${encodeURIComponent(cleanLaunchOptions(options))}/`;
}
export const CHAT_LAUNCH_URL = launchUrl();
export const LANGUAGES = {
  de: "Deutsch", en: "Englisch", es: "Spanisch", fr: "Französisch", it: "Italienisch", pt: "Portugiesisch",
  ru: "Russisch", uk: "Ukrainisch", bg: "Bulgarisch", cs: "Tschechisch", et: "Estnisch", tr: "Türkisch", pl: "Polnisch",
  // Seit 0.47.0: alle weiteren Sprachen der Firefox-Übersetzungsmodelle.
  af: "Afrikaans", ar: "Arabisch", az: "Aserbaidschanisch", be: "Belarussisch", bn: "Bengalisch", bs: "Bosnisch",
  ca: "Katalanisch", da: "Dänisch", el: "Griechisch", eu: "Baskisch", fa: "Persisch", fi: "Finnisch", gl: "Galicisch",
  gu: "Gujarati", he: "Hebräisch", hi: "Hindi", hr: "Kroatisch", hu: "Ungarisch", id: "Indonesisch", is: "Isländisch",
  ja: "Japanisch", kn: "Kannada", ko: "Koreanisch", lt: "Litauisch", lv: "Lettisch", ml: "Malayalam", mr: "Marathi",
  ms: "Malaiisch", nb: "Norwegisch", nl: "Niederländisch", ro: "Rumänisch", sk: "Slowakisch", sl: "Slowenisch",
  sq: "Albanisch", sr: "Serbisch", sv: "Schwedisch", ta: "Tamil", te: "Telugu", th: "Thailändisch", tl: "Tagalog",
  ug: "Uigurisch", ur: "Urdu", vi: "Vietnamesisch", zh: "Chinesisch",
};
export const MAX_MESSAGES = 40;
/** Höchstens so viele Modelle gleichzeitig im Übersetzer (je 13–70 MB im WebAssembly-Speicher). */
export const MAX_LOADED_MODELS = 4;
export const TRANSLATE_TIMEOUT_MS = 60000;
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
  // console.log von CS2 hat Windows-Zeilenenden (\r\n): „.“ passt nicht auf \r, darum alle Zeilenenden abschneiden.
  let line = String(raw || "").replace(/[\r\n]+$/, "");
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
    const split = rest.match(/^(.+?)((?:\s*(?:\[[^\]]{1,12}\]|\*[^*]{1,12}\*))?(?:\s*[@\uFE6B\uFF20]\s*[^:]{1,48})?:\s.*)$/u);
    if (!split) return null;
    name = split[1];
    tail = split[2];
  }
  // Ort im Team-Chat: CS2 schreibt „﹫“ (U+FE6B) statt „@“, etwa „Name[LRM]﹫T Start: text“ (echte console.log 22.11.2026).
  const meta = tail.match(/^((?:\s*(?:\[[^\]]{1,12}\]|\*[^*]{1,12}\*))?)(?:\s*[@\uFE6B\uFF20]\s*([^:]{1,48}))?:\s(.*)$/su);
  if (!meta) return null;
  const dead = DEAD.test(meta[1]) || DEAD.test(name);
  name = cleanText(name.replace(DEAD, ""), NAME_MAX);
  const text = cleanText(meta[3], TEXT_MAX);
  if (!name || !text) return null;
  return { channel, team, dead, location: cleanText(meta[2], 48), name, text };
}

/* ---------- Sprache erkennen ---------- */

/** Häufige Chatwörter je Sprache mit lateinischer Schrift. Bosnisch fehlt bewusst: von Kroatisch/Serbisch kaum zu trennen. */
const WORDS = {
  de: "ich du er wir ihr und nicht ist das der die den dem ein eine ja nein bitte danke gut mal kein keine was wie warum wo geh los schnell hab habe bin bist sind auch noch nur schon jetzt hier da mit für auf von zu aber oder wenn dann sorry geil alter digga junge leute komm kommt gegen ficken fick scheiße scheisse hallo moin servus geht spast hurensohn",
  en: "the you your is are and not i we me my it to of in on for that this what why where how please thanks thank nice good bad go come lol wtf guys rush push noob bro dont don't can't cant im i'm its it's they he she was have has just no yes yeah ok okay sorry man stop wait team fuck fucking aimbot cheat cheats cheater cheating hack hacker hacking wallhack",
  es: "que el la los las es no por para hola vamos gracias bien pero muy porque como donde estoy esta está yo tu tú eres soy hermano amigo jaja malo bueno equipo",
  fr: "je tu il le les est pas et oui non merci mais c'est vous nous suis une des du sur avec pour mec putain allez bien",
  it: "che il non sono perché perche grazie ciao andiamo bene io sei è gli della questo fratello cazzo dai",
  pt: "não nao você voce obrigado vamos que é com uma eu tá ta mano cara isso aqui porra time boa",
  cs: "je to ne ano jsem jak proč proc díky diky dobrý dobry kurva tady jsi máme",
  et: "ja ei on mina ma sina sa aitäh aitah tere kas mis miks see oled siin seal hästi halb tule mine kiiresti",
  tr: "ve bir bu ne mi mı mu mü ben sen biz siz onlar evet hayır hayir tamam teşekkürler tesekkurler sağol sagol abi kardeş kardes hadi gel git yok var çok cok iyi kötü kotu neden niye nasıl nasil ile için icin diye ama gibi şey sey oyna takım takim adam lan aferin sana bana sizi bizi kişi kisi oldu olur değil degil naber nbr haber selam slm merhaba kanka kanki olm oğlum oglum nasılsın nasilsin iyiyim napıyon napiyon noldu sikeyim siktir sik amk aq anan ananı anani gidelim oyun oyundu kardeşim kardesim bekle yardım yardim",
  pl: "nie tak jest się sie że ze ty my wy oni dobra dobrze kurwa idziemy chodź chodz gdzie dlaczego czemu proszę prosze dzięki dzieki może moze już juz tylko bardzo mam masz nic ale albo który ktory grać grac jestem jesteś jestes chłopaki chlopaki szybko",
  nl: "ik jij je hij wij jullie niet het een van dat wat waarom waar hoe bedankt dank alsjeblieft goed slecht kom gaan nee jongens snel doe mijn heb ben zijn ook maar wel even kut lekker",
  af: "ek jy hy ons julle nie die het baie dankie asseblief sleg kom gaan waar hoekom wat lekker maak vir",
  da: "jeg du han vi ikke det er og hvad hvorfor hvor hvordan tak godt dårlig kom nej meget mig dig hej skal kan bare også",
  nb: "jeg du han vi ikke det er og hva hvorfor hvor hvordan takk bra dårlig kom nei veldig meg deg hei skal kan bare også ikkje",
  sv: "jag du han vi inte det är och vad varför var hur tack bra dålig kom nej mycket mig dig hej ska kan bara också",
  fi: "minä mä sinä sä hän me te ei on ja se mitä miksi missä miten kiitos hyvä huono tule mene kyllä joo nyt vittu perkele mennään tänne älä",
  is: "ég þú hann við ekki það er og að hvað hverju hvar takk gott slæmt komdu nei já mjög",
  lt: "aš tu jis mes jūs ne yra ir kas kodėl kur kaip ačiū aciu gerai blogai eik einam taip labai čia cia",
  lv: "es tu viņš mēs jūs nē ir un kas kāpēc kur kā paldies labi slikti nāc iet jā ļoti šeit seit",
  hu: "én te ő mi ti nem igen és az egy hogy miért hol hogyan köszi köszönöm jó rossz gyere menj itt ott basszus srácok gyorsan",
  ro: "eu tu el noi voi nu da și si este ce de unde cum mersi mulțumesc multumesc bine rău rau hai aici frate băieți baieti foarte",
  sk: "ja ty on my vy nie áno ano je to čo co prečo preco kde ako ďakujem dakujem dobre zle poď sme som si tu",
  sl: "jaz ti on mi vi ne je in to kaj zakaj kje kako hvala dobro slabo pridi gremo tukaj zelo sem si",
  hr: "ja ti on mi vi ne da je to što zašto zasto gdje kako hvala dobro loše lose dođi dodi idemo ovdje jako sam si brate",
  sr: "šta sta ovde gde lepo mnogo ćao cao bre hvala brate idemo zašto zasto",
  sq: "unë une ti ai ne ju jo po është eshte dhe çfarë pse ku si faleminderit mirë mire keq hajde shpejt shumë shume këtu vëlla vella",
  ca: "jo tu ell nosaltres vosaltres no sí és i què per on com gràcies bé malament vinga anem aquí molt també",
  gl: "eu ti el nós vós non si é e que por onde como grazas ben mal imos aquí moito tamén",
  eu: "ni zu hura gu zuek bai da eta zer zergatik non nola eskerrik mila ondo gaizki goazen hemen oso kaixo",
  az: "mən sən o biz siz yox bəli hə və bu nə niyə harada necə sağ ol təşəkkür yaxşı pis gəl get burada çox",
  id: "aku kamu dia kita kami mereka tidak gak nggak ya dan ini itu apa kenapa mana bagaimana terima kasih makasih bagus jelek ayo sini sangat bang woi anjir",
  ms: "saya awak dia kita kami mereka tidak tak ya dan ini itu apa kenapa mana bagaimana terima kasih bagus teruk jom sini sangat",
  tl: "ako ikaw siya tayo kami sila hindi oo at ang ng mga sa ano bakit saan paano salamat maganda pangit tara dito sobra pre lods",
  vi: "tôi toi bạn ban không khong có co là la và va gì gi tại sao đâu dau thế the nào nao cảm cam ơn on tốt tot xấu xau đi di nhanh ơi oi",
};
const WORD_SETS = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v.split(" "))]));
/** Typische Buchstaben: [Sprachen, Muster, Gewicht]. Geteilte Buchstaben zählen für alle genannten Sprachen. */
const LETTERS = [
  [["tr"], /[ışğ̇]/, 1.5], [["pl"], /[łśćźżń]/, 1.5], [["pl", "lt"], /[ąę]/, 0.5], [["de"], /[äöüß]/, 1.5],
  [["es"], /[ñ¿¡]/, 1.5], [["fr"], /[êœ]|[çèëàâî]/, 1.5], [["pt"], /[ãõ]/, 1.5], [["cs"], /[ěřů]/, 1.5], [["cs", "sk", "sl", "hr", "sr", "lt", "lv"], /[čšž]/, 0.5],
  [["et"], /õ/, 1.5], [["it"], /[àèìòù]\b/, 1.5], [["az"], /ə/, 3], [["is"], /[þð]/, 3], [["ro"], /[șțşţ]/, 2],
  [["lt"], /[ėįųū]/, 2], [["lv"], /[āēīģķļņ]/, 2], [["hu"], /[őű]/, 2], [["sk"], /[ľĺŕô]/, 2], [["hr", "sr"], /đ/, 1],
  [["sq"], /ë/, 1.5], [["da", "nb"], /[æø]/, 1.5], [["da", "nb", "sv"], /å/, 1],
  [["vi"], /[ơưăạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/, 3],
];

/** Andere Schriften: [Sprache oder Funktion, Muster]. Die Schrift mit den meisten Zeichen gewinnt. */
const SCRIPTS = [
  ["cyrillic", /\p{Script=Cyrillic}/gu], ["greek", /\p{Script=Greek}/gu], ["arabic", /\p{Script=Arabic}/gu],
  ["he", /\p{Script=Hebrew}/gu], ["th", /\p{Script=Thai}/gu], ["ko", /\p{Script=Hangul}/gu],
  ["kana", /[\p{Script=Hiragana}\p{Script=Katakana}]/gu], ["han", /\p{Script=Han}/gu],
  ["devanagari", /\p{Script=Devanagari}/gu], ["bn", /\p{Script=Bengali}/gu], ["gu", /\p{Script=Gujarati}/gu],
  ["ta", /\p{Script=Tamil}/gu], ["te", /\p{Script=Telugu}/gu], ["kn", /\p{Script=Kannada}/gu], ["ml", /\p{Script=Malayalam}/gu],
];

function scriptLanguage(script, text, counts) {
  switch (script) {
    case "cyrillic":
      if (/ў/.test(text)) return "be";
      if (/[їєґ]/.test(text) || (/і/.test(text) && !/[ыэё]/.test(text))) return "uk";
      if (/[ђћџљњј]/.test(text)) return "sr";
      if (/[ыэё]/.test(text)) return "ru";
      if (/ъ/.test(text) || /(?:^|[^\p{L}])(?:аз|съм|какво|защо|много)(?=$|[^\p{L}])/u.test(text)) return "bg";
      return "ru";
    case "greek": return "el";
    case "arabic":
      if (/[ېۆۈۇۋڭە]/.test(text)) return "ug";
      if (/[ےںٹڈڑہھ]/.test(text)) return "ur";
      if (/[پچژگکی]/.test(text) && !/[ةكيى]/.test(text)) return "fa";
      return "ar";
    case "kana": return "ja";
    case "han": return counts.kana ? "ja" : "zh";
    case "devanagari": return /ळ|(?:^|\s)(?:आहे|नाही|काय|मी|तू|आणि)(?=$|\s)/.test(text) ? "mr" : "hi";
    default: return script;
  }
}

/** Sprache einer Chatnachricht (`de`, `en`, `ru` …) oder "" wenn unsicher. Kurze Rufe wie „gg“ bleiben unbekannt. */
export function detectLanguage(raw, { assumeEnglish = true } = {}) {
  // „İ“ wird kleingeschrieben zu „i“ + Punkt (U+0307): die Markierung bleibt für LETTERS, Wörter bekommen ein „i“.
  const text = String(raw || "").toLowerCase();
  const plain = text.replace(/i̇/g, "i");
  const latin = (text.match(/\p{Script=Latin}/gu) || []).length;
  const counts = {};
  for (const [script, re] of SCRIPTS) counts[script] = (text.match(re) || []).length;
  // Chinesisch und Japanisch: ein Zeichen ist oft schon ein Wort, darum zählen Han/Kana doppelt.
  const weight = (s) => (s === "han" || s === "kana" || s === "ko" ? counts[s] * 2 : counts[s]);
  const top = SCRIPTS.map(([s]) => s).sort((a, b) => weight(b) - weight(a))[0];
  const other = weight(top) + (top === "han" ? counts.kana * 2 : top === "kana" ? counts.han * 2 : 0);
  // Andere Schrift gewinnt auch gegen eine angehängte Umschrift („Ты хороший игрок. (Ty khoroshiy igrok)“).
  if (counts[top] >= 2 && (other >= latin || (other >= 6 && other * 2 >= latin))) return scriptLanguage(top, text, counts);
  if (latin < 2) return "";
  const words = plain.split(/[^\p{Script=Latin}'’]+/u).filter(Boolean).map((w) => w.replace(/’/g, "'"));
  const scores = {};
  for (const [lang, set] of Object.entries(WORD_SETS)) scores[lang] = words.filter((w) => set.has(w)).length;
  // Türkische Tastatur: „aımbot“, „cheatıng“ sind englische Wörter mit „ı“. Solche Wörter zählen für Englisch, das „ı“ nicht für Türkisch.
  const dotless = words.filter((w) => w.includes("ı") && WORD_SETS.en.has(w.replace(/ı/g, "i")));
  scores.en += dotless.length;
  const letters = dotless.length ? text.split(/[^\p{Script=Latin}'’\u0307]+/u).filter((w) => !dotless.includes(w)).join(" ") : text;
  for (const [langs, re, add] of LETTERS) if (re.test(letters)) for (const lang of langs) scores[lang] = (scores[lang] || 0) + add;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] > 0 && ranked[0][1] > ranked[1][1]) return ranked[0][0];
  // Reiner ASCII-Text mit mehreren Wörtern ist im CS2-Chat meist Englisch.
  if (assumeEnglish && ranked[0][1] === 0 && words.length >= 3 && /^[\x20-\x7e]+$/.test(raw)) return "en";
  return "";
}

/** Häufige Abkürzungen im Chat, die die Modelle nicht kennen: [Sprache, Wort, Ersatz]. */
const SLANG = {
  tr: { naber: "ne haber", nbr: "ne haber", slm: "selam", nasilsin: "nasılsın", anani: "ananı", tsk: "teşekkürler", tşk: "teşekkürler", sagol: "sağol" },
};

/**
 * Text für das Modell vorbereiten: Rufe in Großbuchstaben („AFERİN SANA“) klein schreiben, bekannte
 * Abkürzungen ausschreiben und den ersten Buchstaben groß schreiben. Klein beginnende Fragen wie
 * „nasılsın?“ ergeben sonst doppelte Ausgaben („How are you? How are“, auf dem PC geprüft 23.11.2026).
 */
export function sourceText(text, lang) {
  let value = String(text || "");
  const lower = (v) => { try { return v.toLocaleLowerCase(lang); } catch { return v.toLowerCase(); } };
  const upper = (v) => { try { return v.toLocaleUpperCase(lang); } catch { return v.toUpperCase(); } };
  if (/\p{Lu}/u.test(value) && !/\p{Ll}/u.test(value)) value = lower(value);
  const slang = SLANG[lang];
  if (slang) value = value.replace(/[\p{L}]+/gu, (w) => {
    const hit = slang[lower(w)];
    return hit === undefined ? w : (w[0] !== lower(w[0]) ? upper(hit[0]) + hit.slice(1) : hit);
  });
  if (lang === "tr") {
    // „naber“ allein versteht das Modell nur als Frage; „B ye“ (Callout + Endung) als „B'ye“.
    value = value.replace(/(ne haber)\s*$/iu, "$1?").replace(/(^|\s)([ABab]|[0-9]+)\s+(ye|ya|e|a|de|da|te|ta|den|dan|ten|tan)(?=$|[^\p{L}])/gu, "$1$2'$3");
  } else if (lang !== "az") value = value.replace(/ı/g, "i"); // Türkische Tastatur: „aımbot“ → „aimbot“
  if (lang === "en") value = value.replace(/(^|[^\p{L}'’])i(?=$|[^\p{L}'’]|['’](?:m|ll|ve|d)\b)/gu, "$1I");
  // Satzanfänge groß: auch nach „.“, „?“, „!“ (sonst bleibt der zweite Satz manchmal unübersetzt).
  return value.replace(/(^|[.?!]\s+)(\P{L}*?)(\p{Ll})/gu, (_, start, pre, ch) => start + pre + upper(ch));
}

/** Smileys am Anfang/Ende („:D“, „xD“, „<3“, Emoji) lassen die Modelle oft weg: wieder anhängen. */
const EMOTE = String.raw`(?::[-']?[()DPpOo3|/\\*]+|;[-']?[)Dp]+|[xX]D+|<3+|\^\^|\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*)`;
const EMOTE_END = new RegExp(`(?:\\s*${EMOTE})+\\s*$`, "u");
const EMOTE_START = new RegExp(`^\\s*(?:${EMOTE}\\s*)+`, "u");
export function keepEmotes(source, translated) {
  let out = String(translated || "").trim();
  if (!out) return out;
  const end = String(source || "").match(EMOTE_END)?.[0].trim();
  const start = String(source || "").match(EMOTE_START)?.[0].trim();
  if (end && !out.endsWith(end)) out = out.replace(/[\s:;]+$/u, "") + " " + end;
  if (start && start !== end && !out.startsWith(start)) out = start + " " + out;
  return out;
}

/** Gleicher Text ohne Groß-/Kleinschreibung, Satzzeichen und Leerraum. */
export function sameText(a, b) {
  const norm = (v) => String(v || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return norm(a) === norm(b);
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
export function createTail(file, onLine, { backlog = 0 } = {}) {
  let offset = -1, rest = "", skipPartial = false, old = false;
  // Hält angefangene UTF-8-Zeichen (Kyrillisch, Emojis) bis zum nächsten Lesen zurück.
  let decoder = new StringDecoder("utf8");
  return {
    async poll() {
      let info;
      try { info = await stat(file); } catch { offset = 0; rest = ""; decoder = new StringDecoder("utf8"); return { exists: false }; }
      // Beim ersten Lesen höchstens `backlog` Bytes vom Ende nachholen (als „alt“ markiert), sonst nur Neues.
      if (offset < 0) { offset = Math.max(0, info.size - backlog); old = offset < info.size; skipPartial = old && offset > 0; }
      if (info.size < offset) { offset = 0; rest = ""; decoder = new StringDecoder("utf8"); }
      if (info.size > offset) {
        const length = Math.min(MAX_READ, info.size - offset);
        const handle = await open(file, "r");
        try {
          const buffer = Buffer.alloc(length);
          const { bytesRead } = await handle.read(buffer, 0, length, offset);
          offset += bytesRead;
          const text = rest + decoder.write(buffer.subarray(0, bytesRead));
          const lines = text.split("\n");
          rest = lines.pop().slice(-2000);
          if (skipPartial) { lines.shift(); skipPartial = false; }
          const backlogRead = old;
          old = false;
          for (const line of lines) onLine(line, backlogRead);
        } finally {
          await handle.close();
        }
      }
      return { exists: true, mtime: info.mtimeMs };
    },
  };
}

/** Zeitstempel `MM/DD HH:MM:SS` am Zeilenanfang (CS2 mit -condebug) als Zeitpunkt im laufenden Jahr, sonst NaN. */
export function lineTime(raw, nowMs = Date.now()) {
  const m = String(raw || "").match(/^\s*(\d{2})\/(\d{2})(?:\/(\d{4}))?\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return NaN;
  const year = m[3] ? Number(m[3]) : new Date(nowMs).getFullYear();
  let t = new Date(year, Number(m[1]) - 1, Number(m[2]), Number(m[4]), Number(m[5]), Number(m[6])).getTime();
  if (!m[3] && t - nowMs > 86400000) t = new Date(year - 1, Number(m[1]) - 1, Number(m[2]), Number(m[4]), Number(m[5]), Number(m[6])).getTime();
  return t;
}
export const BACKLOG_BYTES = 16 * 1024;
export const BACKLOG_MS = 120000;

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

/* Windows-Fehler in Bergamot 0.4.9: der Worker liest seine .wasm über `url.pathname` („/C:/…“), Windows macht daraus
   „C:\C:\…“ und die Übersetzung hängt. Genau diese eine Zeile wird nach der Prüfsummen-Prüfung ersetzt (geprüft 22.11.2026). */
export const ENGINE_PATCH = {
  file: "worker/translator-worker.js",
  from: "await readFile(url.pathname)",
  to: "await readFile(require(/* TecMon: Windows-Pfad */ 'node:url').fileURLToPath(url))",
};
const ENGINE_MARKER = `${ENGINE.integrity} tecmon-patch-1`;

/** Ersetzt nur ENGINE_PATCH; fehlt die Stelle, stimmt die Engine nicht und es wird abgebrochen. */
export function patchEngineFile(name, bytes) {
  if (name !== ENGINE_PATCH.file) return bytes;
  const text = bytes.toString("utf8");
  if (text.split(ENGINE_PATCH.from).length !== 2) throw new Error("Übersetzungs-Engine unerwartet. Download abgebrochen.");
  return Buffer.from(text.replace(ENGINE_PATCH.from, ENGINE_PATCH.to), "utf8");
}

/** Bergamot-Engine einmal laden und prüfen (feste npm-Prüfsumme), danach aus dem Cache. */
export async function ensureEngine(cacheDir, request = fetch) {
  const folder = path.join(cacheDir, `bergamot-${ENGINE.version}`);
  const marker = path.join(folder, "integrity.txt");
  if (existsSync(path.join(folder, "translator.js")) && (await readFile(marker, "utf8").catch(() => "")) === ENGINE_MARKER) return folder;
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
      await writeFile(path.join(temporary, name), patchEngineFile(name, bytes));
    }
    // translator.js ist ein ES-Modul, die Worker-Dateien sind CommonJS.
    await writeFile(path.join(temporary, "package.json"), '{"type":"module"}');
    await writeFile(path.join(temporary, "worker", "package.json"), '{"type":"commonjs"}');
    await writeFile(path.join(temporary, "LICENSE.txt"), "bergamot-translator (https://github.com/browsermt/bergamot-translator), Mozilla Public License 2.0. Von TecMon geändert: in worker/translator-worker.js eine Zeile für Windows-Pfade (fileURLToPath), sonst unverändert.\n");
    await writeFile(marker.replace(folder, temporary), ENGINE_MARKER);
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
/** Größte Modelldatei (Japanisch/Koreanisch/Chinesisch ~60 MB) mit Reserve. */
const MODEL_MAX_BYTES = 80 * 1024 * 1024;

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
      const bytes = await download(info.url, MODEL_MAX_BYTES, request);
      if (bytes.length !== info.size || sha256(bytes) !== info.sha256) throw new Error("Prüfsumme des Übersetzungsmodells stimmt nicht. Download abgebrochen.");
      await writeAtomic(file, bytes);
    }
    files[part] = { name: file };
  }
  return { from: key.slice(0, 2), to: key.slice(2, 4), files: entry.config ? { ...files, config: entry.config } : files };
}

/* ---------- Aussehen von Overlay und Chat-Fenster (Nutzerwunsch 22.11.2026) ---------- */

/** Feste Schriftfarben; aus der Oberfläche kommt nur der Schlüssel, nie ein freier Farbwert. */
export const CHAT_COLORS = { weiss: "F3F1F7", gold: "E8C573", lila: "C4B5FD", gruen: "86EFAC", cyan: "67E8F9", rot: "FCA5A5" };
/** Stand der Standardwerte, siehe DEFAULTS_VERSION in gsi-config.mjs. */
export const CHAT_DEFAULTS = 2;
export const CHAT_LOOK_DEFAULT = { width: 30, lines: 6, font: 15, color: "weiss", background: 30, seconds: 30 };
const LOOK_RANGES = { width: [15, 70], lines: [1, 15], font: [10, 32], background: [0, 100], seconds: [5, 600] };

/** Breite (% des Bildschirms), Zeilen, Schriftgröße (px bei 1080p), Farbe, Hintergrund (%), Anzeigedauer (s). */
export function cleanLook(input = {}, base = CHAT_LOOK_DEFAULT) {
  const look = { ...CHAT_LOOK_DEFAULT, ...base };
  for (const [key, [min, max]] of Object.entries(LOOK_RANGES)) {
    const value = Number(input?.[key]);
    if (input?.[key] !== undefined && input?.[key] !== "" && Number.isFinite(value)) look[key] = Math.min(max, Math.max(min, Math.round(value)));
  }
  if (CHAT_COLORS[input?.color]) look.color = input.color;
  return look;
}

/* ---------- Gesamtfunktion ---------- */

export async function createChatTranslator({ dir, cacheDir, cs2Exe = "", request = fetch, now = Date.now, loadEngine, busy = () => false, defaultEnabled = false } = {}) {
  const file = path.join(dir, "chat-translate.json");
  /* Seit 23.11.2026 standardmäßig an (Nutzerentscheid: in CS2 alles an außer Fadenkreuz-Overlay): Übersetzer und
     Sprechblase. Overlay und Chat-Fenster brauchen weiter den bestätigten Hinweis und bleiben bis dahin aus. */
  const fresh = () => ({ defaults: CHAT_DEFAULTS, enabled: defaultEnabled, language: "de", overlay: false, bubble: defaultEnabled, window: false, look: { ...CHAT_LOOK_DEFAULT }, accepted: 0, keys: { all: "F7", team: "F8" }, assumeEnglish: true, launchOptions: CHAT_LAUNCH_OPTIONS });
  let settings = fresh();
  let migrate = false;
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    // Ältere Dateien (früher war alles aus) bekommen die neuen Standards einmal; danach gilt die eigene Wahl.
    const upgrade = defaultEnabled && saved?.defaults !== CHAT_DEFAULTS;
    migrate = upgrade;
    const shown = saved?.overlay === true || saved?.window === true;
    settings = {
      defaults: CHAT_DEFAULTS,
      enabled: upgrade ? true : saved?.enabled === true,
      language: LANGUAGES[saved?.language] ? saved.language : "de",
      overlay: saved?.overlay === true,
      // Sprechblase nur dazuschalten, wenn der Chat nicht schon im Overlay oder Fenster steht (sonst doppelt).
      bubble: upgrade && !shown ? true : saved?.bubble === true,
      window: saved?.window === true,
      look: cleanLook(saved?.look),
      accepted: Number.isInteger(saved?.accepted) ? saved.accepted : 0,
      keys: { all: CHAT_HOTKEYS.includes(saved?.keys?.all) ? saved.keys.all : "F7", team: CHAT_HOTKEYS.includes(saved?.keys?.team) ? saved.keys.team : "F8" },
      assumeEnglish: saved?.assumeEnglish !== false,
      launchOptions: (() => { try { return cleanLaunchOptions(saved?.launchOptions ?? CHAT_LAUNCH_OPTIONS); } catch { return CHAT_LAUNCH_OPTIONS; } })(),
    };
  } catch { /* noch nichts gespeichert */ }
  if (settings.accepted !== CHAT_OVERLAY_NOTICE_VERSION) settings.overlay = false;
  const persist = async () => {
    await mkdir(dir, { recursive: true });
    await writeAtomic(file, JSON.stringify(settings));
  };
  if (migrate) await persist().catch(() => {});
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
      local.onerror = (e) => { engine = { status: "error", error: String(e?.message || e).slice(0, 200) }; resetEngine(); };
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
    // Zuletzt benutzte Modelle ans Ende, höchstens MAX_LOADED_MODELS behalten.
    for (const key of keys) { const value = registry.get(key); registry.delete(key); registry.set(key, value); }
    for (const key of registry.keys()) { if (registry.size <= Math.max(MAX_LOADED_MODELS, keys.length)) break; if (!keys.includes(key)) registry.delete(key); }
    // Neue Modelle: Worker neu starten statt im alten Worker nachzuladen. Der alte gibt seinen
    // Speicher nur beim Beenden frei; Nachladen im selben Worker endete in „Failed to allocate memory“ (22.11.2026).
    if (missing.length) resetEngine();
    const t = await backing();
    engine = { status: "ready", error: "" };
    let timeout;
    try {
      const response = await Promise.race([
        t.translate({ from, to, text, html: false, qualityScores: false }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("Übersetzung hat zu lange gedauert.")), TRANSLATE_TIMEOUT_MS); }),
      ]);
      return cleanText(response?.target?.text, TEXT_MAX);
    } catch (error) {
      // Abgestürzter oder hängender Worker: beim nächsten Mal frisch starten.
      resetEngine();
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function resetEngine() {
    const old = translator;
    translator = null; loading = null;
    try { old?.delete?.(); } catch { /* Worker schon weg */ }
  }
  /* Nacheinander übersetzen, damit eine Flut im Chat die Engine nicht überlastet. */
  const enqueue = (work) => { const next = queue.then(work, work); queue = next.catch(() => {}); return next; };

  function onLine(line, backlog = false) {
    if (paused || busy()) return;
    // Nach einem Neustart nur Chatzeilen der letzten BACKLOG_MS nachholen, nichts Älteres.
    if (backlog) { const t = lineTime(line, now()); if (!(Math.abs(now() - t) <= BACKLOG_MS)) return; }
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
        try {
          const out = keepEmotes(chat.text, await translate(sourceText(chat.text, lang), lang, settings.language));
          // Gibt das Modell den Text unverändert zurück (Dialekt, Namen), ist das keine Übersetzung.
          if (sameText(out, chat.text)) message.status = "unknown";
          else { message.translated = out; message.status = "done"; }
        }
        catch (error) { message.status = "error"; message.error = error.message.slice(0, 160); }
      });
    }
    messages = [message, ...messages].slice(0, MAX_MESSAGES);
  }

  const tail = logFile ? createTail(logFile, onLine, { backlog: BACKLOG_BYTES }) : null;
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
      bubble: settings.bubble,
      window: settings.window,
      look: settings.look,
      colors: CHAT_COLORS,
      notice: CHAT_OVERLAY_NOTICE,
      noticeVersion: CHAT_OVERLAY_NOTICE_VERSION,
      condebug: settings.enabled ? condebug() : "off",
      engine: engine.status,
      engineError: engine.error,
      replyLanguage: lastForeign || "en",
      setupExec: CHAT_SETUP_EXEC,
      launchOptions: settings.launchOptions,
      defaultLaunchOptions: CHAT_LAUNCH_OPTIONS,
    }),
    messages: (limit = MAX_MESSAGES) => messages.slice(0, limit).map(({ error, ...m }) => (error ? { ...m, error } : m)),
    /** Kopfzeile des Overlays: steht immer da, solange das Overlay an ist, damit man sieht, dass TecMon mitliest. */
    overlayHeader() {
      const target = (settings.language || "de").toUpperCase();
      const state = condebug();
      if (state === "missing") return { text: "TECMON CHAT · kein Chat-Log: CS2 über TecMon mit -condebug starten", warn: true };
      if (state === "stale") return { text: "TECMON CHAT · wartet auf CS2 (console.log alt, -condebug aktiv?)", warn: true };
      if (engine.status === "error") return { text: "TECMON CHAT · Übersetzung fehlgeschlagen", warn: true };
      if (engine.status === "download") return { text: `TECMON CHAT · lade Sprachmodell → ${target} …`, warn: false };
      return { text: `TECMON CHAT · übersetzt automatisch → ${target}`, warn: false };
    },
    /** Für das Overlay der Figur: nur frische Zeilen. */
    overlayLines(maxAge = settings.look.seconds * 1000, limit = settings.look.lines) {
      return messages.filter((m) => now() - m.time <= maxAge).slice(0, limit).reverse().map((m) => ({
        id: m.id, channel: m.channel, team: m.team, dead: m.dead, name: m.name, lang: m.lang,
        text: m.status === "done" ? m.translated : m.text, translated: m.status === "done",
      }));
    },
    /** Für TecMons Sprechblase (Nutzerwunsch 22.11.2026): nur fertig übersetzte, frische Zeilen, älteste zuerst. */
    bubbleLines(maxAge = 20000, limit = 4) {
      return messages.filter((m) => m.status === "done" && now() - m.time <= maxAge).slice(0, limit).reverse().map((m) => ({
        id: m.id, channel: m.channel, team: m.team, dead: m.dead, name: m.name, lang: m.lang, text: m.translated,
      }));
    },
    async setSettings(input = {}) {
      if (typeof input.enabled === "boolean") settings.enabled = input.enabled;
      if (LANGUAGES[input.language]) settings.language = input.language;
      if (typeof input.assumeEnglish === "boolean") settings.assumeEnglish = input.assumeEnglish;
      if (typeof input.bubble === "boolean") settings.bubble = input.bubble;
      if (typeof input.window === "boolean") settings.window = input.window;
      if (input.look && typeof input.look === "object") settings.look = cleanLook(input.look, settings.look);
      if (typeof input.launchOptions === "string") settings.launchOptions = cleanLaunchOptions(input.launchOptions || CHAT_LAUNCH_OPTIONS);
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
    /** Steam-Link mit den gespeicherten Startoptionen. */
    launchUrl: () => launchUrl(settings.launchOptions),
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
      settings = { ...fresh(), enabled: false, bubble: false };
      for (const target of [file, ...(cfgDir ? CHAT_FILES.map((f) => path.join(cfgDir, f)) : [])])
        try { await unlink(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
    },
    close() { stopTimer(); resetEngine(); },
    /** Für Tests: eine Zeile so verarbeiten, als stünde sie in console.log. */
    feed: onLine,
    tick,
    idle: () => queue,
  };
  return api;
}
