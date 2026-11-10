import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Zusammenfassung der auf TecMon ausgewerteten Matches, die der Browser über die
 * Companion-Verbindung schickt. Sie bleibt lokal auf diesem PC (insights.json) und
 * dient nur für Rundentipps wie „auf Dust2 oft bei Long gestorben“.
 */
const MAX_ACCOUNTS = 4;
const MAX_MAPS = 20;
const MAX_DEATHS = 400;

const count = (value, max = 1e6) =>
  Number.isInteger(value) && value >= 0 && value <= max ? value : 0;
const HABIT_KEYS = [
  "matches", "rounds", "kills", "deaths", "openingKills", "openingDeaths", "tradedDeaths",
  "shots", "hits", "shotsMoving", "headHits", "unusedNades", "flashes", "enemiesFlashed",
  "teamFlashed", "clutchPlayed", "clutchWon", "roundsAfterLoss", "killsAfterLoss",
  "roundsAfterWin", "killsAfterWin", "damage", "utilityDamage", "teamDamage", "grenades",
  "selfFlashed", "flashAssists", "bombRounds", "bombLost", "plants", "soloPlants", "multi3",
  "tKills", "tDeaths", "ctKills", "ctDeaths", "tAlive", "tAlone", "ctAlive", "ctAlone",
];

/** Eigene Gewohnheiten (insights-v2): nur bekannte Summen, sonst gar nichts. */
function cleanHabits(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const habits = Object.fromEntries(HABIT_KEYS.map((k) => [k, count(raw[k], 1e7)]));
  return habits.matches > 0 && habits.matches <= 1000 ? habits : undefined;
}

/** Eigene Waffen (insights-v2): Name → [Kills, Headshots, Schüsse, Treffer], max. 8. */
function cleanWeapons(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out = {};
  for (const [name, value] of Object.entries(raw).slice(0, 8)) {
    if (!/^[a-z0-9_]{2,30}$/.test(name) || !Array.isArray(value)) continue;
    out[name] = [0, 1, 2, 3].map((i) => count(value[i], 1e7));
  }
  return Object.keys(out).length ? out : undefined;
}

const coordinate = (value) => (Number.isFinite(value) && Math.abs(value) < 20000 ? Math.round(value) : null);

/** Prüft und kürzt eine Übertragung der Webseite; wirft bei ungültigem Aufbau. */
export function cleanInsights(input) {
  if (!input || (input.version !== 1 && input.version !== 2) || !/^\d{17}$/.test(String(input.steamId)))
    throw new Error("Ungültige Match-Auswertung.");
  const maps = {};
  for (const [name, raw] of Object.entries(input.maps || {}).slice(0, MAX_MAPS)) {
    if (!/^[a-z0-9_]{2,40}$/.test(name) || !raw || typeof raw !== "object") continue;
    const deaths = [];
    for (const point of Array.isArray(raw.deaths) ? raw.deaths.slice(-MAX_DEATHS) : []) {
      if (!Array.isArray(point)) continue;
      const x = coordinate(point[0]);
      const y = coordinate(point[1]);
      const side = point[2] === 0 || point[2] === 1 ? point[2] : -1;
      if (x !== null && y !== null) deaths.push([x, y, side]);
    }
    maps[name] = {
      matches: count(raw.matches, 1000),
      won: count(raw.won, 1000),
      tRounds: count(raw.tRounds),
      tWon: count(raw.tWon),
      ctRounds: count(raw.ctRounds),
      ctWon: count(raw.ctWon),
      deaths,
    };
    const habits = input.version === 2 ? cleanHabits(raw.habits) : undefined;
    if (habits) maps[name].habits = habits;
    const weapons = input.version === 2 ? cleanWeapons(raw.weapons) : undefined;
    if (weapons) maps[name].weapons = weapons;
  }
  return {
    version: input.version,
    steamId: String(input.steamId),
    matches: count(input.matches, 1000),
    updatedAt: Date.now(),
    maps,
  };
}

export async function createInsightsStore(directory) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, "insights.json");
  let accounts = {};
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (saved?.version === 1 && saved.accounts && typeof saved.accounts === "object")
      for (const value of Object.values(saved.accounts).slice(0, MAX_ACCOUNTS)) {
        try {
          const clean = cleanInsights(value);
          accounts[clean.steamId] = { ...clean, updatedAt: Number(value.updatedAt) || clean.updatedAt };
        } catch {
          /* beschädigten Eintrag verwerfen */
        }
      }
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  const save = async () => {
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, accounts }), { mode: 0o600 });
    await rename(temporary, file);
  };
  return {
    get(steamId) {
      return accounts[String(steamId)] || null;
    },
    summary() {
      return Object.values(accounts).map((a) => ({
        steamId: a.steamId,
        matches: a.matches,
        maps: Object.keys(a.maps).length,
        updatedAt: a.updatedAt,
      }));
    },
    async put(input) {
      const clean = cleanInsights(input);
      const others = Object.values(accounts)
        .filter((a) => a.steamId !== clean.steamId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_ACCOUNTS - 1);
      accounts = Object.fromEntries([...others, clean].map((a) => [a.steamId, a]));
      await save();
      return { steamId: clean.steamId, maps: Object.keys(clean.maps).length };
    },
    async clear() {
      accounts = {};
      await save();
    },
  };
}
