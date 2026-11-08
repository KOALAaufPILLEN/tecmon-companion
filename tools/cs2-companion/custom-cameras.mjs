import path from "node:path";
import { readFile } from "node:fs/promises";

/**
 * Feste Kamerapunkte fuer CS Demo Manager. CSDM liest eigene Kameras aus seiner
 * Tabelle `cameras` und springt zur Szene mit `spec_goto x y z pitch yaw`.
 * Der Companion verwaltet diese Datenbank selbst, legt die Punkte eines
 * Auftrags direkt vor der Aufnahme an und raeumt sie danach wieder weg.
 * Alle Werte sind vorher in job.mjs als Zahlen geprueft; die SQL-Texte enthalten
 * nur Zahlen, UUIDs, feste Namen und einen geprueften Kartennamen.
 */
export const CAMERA_MARK = "tecmon-companion";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function cameraSql(map, cameras) {
  if (!/^[a-z0-9_]{1,64}$/i.test(map)) throw new Error("Unbekannter Kartenname für Kamerapunkte.");
  const n = (v) => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Ungültiger Kamerapunkt.");
    return String(v);
  };
  const rows = cameras.map((c) => {
    if (!UUID.test(c.id) || !/^TecMon \d{1,2}\.\d{1,2}$/.test(c.name)) throw new Error("Ungültiger Kamerapunkt.");
    return `('${c.id}','CS2','${c.name}','${map}',${n(c.x)},${n(c.y)},${n(c.z)},${n(c.pitch)},${n(c.yaw)},'${CAMERA_MARK}','#ffd23f')`;
  });
  return [
    "BEGIN;",
    `DELETE FROM cameras WHERE comment = '${CAMERA_MARK}';`,
    ...(rows.length
      ? [`INSERT INTO cameras (id, game, name, map_name, x, y, z, pitch, yaw, comment, color) VALUES\n${rows.join(",\n")};`]
      : []),
    "COMMIT;",
    "",
  ].join("\n");
}

export function cleanupSql() {
  return `DELETE FROM cameras WHERE comment = '${CAMERA_MARK}';\n`;
}

/** SQL ueber psql der verwalteten Installation ausfuehren (Zugang aus den CSDM-Einstellungen). */
export async function runCameraSql(installation, sql, runTool) {
  const settings = JSON.parse(await readFile(path.join(installation.profileDir, ".csdm", "settings.json"), "utf8"));
  const db = settings.database;
  if (!db || typeof db.password !== "string") throw new Error("Datenbankzugang für Kamerapunkte fehlt.");
  await runTool(
    path.join(installation.postgresBin, "psql.exe"),
    ["-X", "-w", "-q", "-h", "127.0.0.1", "-p", String(db.port), "-U", db.username, "-d", db.database, "-v", "ON_ERROR_STOP=1"],
    { env: { ...process.env, PGPASSWORD: db.password, PGCONNECT_TIMEOUT: "5" }, input: sql },
  );
}
