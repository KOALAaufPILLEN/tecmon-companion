import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { MAP_SPOTS } from "./map-spots.mjs";

/**
 * TecMons Persönlichkeit, Werte und Interaktionen. Alles bleibt lokal (pet.json).
 * Die Modi färben nur die Ansprache; der sachliche Inhalt eines Tipps bleibt gleich.
 * Der HUAN-Modus frotzelt über das Spiel, nie über Herkunft, Aussehen o. Ä.
 */
export const MODES = [
  { id: "nett", label: "Super nett", short: "Nett" },
  { id: "normal", label: "Normal", short: "Normal" },
  { id: "nerdy", label: "Nerdy", short: "Nerdy" },
  { id: "huan", label: "HUAN-Modus", short: "HUAN" },
];
const MODE_IDS = new Set(MODES.map((m) => m.id));

/* Ansprache vor einem Tipp, je Modus und Art. Leer = Tipp unverändert. */
const OPENERS = {
  nett: {
    death: ["Kein Ding, das passiert den Besten.", "Kopf hoch, nächste Runde gehört dir.", "Du machst das gut, nur ein kleiner Hinweis:"],
    economy: ["Kleiner Tipp mit Herz:", "Ich hab da was für dich:"],
    praise: ["Wow, ich bin so stolz auf dich!", "Das war richtig stark!"],
    mindset: ["Atme kurz durch, du schaffst das.", "Ich glaub an dich."],
    default: ["Hey, nur ganz lieb gemeint:", "Darf ich kurz?", ""],
  },
  normal: { default: [""] },
  nerdy: {
    death: ["Statistisch gesehen war das vermeidbar.", "Post-Mortem-Analyse:", "Interessanter Datenpunkt."],
    economy: ["Rechnen wir kurz:", "Ökonomisch betrachtet:"],
    weapon: ["Laut Rückstoß-Tabelle:", "Fun Fact zur Waffe:"],
    praise: ["Das liegt deutlich über deinem Schnitt.", "Signifikant gute Runde."],
    default: ["Laut meinen Daten:", "Kleine Optimierung:", ""],
  },
  huan: {
    death: ["Schon wieder tot? Respekt, das ist Talent.", "Boah. Ernsthaft jetzt?", "Ich hab's kommen sehen. Du nicht.", "Der Gegner sagt danke für das Geschenk."],
    economy: ["Hör mal zu, Bankrott-Boss:", "Geld ist zum Ausgeben da, aber nicht SO:"],
    praise: ["Okay, das war tatsächlich nicht schlecht. Gewöhn dich nicht dran.", "Na also, geht doch. Wurde auch Zeit."],
    mindset: ["Jetzt nicht rumheulen.", "Reiß dich zusammen, Champ."],
    habit: ["Immer dieselbe Nummer bei dir:", "Ich sag's nur einmal:"],
    default: ["Pass auf, Genie:", "Hör zu, ich erklär's langsam:", "Für dich nochmal zum Mitschreiben:"],
  },
};

