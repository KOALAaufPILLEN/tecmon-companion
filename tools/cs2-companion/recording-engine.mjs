import path from "node:path";
import { readFile, writeFile, copyFile, rename, stat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

// Official upstream build containing merged fix #1483; immutable source and binary revision.
export const PLUGIN_REVISION = "01f655f20141d366e07a5869f84554df3a61c64a";
export const PLUGIN_SHA256 = "1ad610f84577d4e9ef22e2757858049420f86649cd89a1afcd4738358d054086";
const STOCK_SHA256 = "43f15c8c689efb4b1edad6b0b7b537bc4cf36223b870b8356a430f65a800a4d7";
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
  if (digest(current) !== STOCK_SHA256)
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

export function recordingFailure(error, pluginLog) {
  if (pluginLog && !pluginLog.includes("Hooked FrameStageNotify"))
    return "CS2 hat das Demo-Plugin geladen, aber die Szenensteuerung nicht aktiviert. CS2 und CS Demo Manager schließen und Companion aktualisieren. Es wurde keine MP4 gespeichert.";
  if (/Raw files not found/i.test(error.message))
    return "CS2 hat keine Rohaufnahme erzeugt. HLAE-/Plugin-Protokoll prüfen; es wurde keine MP4 gespeichert.";
  return error.message;
}
