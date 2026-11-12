import path from "node:path";
import { readFile, writeFile, copyFile, rename, stat, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

// Offizieller Upstream-Build, neu gebaut nach dem CS2-Update vom 11.11.2026 (der vorige Build
// stürzte damit beim Demo-Start ab); unveränderliche Quell- und Binär-Revision.
export const PLUGIN_REVISION = "3ba51c9d9a09d1c73cfda2d4cd2cebf0b974168b";
export const PLUGIN_SHA256 = "ca12990d42c6555f7f99cbb37677eaddaf19ddaf8ef47ac257a2cb0e67c94730";
const STOCK_SHA256 = "43f15c8c689efb4b1edad6b0b7b537bc4cf36223b870b8356a430f65a800a4d7";
/** Eigene frühere Plugin-Stände, die beim Update ersetzt werden dürfen (Fix #1483, 01f655f2). */
const PREVIOUS_SHA256 = ["1ad610f84577d4e9ef22e2757858049420f86649cd89a1afcd4738358d054086"];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function ensureRecordingPlugin(installation, progress = () => {}, request = fetch) {
  if (!installation || process.platform !== "win32") return;
  const target = path.join(
    path.dirname(installation.csdmExe),
    "resources",
    "static",
    "cs2",
    "server.dll",
  );
  const current = await readFile(target);
  if (digest(current) === PLUGIN_SHA256) return;
  if (digest(current) !== STOCK_SHA256 && !PREVIOUS_SHA256.includes(digest(current)))
    throw new Error(
      "Unbekannte CS2-Plugin-Version. Companion aktualisieren; vorhandenes Plugin wird nicht überschrieben.",
    );
  progress("Aktualisiere das offizielle CS2-Aufnahme-Plugin (Fix für fehlende Szenensprünge) …");
  const response = await request(
    `https://raw.githubusercontent.com/akiver/cs-demo-manager/${PLUGIN_REVISION}/static/cs2/server.dll`,
    { signal: AbortSignal.timeout(120000) },
  );
  if (!response.ok || Number(response.headers.get("content-length")) > 4 * 1024 * 1024)
    throw new Error("CS2-Plugin konnte nicht geladen werden.");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw new Error("CS2-Plugin zu groß.");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (digest(bytes) !== PLUGIN_SHA256)
    throw new Error("Prüfsumme des CS2-Plugins stimmt nicht. Aufnahme abgebrochen.");
  const backup = target + ".3.20.1-backup";
  try {
    await stat(backup);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await copyFile(target, backup);
  }
  const temporary = target + "." + randomUUID() + ".tmp";
  await writeFile(temporary, bytes);
  await rename(temporary, target);
  progress("CS2-Plugin mit bestätigtem SHA-256 installiert.");
}

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
    return `CS2 ist während der Aufnahme abgestürzt (Absturzbericht ${crash}). Meist passt nach einem CS2-Update das Aufnahme-Plugin oder HLAE noch nicht: Companion aktualisieren und erneut versuchen. Es wurde keine MP4 gespeichert.`;
  if (pluginLog && !pluginLog.includes("Hooked FrameStageNotify"))
    return "CS2 hat das Demo-Plugin geladen, aber die Szenensteuerung nicht aktiviert. CS2 und CS Demo Manager schließen und Companion aktualisieren. Es wurde keine MP4 gespeichert.";
  if (/Raw files not found/i.test(error.message))
    return "CS2 hat keine Rohaufnahme erzeugt. HLAE-/Plugin-Protokoll prüfen; es wurde keine MP4 gespeichert.";
  return error.message;
}