/* Sprüche bei Interaktionen. */
const LINES = {
  poke: {
    nett: ["Hihi, das kitzelt!", "Schön, dass du da bist!", "Na, alles gut bei dir?", "Ich freu mich immer, dich zu sehen."],
    normal: ["Hey!", "Ja? Ich bin da.", "Was gibt's?", "Bereit, wenn du's bist."],
    nerdy: ["Klick registriert. Latenz: fast null.", "Eingabe erkannt. Laune +1.", "Wusstest du, dass Mirage 2013 neu gebaut wurde?", "Ping."],
    huan: ["Finger weg, ich bin beschäftigt.", "Nochmal klicken und ich klick zurück.", "Was willst du? Ich hab Feierabend.", "Klick mich nicht an, klick lieber Köpfe."],
  },
  joke: {
    nett: ["Warum ging die Smoke zum Arzt? Sie fühlte sich ganz vernebelt.", "Was sagt ein Bot zum anderen? Du bist mein Lieblings-Byte!"],
    normal: ["Warum hat der CT keine Freunde? Er defused jede Stimmung.", "Mein Lieblingsessen? Eco-Runden. Billig und trotzdem satt."],
    nerdy: ["Es gibt 10 Arten von Spielern: die, die Binär verstehen, und die anderen.", "Ich hab einen UDP-Witz. Weiß aber nicht, ob er ankommt."],
    huan: ["Dein Aim ist wie WLAN im Keller: theoretisch vorhanden.", "Du und die Bombe habt was gemeinsam: Beide liegen am Ende irgendwo rum."],
  },
  compliment: {
    nett: ["Du bist großartig, egal was das Scoreboard sagt.", "Deine Crosshair-Platzierung wird jeden Tag besser!", "Mit dir zocken macht einfach Spaß."],
    normal: ["Gute Arbeit heute.", "Solide gespielt.", "Du wirst besser, ganz klar."],
    nerdy: ["Deine Lernkurve ist positiv. Das ist das Wichtigste.", "Konsistenz schlägt Glück. Und du wirst konsistenter."],
    huan: ["Kompliment? Okay: Du bist nicht der Schlechteste. Knapp.", "Dein Aim ist… vorhanden. Mehr sag ich nicht.", "Für einen Menschen gar nicht so übel."],
  },
  trick: {
    nett: ["Tada! Hat's dir gefallen?", "Extra für dich!"],
    normal: ["Salto!", "Wie war das?"],
    nerdy: ["360 Grad in 0,6 Sekunden. Präzise.", "Rotation abgeschlossen."],
    huan: ["Ich kann 360er. Du nicht mal einen sauberen Flick.", "Siehst du? So dreht man sich um. Nicht wie du bei Lurkern."],
  },
  sleep: {
    nett: ["Gute Nacht! Weck mich, wenn du mich brauchst.", "Ich mach kurz die Augen zu."],
    normal: ["Ich ruh mich kurz aus.", "Kurze Pause."],
    nerdy: ["Energiesparmodus aktiviert.", "Lade Akkus. Bitte nicht stören."],
    huan: ["Endlich Ruhe vor dir.", "Weck mich nur, wenn du gewinnst. Also nie."],
  },
  wake: {
    nett: ["Guten Morgen! Ich hab dich vermisst.", "Da bin ich wieder!"],
    normal: ["Bin wach.", "Wieder da."],
    nerdy: ["System hochgefahren. Alle Werte im grünen Bereich.", "Neustart erfolgreich."],
    huan: ["Was ist?! Ich hab so schön geträumt.", "Ach du schon wieder."],
  },
  tired: {
    nett: ["Ich bin ein bisschen müde… schickst du mich schlafen?"],
    normal: ["Meine Energie ist fast leer."],
    nerdy: ["Akku unter 10 Prozent."],
    huan: ["Ich hab keinen Bock mehr. Schick mich schlafen."],
  },
  mode: {
    nett: ["Ich bin jetzt super lieb zu dir!"],
    normal: ["Alles klar, ganz normal."],
    nerdy: ["Nerd-Modus geladen. Zahlen, Fakten, Rückstoß-Tabellen."],
    huan: ["HUAN-Modus an. Du wolltest es so."],
  },
  win: {
    nett: ["Gewonnen! Du bist toll!", "Super gemacht!"],
    normal: ["Gewonnen.", "Stark."],
    nerdy: ["Neuer Datenpunkt: Sieg.", "Ergebnis über Erwartung."],
    huan: ["Glück gehabt.", "Okay, okay. Einmal darfst du."],
  },
  lose: {
    nett: ["Fast! Nochmal?", "Nicht schlimm, nächstes Mal!"],
    normal: ["Knapp daneben.", "Nochmal?"],
    nerdy: ["Stichprobe zu klein für ein Urteil. Nochmal.", "Ausreißer nach unten."],
    huan: ["Hahaha. Nein.", "Das war peinlich. Nochmal, bevor's wer sieht."],
  },
};

export const ACTIONS = ["poke", "joke", "compliment", "trick", "sleep", "wake"];
export const GAMES = ["reaction", "rps", "quiz", "guess", "memory", "price", "aim"];
/** Bei diesen Spielen ist ein kleinerer Wert besser (Millisekunden, Versuche). */
export const LOWER_BETTER = ["reaction", "guess", "aim"];
const FACE = { poke: "happy", joke: "laugh", compliment: "love", trick: "star", sleep: "sleepy", wake: "surprised", tired: "sleepy", mode: "wink", win: "star", lose: "sad" };
const HUAN_FACE = { compliment: "cool", poke: "angry", trick: "cool", win: "confused", lose: "laugh" };

const pick = (list, rand) => list[Math.floor(rand() * list.length) % list.length];
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** Tipptext im gewählten Modus; Inhalt bleibt, nur ein kurzer Einstieg kommt davor. */
export function flavorTip(mode, category, text, rand = Math.random) {
  const table = OPENERS[MODE_IDS.has(mode) ? mode : "normal"];
  const options = table[category] || table.default || [""];
  const opener = pick(options, rand);
  return opener ? `${opener} ${text}` : text;
}

export function petLine(mode, event, rand = Math.random) {
  const group = LINES[event];
  if (!group) return "";
  return pick(group[MODE_IDS.has(mode) ? mode : "normal"] || group.normal, rand);
}

/** Level aus Erfahrung: jede Stufe braucht etwas mehr. */
export function levelOf(xp) {
  let level = 1, need = 100, rest = Math.max(0, Math.floor(xp));
  while (rest >= need) { rest -= need; level++; need = 100 + (level - 1) * 50; }
  return { level, xp: rest, next: need };
}

/** Callout-Quiz: auf welcher Map liegt dieser Ort? */
export function quizQuestion(rand = Math.random) {
  const maps = Object.entries(MAP_SPOTS).map(([id, m]) => ({ id, name: m.name, spots: m.spots.filter((s) => s.kind === "spot").map((s) => s.label) }));
  const counts = new Map();
  for (const m of maps) for (const s of m.spots) counts.set(s, (counts.get(s) || 0) + 1);
  const pool = maps.flatMap((m) => m.spots.filter((s) => counts.get(s) === 1).map((s) => ({ spot: s, map: m.name })));
  const q = pick(pool, rand);
  const others = maps.map((m) => m.name).filter((n) => n !== q.map).sort(() => rand() - 0.5).slice(0, 3);
  const options = [...others, q.map].sort(() => rand() - 0.5);
  return { question: `Auf welcher Map liegt „${q.spot}“?`, options, answer: options.indexOf(q.map) };
}

