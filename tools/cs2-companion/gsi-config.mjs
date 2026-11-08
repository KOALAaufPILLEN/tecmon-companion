import { readFile, writeFile, rename, unlink, mkdir, stat } from "node:fs/promises";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";

export const GSI_FILE = "gamestate_integration_tecmon.cfg";
export const GSI_PORT = 31977;

/** Offizielle CS2-GSI-Konfiguration: nur eigene Spielerdaten, kein Zuschauer-/Bombenblock. */
export function gsiConfigText(token, port = GSI_PORT) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Ungültiges GSI-Token.");
  return `"TecMon Companion Rundentipps"
{
  "uri" "http://127.0.0.1:${port}/gsi"
  "timeout" "1.1"
  "buffer" "0.1"
  "throttle" "0.25"
  "heartbeat" "10.0"
  "auth"
  {
    "token" "${token}"
  }
  "data"
  {
    "provider" "1"
    "map" "1"
    "round" "1"
    "player_id" "1"
    "player_state" "1"
    "player_weapons" "1"
    "player_match_stats" "1"
  }
}
`;
}

/** cfg-Ordner aus dem Pfad zu cs2.exe (…\game\bin\win64\cs2.exe → …\game\csgo\cfg). */
export function gsiConfigPath(cs2Exe) {
  if (!cs2Exe || path.basename(cs2Exe).toLowerCase() !== "cs2.exe") return "";
  return path.join(path.dirname(cs2Exe), "..", "..", "csgo", "cfg", GSI_FILE);
}

async function writeAtomic(file, text, mode) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, mode ? { mode } : undefined);
  await rename(temporary, file);
}

/** Einstellungen (Token, an/aus) bleiben über Neustarts erhalten, damit CS2 nicht neu gestartet werden muss. */
export async function createGsiSettings(directory) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, "gsi.json");
  let settings = { version: 1, enabled: false, token: randomBytes(32).toString("hex") };
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (saved.version === 1 && /^[a-f0-9]{64}$/.test(saved.token))
      settings = { version: 1, enabled: saved.enabled === true, token: saved.token };
  } catch (error) {
    if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
  }
  const save = () => writeAtomic(file, JSON.stringify(settings), 0o600);
  const expected = Buffer.from(settings.token);
  return {
    get enabled() {
      return settings.enabled;
    },
    get token() {
      return settings.token;
    },
    matches(token) {
      const given = Buffer.from(typeof token === "string" ? token : "");
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
    async setEnabled(value) {
      settings.enabled = value === true;
      await save();
    },
  };
}

/** Legt die cfg-Datei an oder aktualisiert sie. Gibt den Pfad zurück. */
export async function installGsiConfig(cs2Exe, token) {
  const file = gsiConfigPath(cs2Exe);
  if (!file) throw new Error("CS2 wurde nicht gefunden.");
  const folder = path.dirname(file);
  if (!(await stat(folder).catch(() => null))?.isDirectory())
    throw new Error("Der CS2-Ordner für Konfigurationen wurde nicht gefunden.");
  const text = gsiConfigText(token);
  const existing = await readFile(file, "utf8").catch(() => "");
  if (existing !== text) await writeAtomic(file, text);
  return file;
}

/** Entfernt nur die eigene TecMon-Datei. */
export async function removeGsiConfig(cs2Exe) {
  const file = gsiConfigPath(cs2Exe);
  if (!file) return;
  try {
    await unlink(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function gsiConfigInstalled(cs2Exe, token) {
  const file = gsiConfigPath(cs2Exe);
  if (!file) return false;
  return (await readFile(file, "utf8").catch(() => "")) === gsiConfigText(token);
}
