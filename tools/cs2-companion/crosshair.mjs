import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Fadenkreuz-Editor: erzeugt nur CS2-eigene Einstellungen (cl_crosshair*-Befehle
 * als cfg-Datei). Kein Overlay, keine Eingaben an das Spiel. Die cfg lädt der
 * Spieler selbst mit "exec tecmon_crosshair" in der Konsole.
 */
export const CROSSHAIR_FILE = "tecmon_crosshair.cfg";
export const CROSSHAIR_EXEC = "exec tecmon_crosshair";

export const STYLES = [
  { id: 0, label: "Standard (dynamisch)" },
  { id: 1, label: "Standard (statisch)" },
  { id: 2, label: "Klassisch" },
  { id: 3, label: "Klassisch (dynamisch)" },
  { id: 4, label: "Klassisch (statisch)" },
  { id: 5, label: "Legacy" },
];

export const DEFAULT_CROSSHAIR = Object.freeze({
  style: 4, size: 2, gap: -2, thickness: 1, outline: true, outlineThickness: 1,
  color: [167, 139, 250], alpha: 255, dot: false, tStyle: false,
});

export const PRESETS = [
  { id: "tecmon", label: "TecMon", crosshair: { ...DEFAULT_CROSSHAIR } },
  { id: "klein", label: "Klein & grün", crosshair: { ...DEFAULT_CROSSHAIR, size: 1.5, gap: -3, thickness: 0.5, color: [80, 250, 80] } },
  { id: "punkt", label: "Nur Punkt", crosshair: { ...DEFAULT_CROSSHAIR, size: 0, gap: -5, thickness: 1, dot: true, color: [50, 250, 250] } },
  { id: "t", label: "T-Form", crosshair: { ...DEFAULT_CROSSHAIR, size: 3, gap: -1, tStyle: true, color: [250, 250, 50] } },
  { id: "gross", label: "Groß & gelb", crosshair: { ...DEFAULT_CROSSHAIR, size: 4, gap: 0, thickness: 1.5, color: [250, 250, 50] } },
];

const clamp = (value, min, max, step) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const v = Math.round(Math.min(max, Math.max(min, n)) / step) * step;
  return Number(v.toFixed(2));
};

/** Eingaben prüfen und auf erlaubte Bereiche runden; Unbekanntes fällt auf den Standard zurück. */
export function cleanCrosshair(input) {
  const src = input && typeof input === "object" ? input : {};
  const d = DEFAULT_CROSSHAIR;
  const pick = (key, min, max, step) => {
    const v = clamp(src[key], min, max, step);
    return v === null ? d[key] : v;
  };
  const color = Array.isArray(src.color) && src.color.length === 3
    ? src.color.map((c, i) => { const v = clamp(c, 0, 255, 1); return v === null ? d.color[i] : v; })
    : [...d.color];
  return {
    style: Number.isInteger(src.style) && src.style >= 0 && src.style <= 5 ? src.style : d.style,
    size: pick("size", 0, 10, 0.5),
    gap: pick("gap", -5, 5, 0.5),
    thickness: pick("thickness", 0, 3, 0.1),
    outline: typeof src.outline === "boolean" ? src.outline : d.outline,
    outlineThickness: pick("outlineThickness", 0, 3, 0.5),
    color,
    alpha: pick("alpha", 0, 255, 1),
    dot: typeof src.dot === "boolean" ? src.dot : d.dot,
    tStyle: typeof src.tStyle === "boolean" ? src.tStyle : d.tStyle,
  };
}

/** Konsolenbefehle; Werte stammen nur aus cleanCrosshair(), nie aus freiem Text. */
export function crosshairCommands(input) {
  const c = cleanCrosshair(input);
  const b = (v) => (v ? 1 : 0);
  return [
    `cl_crosshairstyle ${c.style}`,
    `cl_crosshairsize ${c.size}`,
    `cl_crosshairgap ${c.gap}`,
    `cl_crosshairthickness ${c.thickness}`,
    `cl_crosshair_drawoutline ${b(c.outline)}`,
    `cl_crosshair_outlinethickness ${c.outlineThickness}`,
    "cl_crosshaircolor 5",
    `cl_crosshaircolor_r ${c.color[0]}`,
    `cl_crosshaircolor_g ${c.color[1]}`,
    `cl_crosshaircolor_b ${c.color[2]}`,
    `cl_crosshairusealpha ${b(c.alpha < 255)}`,
    `cl_crosshairalpha ${c.alpha}`,
    `cl_crosshairdot ${b(c.dot)}`,
    `cl_crosshair_t ${b(c.tStyle)}`,
    "cl_crosshairgap_useweaponvalue 0",
  ];
}