async function writeAtomic(file, text) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}

const ENERGY_PER_HOUR = 12; // wach: Energie sinkt
const SLEEP_PER_HOUR = 60; // schlafend: lädt auf
const MOOD_DRIFT_PER_HOUR = 6; // Laune bewegt sich langsam zu 60 zurück

/** TecMons Werte: Level/XP, Laune, Energie, Freundschaft und Zähler. */
export async function createPet(dir, { now = () => Date.now(), rand = Math.random } = {}) {
  const file = path.join(dir, "pet.json");
  let data = { mode: "normal", xp: 0, mood: 70, energy: 80, friendship: 0, asleep: false, at: now(), counts: {}, best: {} };
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (saved && typeof saved === "object") data = { ...data, ...saved, counts: { ...(saved.counts || {}) }, best: { ...(saved.best || {}) } };
    if (!MODE_IDS.has(data.mode)) data.mode = "normal";
  } catch { /* noch nichts gespeichert */ }
  let eventId = 0, event = null, saving = Promise.resolve();

  function tick() {
    const t = now(), hours = Math.max(0, (t - (data.at || t)) / 3600000);
    data.at = t;
    if (data.asleep) data.energy = clamp(data.energy + hours * SLEEP_PER_HOUR);
    else data.energy = clamp(data.energy - hours * ENERGY_PER_HOUR);
    const drift = Math.min(Math.abs(60 - data.mood), hours * MOOD_DRIFT_PER_HOUR);
    data.mood = clamp(data.mood + Math.sign(60 - data.mood) * drift);
  }
  function save() {
    saving = saving.then(async () => { await mkdir(dir, { recursive: true }); await writeAtomic(file, JSON.stringify(data)); }).catch(() => {});
    return saving;
  }
  function say(kind, extra = {}) {
    const face = (data.mode === "huan" && HUAN_FACE[kind]) || FACE[kind] || "happy";
    event = { id: ++eventId, kind, text: petLine(data.mode, kind, rand), face, at: now(), ...extra };
    return event;
  }
  function gain(xp, mood, friendship = 0) {
    data.xp += xp; data.mood = clamp(data.mood + mood); data.friendship = clamp(data.friendship + friendship);
  }
  const count = (key) => { data.counts[key] = (data.counts[key] || 0) + 1; };

  function state() {
    tick();
    const { level, xp, next } = levelOf(data.xp);
    return {
      mode: data.mode, modes: MODES, level, xp, next, totalXp: data.xp,
      mood: data.mood, energy: data.energy, friendship: data.friendship, asleep: data.asleep,
      counts: data.counts, best: data.best, event,
    };
  }

  return {
    state,
    get mode() { return data.mode; },
    async setMode(mode) {
      if (!MODE_IDS.has(mode)) throw new Error("Unbekannter Modus.");
      tick(); data.mode = mode; say("mode"); await save(); return state();
    },
    async interact(action) {
      if (!ACTIONS.includes(action)) throw new Error("Unbekannte Aktion.");
      tick(); count(action);
      if (action === "sleep") { data.asleep = true; say("sleep"); }
      else if (action === "wake") { data.asleep = false; say("wake"); }
      else {
        if (data.asleep) { data.asleep = false; gain(0, -5); say("wake"); await save(); return state(); }
        if (data.energy < 10) { say("tired"); await save(); return state(); }
        data.energy = clamp(data.energy - (action === "trick" ? 4 : 1));
        if (action === "poke") gain(2, 3, 1);
        else if (action === "joke") gain(3, 4, 1);
        else if (action === "compliment") gain(3, 5, 2);
        else if (action === "trick") gain(5, 4, 1);
        say(action, action === "trick" ? { spin: true } : {});
      }
      await save(); return state();
    },
    /** Ergebnis eines Mini-Spiels: win = gewonnen, score = Punkte/Millisekunden. */
    async game(game, { win = false, score = 0 } = {}) {
      if (!GAMES.includes(game)) throw new Error("Unbekanntes Spiel.");
      tick(); count(`game_${game}`); if (win) count(`win_${game}`);
      const n = Number(score);
      if (Number.isFinite(n) && n > 0) {
        const lowerBetter = LOWER_BETTER.includes(game);
        const old = data.best[game];
        if (old === undefined || (lowerBetter ? n < old : n > old)) data.best[game] = Math.round(n);
      }
      data.energy = clamp(data.energy - 2);
      gain(win ? 10 : 3, win ? 6 : 1, 1);
      say(win ? "win" : "lose");
      await save(); return state();
    },
    flavor(category, text) { return flavorTip(data.mode, category, text, rand); },
  };
}
