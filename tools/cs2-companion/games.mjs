import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Spiel-Pakete: Der Nutzer entscheidet, für welche Spiele TecMon Daten anlegt.
 * Ein entferntes Paket schreibt keine Dateien mehr (keine cfg im Spielordner,
 * keine übertragenen Webseiten-Daten) und seine Einträge verschwinden aus den
 * Menüs. Die Highlight-Aufnahme gehört nicht dazu: Sie ist Teil des
 * Companions und bleibt, damit die Webseite weiter aufnehmen kann.
 */
export const GAME_CATALOG = [
  {
    id: "cs2",
    label: "Counter-Strike 2",
    short: "CS2",
    status: "available",
    features: ["Rundentipps", "Fadenkreuz", "CS2-Quiz", "Webseiten-Daten aus „Meine Stats“"],
    data: ["gamestate_integration_tecmon.cfg und tecmon_crosshair.cfg im CS2-Ordner", "crosshair.json und insights.json im Companion-Profil"],
  },
  { id: "valorant", label: "Valorant", short: "Valorant", status: "planned", features: [], data: [] },
  { id: "dota2", label: "Dota 2", short: "Dota 2", status: "planned", features: [], data: [] },
  {
    id: "deadlock",
    label: "Deadlock",
    short: "Deadlock",
    status: "planned",
    features: [],
    data: [],
    // Deadlock hat keine offizielle Game State Integration. Die Replay-Auswertung
    // laeuft deshalb auf der Webseite im Browser, nicht im Companion.
    web: "Replay-Auswertung auf der Webseite unter Games → Deadlock → Replay",
  },
  { id: "wardogs", label: "Wardogs", short: "Wardogs", status: "planned", features: [], data: [] },
];

/** Ohne gespeicherte Auswahl ist CS2 installiert, damit bestehende Installationen nichts verlieren. */
const DEFAULT_INSTALLED = { cs2: true };

async function writeAtomic(file, text) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}

export async function createGamePackages(dir) {
  const file = path.join(dir, "games.json");
  let installed = { ...DEFAULT_INSTALLED };
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (saved && typeof saved.installed === "object") {
      installed = {};
      for (const game of GAME_CATALOG) if (saved.installed[game.id] === true && game.status === "available") installed[game.id] = true;
    }
  } catch { /* noch nichts gespeichert */ }
  const save = async () => {
    await mkdir(dir, { recursive: true });
    await writeAtomic(file, JSON.stringify({ installed }));
  };
  const find = (id) => {
    const game = GAME_CATALOG.find((g) => g.id === id);
    if (!game) throw new Error("Unbekanntes Spiel.");
    return game;
  };
  return {
    has: (id) => installed[id] === true,
    state: () => GAME_CATALOG.map((g) => ({ ...g, installed: installed[g.id] === true })),
    async install(id) {
      const game = find(id);
      if (game.status !== "available") throw new Error(`${game.label} ist geplant und noch nicht verfügbar.`);
      installed[id] = true;
      await save();
    },
    async remove(id) {
      find(id);
      delete installed[id];
      await save();
    },
  };
}