export function crosshairConfigText(input) {
  return `// TecMon Companion: Fadenkreuz. In der CS2-Konsole laden mit: ${CROSSHAIR_EXEC}\n`
    + crosshairCommands(input).join("\n") + "\n"
    + 'echo "TecMon-Fadenkreuz geladen."\n';
}

/** cfg-Ordner aus dem Pfad zu cs2.exe (…\game\bin\win64\cs2.exe → …\game\csgo\cfg). */
export function crosshairConfigPath(cs2Exe) {
  if (!cs2Exe || path.basename(cs2Exe).toLowerCase() !== "cs2.exe") return "";
  return path.join(path.dirname(cs2Exe), "..", "..", "csgo", "cfg", CROSSHAIR_FILE);
}

/* CS2-Fadenkreuz-Codes (CSGO-xxxxx-…): 18 Bytes als Zahl zur Basis 57, Byte 0 = Prüfsumme. */
const DICTIONARY = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789";
const PRESET_COLORS = [[250, 50, 50], [50, 250, 50], [250, 250, 50], [50, 50, 250], [50, 250, 250]];

/** Fadenkreuz-Code aus CS2 einlesen; null bei ungültigem Code. */
export function decodeCrosshairCode(code) {
  const body = String(code || "").trim().replace(/^CSGO/, "").replace(/-/g, "");
  if (body.length !== 25) return null;
  let n = 0n;
  for (const ch of [...body].reverse()) {
    const v = DICTIONARY.indexOf(ch);
    if (v < 0) return null;
    n = n * 57n + BigInt(v);
  }
  const hex = n.toString(16).padStart(36, "0");
  if (hex.length > 36) return null;
  const b = [];
  for (let i = 0; i < 36; i += 2) b.push(parseInt(hex.slice(i, i + 2), 16));
  if (b.slice(1).reduce((a, v) => a + v, 0) % 256 !== b[0]) return null;
  const int8 = (v) => (v > 127 ? v - 256 : v);
  const colorIndex = b[10] & 7, flags = b[13] >> 4;
  return cleanCrosshair({
    gap: int8(b[2]) / 10,
    outlineThickness: b[3] / 2,
    color: colorIndex === 5 ? [b[4], b[5], b[6]] : (PRESET_COLORS[colorIndex] || PRESET_COLORS[1]),
    alpha: flags & 4 ? b[7] : 255,
    outline: (b[10] & 8) === 8,
    thickness: b[12] / 10,
    dot: (flags & 1) === 1,
    tStyle: (flags & 8) === 8,
    style: (b[13] & 0xf) >> 1,
    size: (((b[15] & 0x1f) << 8) | b[14]) / 10,
  });
}

async function writeAtomic(file, text) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}

/** Gespeicherte Auswahl (crosshair.json im Profilordner) und Schreiben der cfg. */
export async function createCrosshairSettings(dir) {
  const file = path.join(dir, "crosshair.json");
  let current = { ...DEFAULT_CROSSHAIR };
  try { current = cleanCrosshair(JSON.parse(await readFile(file, "utf8"))); } catch { /* noch nichts gespeichert */ }
  return {
    get: () => current,
    async save(input, cs2Exe) {
      current = cleanCrosshair(input);
      await mkdir(dir, { recursive: true });
      await writeAtomic(file, JSON.stringify(current));
      const target = crosshairConfigPath(cs2Exe);
      if (!target) return { crosshair: current, written: false };
      await mkdir(path.dirname(target), { recursive: true });
      await writeAtomic(target, crosshairConfigText(current));
      return { crosshair: current, written: true };
    },
  };
}
