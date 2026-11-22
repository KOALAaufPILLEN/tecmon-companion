// Einstellungen der Desktop-Figur (TecMon.cs): bleiben über Neustarts und Updates erhalten.
// Gespeichert in desktop.json im Profilordner. Die Figur liest sie aus /api/state (`desktop`)
// und schreibt Änderungen über POST /api/desktop/settings; das Fenster (Linksklick) ebenso.
// „Mit Windows starten“ setzt die Figur selbst im Benutzer-Autostart (HKCU\…\Run).
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** "high" = Echtzeit-3D aus der GLB, "low" = vorab gerenderte Bilder. */
export const DESKTOP_QUALITIES = ["high", "low"];
export const DESKTOP_DEFAULTS = Object.freeze({ quality: "high", wander: true, animate: true, foreground: true, autostart: false, chatPos: null });
const FLAGS = ["wander", "animate", "foreground", "autostart"];

const LIMIT = 100000;
function chatPosition(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Number.isInteger(value.x) && Number.isInteger(value.y) && Math.abs(value.x) <= LIMIT && Math.abs(value.y) <= LIMIT;
}

/** Nur bekannte Felder mit gültigen Werten übernehmen; alles andere bleibt wie vorher. */
export function cleanDesktopSettings(input, previous = DESKTOP_DEFAULTS) {
  const next = { ...DESKTOP_DEFAULTS, ...previous };
  if (!input || typeof input !== "object" || Array.isArray(input)) return next;
  if (DESKTOP_QUALITIES.includes(input.quality)) next.quality = input.quality;
  for (const key of FLAGS) if (typeof input[key] === "boolean") next[key] = input[key];
  // Position des Chat-Overlays (linke untere Ecke in Windows-Bildschirmkoordinaten, auch zweiter Bildschirm); null = unten mittig.
  if (input.chatPos === null) next.chatPos = null;
  else if (chatPosition(input.chatPos)) next.chatPos = { x: input.chatPos.x, y: input.chatPos.y };
  return next;
}

export async function createDesktopSettings(dir) {
  const file = path.join(dir, "desktop.json");
  let current = { ...DESKTOP_DEFAULTS };
  try { current = cleanDesktopSettings(JSON.parse(await readFile(file, "utf8"))); } catch { /* noch nichts gespeichert */ }
  return {
    get: () => ({ ...current }),
    async set(input) {
      const next = cleanDesktopSettings(input, current);
      if (JSON.stringify(next) === JSON.stringify(current)) return { ...current };
      await mkdir(dir, { recursive: true });
      const temporary = `${file}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(next), { mode: 0o600 });
      await rename(temporary, file);
      current = next;
      return { ...current };
    },
  };
}
