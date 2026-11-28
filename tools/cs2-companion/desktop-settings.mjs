// Einstellungen der Desktop-Figur (TecMon.cs): bleiben über Neustarts und Updates erhalten.
// Gespeichert in desktop.json im Profilordner. Die Figur liest sie aus /api/state (`desktop`)
// und schreibt Änderungen über POST /api/desktop/settings; das Fenster (Linksklick) ebenso.
// „Mit Windows starten“ setzt die Figur selbst im Benutzer-Autostart (HKCU\…\Run).
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** "high" = Echtzeit-3D aus der GLB, "low" = vorab gerenderte Bilder. */
export const DESKTOP_QUALITIES = ["high", "low"];
/**
 * Ansicht der Companion-Oberfläche (Nutzerwunsch 25.11.2026): "simple" zeigt nur das Nötigste mit
 * kurzen Erklärungen, "advanced" alle Einstellungen einzeln. Neue Installationen wählen im Setup
 * (Standard „Einfach“); ältere Installationen ohne Feld behalten „Erweitert“, damit nichts verschwindet.
 */
export const UI_MODES = ["simple", "advanced"];
/** Stand des Einsteiger-Tutorials. Kleiner als TUTORIAL_VERSION = beim nächsten Öffnen zeigen. */
export const TUTORIAL_VERSION = 1;
export const MOTION_MODES = ["still", "chill", "hyper"];
export const MENU_KEYS = ["none", ...Array.from({length:12},(_,i)=>`F${i+1}`), ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", "Home", "End", "Insert", "PageUp", "PageDown", "Pause"];
export const DESKTOP_DEFAULTS = Object.freeze({ quality: "high", motion: "chill", gameEconomy: true, wander: true, animate: true, foreground: true, autostart: false, chatPos: null, ui: "advanced", tutorial: TUTORIAL_VERSION, bubblePlacement: "both", menuKey: "none", menuModifier: "none" });
const FLAGS = ["animate", "foreground", "autostart", "gameEconomy"];

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
  // Alte Clients behalten ihren Schalter; neue Clients wählen einen Bewegungsmodus.
  // Explizite Modi haben Vorrang. wander bleibt nur als kompatibles abgeleitetes Feld.
  if (MOTION_MODES.includes(input.motion)) next.motion = input.motion;
  else if (typeof input.wander === "boolean") next.motion = input.wander ? "chill" : "still";
  next.wander = next.motion !== "still";
  for (const key of FLAGS) if (typeof input[key] === "boolean") next[key] = input[key];
  if (UI_MODES.includes(input.ui)) next.ui = input.ui;
  if (["pet", "game", "both"].includes(input.bubblePlacement)) next.bubblePlacement = input.bubblePlacement;
  if (MENU_KEYS.includes(input.menuKey)) next.menuKey = input.menuKey;
  if (["none", "Control", "Alt", "Shift", "Win"].includes(input.menuModifier)) next.menuModifier = input.menuModifier;
  if (Number.isInteger(input.tutorial) && input.tutorial >= 0 && input.tutorial <= TUTORIAL_VERSION) next.tutorial = input.tutorial;
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
