import path from "node:path";
import { readFile, stat, readdir } from "node:fs/promises";

// Offizieller Upstream-Build, neu gebaut nach dem CS2-Update vom 11.11.2026 (der vorige Build
// stürzte damit beim Demo-Start ab); unveränderliche Quell- und Binär-Revision.
export const PLUGIN_REVISION = "3ba51c9d9a09d1c73cfda2d4cd2cebf0b974168b";
export const PLUGIN_SHA256 = "ca12990d42c6555f7f99cbb37677eaddaf19ddaf8ef47ac257a2cb0e67c94730";
/** Absturzbericht, den CS2 seit `since` (ms) neben cs2.exe geschrieben hat; sonst "". */
export async function crashSince(cs2Exe, since) {
  if (!cs2Exe) return "";
  const folder = path.dirname(cs2Exe);
  const names = await readdir(folder).catch(() => []);
  let newest = "";
  let newestTime = 0;
  for (const name of names) {
    if (!/^cs2_.*\.mdmp$/i.test(name)) continue;
    const time = await stat(path.join(folder, name)).then((s) => s.mtimeMs, () => 0);
    if (time >= since && time > newestTime) {
      newest = name;
      newestTime = time;
    }
  }
  return newest;
}

export function recordingFailure(error, pluginLog, crash = "") {
  if (crash)
    return `${error.message} Während des Aufnahmeversuchs hat CS2 einen Fehlerbericht geschrieben (${crash}). Daraus allein lässt sich die Ursache nicht bestimmen oder erkennen, ob CS2 noch läuft. HLAE-/Plugin-Protokoll und Demo prüfen.`;
  if (/Raw files not found/i.test(error.message) && pluginLog && !pluginLog.includes("Hooked FrameStageNotify"))
    return "CS2 hat das Demo-Plugin geladen, aber die Szenensteuerung nicht aktiviert. CS2 schließen und Companion aktualisieren. Es wurde keine MP4 gespeichert.";
  if (/Raw files not found/i.test(error.message))
    return "CS2 hat keine Rohaufnahme erzeugt. HLAE-/Plugin-Protokoll prüfen; es wurde keine MP4 gespeichert.";
  return error.message;
}
