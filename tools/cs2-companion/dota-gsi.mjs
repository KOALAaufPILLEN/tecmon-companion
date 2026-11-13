import { readFile, writeFile, rename, unlink, mkdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Offizielle Dota-2-Game-State-Integration (GSI): Dota 2 schickt die Daten selbst an
 * 127.0.0.1:31977/gsi/dota2. Nur lesen, nur eigene Werte, keine Eingaben ans Spiel.
 *
 * Erlaubt sind nur diese Blöcke. Verboten sind alles mit Gegner- oder Team-Infos
 * (`buildings`, `minimap`, `roshan`, `couriers`, `draft`, `neutralitems`, `events`,
 * `league`, `wearables`) und Fähigkeiten-Cooldowns.
 */
export const DOTA_GSI_BLOCKS = ["provider", "map", "player", "hero", "items"];
export const DOTA_GSI_FILE = "gamestate_integration_tecmon.cfg";

export function dotaGsiConfigText(token, port = 31977) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Ungültiges GSI-Token.");
  const data = DOTA_GSI_BLOCKS.map((block) => `    "${block}" "1"`).join("\n");
  return `"TecMon Companion Dota 2"
{
  "uri" "http://127.0.0.1:${port}/gsi/dota2"
  "timeout" "5.0"
  "buffer" "0.1"
  "throttle" "0.5"
  "heartbeat" "30.0"
  "auth"
  {
    "token" "${token}"
  }
  "data"
  {
${data}
  }
}
`;
}

/** cfg-Pfad aus dota2.exe (…\game\bin\win64\dota2.exe → …\game\dota\cfg\gamestate_integration). */
export function dotaGsiConfigPath(dotaExe) {
  if (!dotaExe || path.basename(dotaExe).toLowerCase() !== "dota2.exe") return "";
  return path.join(path.dirname(dotaExe), "..", "..", "dota", "cfg", "gamestate_integration", DOTA_GSI_FILE);
}

async function writeAtomic(file, text) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}

export async function installDotaGsiConfig(dotaExe, token) {
  const file = dotaGsiConfigPath(dotaExe);
  if (!file) throw new Error("Dota 2 wurde nicht gefunden.");
  // Der cfg-Ordner muss existieren (Dota installiert); den Unterordner gamestate_integration legen wir an.
  const cfg = path.dirname(path.dirname(file));
  if (!(await stat(cfg).catch(() => null))?.isDirectory()) throw new Error("Der Dota-2-Ordner für Konfigurationen wurde nicht gefunden.");
  await mkdir(path.dirname(file), { recursive: true });
  const text = dotaGsiConfigText(token);
  if ((await readFile(file, "utf8").catch(() => "")) !== text) await writeAtomic(file, text);
  return file;
}

/** Entfernt nur die eigene TecMon-Datei, nie den Ordner oder fremde cfgs. */
export async function removeDotaGsiConfig(dotaExe) {
  const file = dotaGsiConfigPath(dotaExe);
  if (!file) return;
  try {
    await unlink(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v, max = 64) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * Nimmt aus einer GSI-Nachricht nur die eigenen Werte. Als Zuschauer oder im Replay
 * schickt Dota Blöcke je Team (`team2`, `team3`); solche Nachrichten werden verworfen.
 */
export function cleanDotaPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const { map, player, hero, items } = payload;
  if (!player || typeof player !== "object" || "team2" in player || "team3" in player) return null;
  if (hero && typeof hero === "object" && ("team2" in hero || "team3" in hero)) return null;
  if (typeof player.steamid !== "string" || !/^\d{17}$/.test(player.steamid)) return null;
  const ownItems = [];
  if (items && typeof items === "object" && !("team2" in items)) {
    for (let i = 0; i < 9; i++) {
      const it = items[`slot${i}`];
      if (!it || typeof it !== "object" || !str(it.name) || it.name === "empty") continue;
      ownItems.push({ name: str(it.name), canCast: it.can_cast === true, cooldown: num(it.cooldown) ?? 0, passive: it.passive === true });
    }
  }
  return {
    map: map && typeof map === "object"
      ? {
          matchid: str(map.matchid, 24),
          state: str(map.game_state),
          clock: num(map.clock_time),
          paused: map.paused === true,
          winTeam: str(map.win_team, 16),
        }
      : null,
    player: {
      steamid: player.steamid,
      team: str(player.team_name, 16),
      kills: num(player.kills) ?? 0,
      deaths: num(player.deaths) ?? 0,
      assists: num(player.assists) ?? 0,
      lastHits: num(player.last_hits) ?? 0,
      denies: num(player.denies) ?? 0,
      gold: num(player.gold) ?? 0,
      gpm: num(player.gpm) ?? 0,
      xpm: num(player.xpm) ?? 0,
    },
    hero: hero && typeof hero === "object"
      ? {
          name: str(hero.name),
          level: num(hero.level) ?? 0,
          alive: hero.alive !== false,
          buybackCost: num(hero.buyback_cost),
          buybackCooldown: num(hero.buyback_cooldown) ?? 0,
        }
      : null,
    items: ownItems,
  };
}
