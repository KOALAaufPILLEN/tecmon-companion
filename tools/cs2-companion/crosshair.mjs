import { readFile, writeFile, rename, mkdir, unlink, readdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { gameCrosshair } from "./game-crosshairs.mjs";

/**
 * Fadenkreuz-Editor: erzeugt nur CS2-eigene Einstellungen (cl_crosshair*-Befehle
 * als cfg-Datei), keine Eingaben an das Spiel. Das optionale Overlay (unten) ist ein
 * eigenes Fenster der Figur außerhalb von CS2. Die cfg lädt der
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

/** Read settings only: never execute imported commands, exec, aliases or binds. */
export function parseCrosshairConfig(text, base = DEFAULT_CROSSHAIR) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 65536) throw new Error("CFG bitte höchstens 64 KB groß wählen.");
  const c = cleanCrosshair(base), values = new Map(), unsupported = new Set(); let ignored = 0;
  const specs = {
    cl_crosshairstyle: ["style",0,5], cl_crosshairsize: ["size",0,10], cl_crosshairgap: ["gap",-5,5],
    cl_crosshairthickness: ["thickness",0,3], cl_crosshair_outlinethickness: ["outlineThickness",0,3],
    cl_crosshair_drawoutline: ["outline",0,1], cl_crosshairdot: ["dot",0,1], cl_crosshair_t: ["tStyle",0,1],
    cl_crosshairalpha: ["alpha",0,255], cl_crosshairusealpha: ["usealpha",0,1],
    cl_crosshaircolor: ["colorIndex",0,5], cl_crosshaircolor_r: ["red",0,255],
    cl_crosshaircolor_g: ["green",0,255], cl_crosshaircolor_b: ["blue",0,255],
  };
  for (const statement of text.replace(/^\uFEFF/, "").replace(/\/\/[^\r\n]*/g, "").split(/[;\r\n]+/)) {
    const line = statement.trim(); if (!line) continue;
    const command = line.match(/^([a-zA-Z_][a-zA-Z_0-9]*)/)?.[1]?.toLowerCase();
    if (!command || !Object.hasOwn(specs, command)) { ignored++; if(command?.startsWith("cl_crosshair")) unsupported.add(command); continue; }
    const match = line.match(/^[a-zA-Z_][a-zA-Z_0-9]*\s+(?:"(-?\d+(?:\.\d+)?)"|(-?\d+(?:\.\d+)?))\s*$/);
    const [key,min,max] = specs[command], n = match ? Number(match[1] ?? match[2]) : NaN;
    const integer = ["style","outline","dot","tStyle","alpha","usealpha","colorIndex","red","green","blue"].includes(key);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error("Ungültiger oder nicht unterstützter CFG-Wert für " + command + ".");
    values.set(key,n);
  }
  if (!values.size) throw new Error("Keine unterstützten Fadenkreuzwerte in der CFG gefunden.");
  for(const [key,n] of values) if(Object.hasOwn(c,key) && key!=="color") c[key] = ["outline","dot","tStyle"].includes(key) ? n===1 : n;
  for(const [index,key] of ["red","green","blue"].entries()) if(values.has(key)) c.color[index] = values.get(key);
  if(values.has("colorIndex") && values.get("colorIndex") < 5) c.color=[...PRESET_COLORS[values.get("colorIndex")]];
  if(values.get("usealpha")===0) c.alpha=255;
  const crosshair=cleanCrosshair(c), rounded=Object.keys(c).filter(key=>typeof c[key]==="number" && c[key]!==crosshair[key]);
  return {crosshair, imported:values.size, ignored, unsupported:[...unsupported], rounded};
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
export async function createCrosshairSettings(dir, initial = DEFAULT_CROSSHAIR) {
  const file = path.join(dir, "crosshair.json");
  let current = cleanCrosshair(initial);
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
    /** Nur die eigenen Dateien löschen: crosshair.json und tecmon_crosshair.cfg. */
    async reset(cs2Exe, keepProfile = false) {
      if (!keepProfile) current = { ...DEFAULT_CROSSHAIR };
      for (const target of [keepProfile ? "" : file, crosshairConfigPath(cs2Exe)]) {
        if (!target) continue;
        try { await unlink(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
    },
  };
}

/* Globales, statisches Windows-Overlay; kein Spielprozess-Zugriff. Die native Figur
 * bestimmt Fenster/Bildschirm, arbeitet durchklickbar und aktiviert sich nie.
 * Standardmaessig aus. Ein geaenderter Hinweis braucht erneut Zustimmung. */
export const OVERLAY_NOTICE_VERSION = 2;
export const OVERLAY_NOTICE = [
  "Das Overlay ist ein eigenes, durchklickbares Windows-Fenster. Es greift in keinen Spielprozess ein: kein Hook, keine Injektion, kein Speicherzugriff, keine simulierten Eingaben.",
  "Es funktioniert unabhängig von CS2 und seinen Spiel-Paketen. Ziel ist das aktive Fenster oder ein gewählter Bildschirm. In exklusivem Vollbild kann es unsichtbar bleiben; nutze Fenster oder randloses Vollbild.",
  "Keine Freigabe oder Sicherheitsgarantie von Valve, FACEIT oder anderen Anbietern. Ein zusätzliches Fadenkreuz kann nach Spiel-, Anti-Cheat- oder Turnierregeln verboten sein. Prüfe die Regeln und schalte es dort aus.",
  "Du nutzt das Overlay auf eigenes Risiko. TecMon haftet nicht für Sperren, Banns oder andere Folgen.",
];

export const DEFAULT_OVERLAY = Object.freeze({ target: "foreground", monitor: 1, app: "", scale: 1, rotation: 0, offsetX: 0, offsetY: 0, shape: "cross", radius: 8, dotSize: 2, hotkey: "F9", artwork: null, imageSize: 32, gamePreset: "" });
/** Only bounded RGBA pixels, never paths, URLs, SVG or an executable image decoder. */
export function cleanArtwork(raw) {
  if (raw === null || raw === undefined) return null;
  const { width, height, pixels } = raw;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 64 || height > 64 ||
      typeof pixels !== "string" || pixels.length > 21848 || !/^[A-Za-z0-9+/]*={0,2}$/.test(pixels))
    throw new Error("Eigenes Fadenkreuz: höchstens 64 × 64 RGBA-Pixel erlaubt.");
  const bytes = Buffer.from(pixels, "base64");
  if (bytes.length !== width * height * 4 || bytes.toString("base64") !== pixels)
    throw new Error("Die Pixeldaten des Fadenkreuzes sind unvollständig oder ungültig.");
  return { width, height, pixels };
}
export function cleanOverlayOptions(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  if (src.app !== undefined && (typeof src.app !== "string" || !/^(?:[a-zA-Z0-9_. -]{1,104})?$/.test(src.app.trim())))
    throw new Error("Bitte nur einen Exe-Namen ohne Pfad eingeben, z. B. game.exe.");
  const number = (key, min, max, step) => clamp(src[key], min, max, step) ?? DEFAULT_OVERLAY[key];
  const artwork = cleanArtwork(src.artwork);
  if (src.shape === "image" && (!artwork || !Buffer.from(artwork.pixels, "base64").some((v, i) => i % 4 === 3 && v > 0)))
    throw new Error("Bitte zuerst ein PNG laden oder sichtbare Pixel zeichnen.");
  return {
    target: ["foreground", "primary", "monitor"].includes(src.target) ? src.target : DEFAULT_OVERLAY.target,
    monitor: number("monitor", 1, 8, 1),
    app: typeof src.app === "string" ? src.app.trim().replace(/\.exe$/i, "").toLowerCase() : "",
    scale: number("scale", 0.5, 4, 0.1), rotation: number("rotation", 0, 180, 1),
    offsetX: number("offsetX", -2000, 2000, 1), offsetY: number("offsetY", -2000, 2000, 1),
    shape: ["cross", "circle", "image"].includes(src.shape) ? src.shape : DEFAULT_OVERLAY.shape,
    artwork, imageSize: number("imageSize", 8, 64, 1), gamePreset: gameCrosshair(src.gamePreset) ? src.gamePreset : "",
    radius: number("radius", 2, 24, 1), dotSize: number("dotSize", 1, 12, 1),
    hotkey: ["none", "F9", "F10", "F11"].includes(src.hotkey) ? src.hotkey : DEFAULT_OVERLAY.hotkey,
  };
}

export async function createOverlaySettings(dir) {
  const file = path.join(dir, "crosshair-overlay.json");
  let current = { ...DEFAULT_OVERLAY, enabled: false, accepted: 0 };
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    current = { ...cleanOverlayOptions(saved), enabled: saved?.enabled === true, accepted: Number.isInteger(saved?.accepted) ? saved.accepted : 0 };
  } catch { /* noch nichts gespeichert */ }
  if (current.accepted !== OVERLAY_NOTICE_VERSION) current.enabled = false;
  const persist = async () => {
    await mkdir(dir, { recursive: true });
    await writeAtomic(file, JSON.stringify(current));
  };
  return {
    get: () => ({ ...current, accepted: current.accepted === OVERLAY_NOTICE_VERSION }),
    async configure(input) {
      current = { ...current, ...cleanOverlayOptions({ ...current, ...input }) };
      await persist();
      return this.get();
    },
    /** Einschalten nur mit bestätigtem Hinweis (accept === OVERLAY_NOTICE_VERSION). */
    async set(enabled, accept) {
      if (enabled) {
        if (accept !== OVERLAY_NOTICE_VERSION && current.accepted !== OVERLAY_NOTICE_VERSION)
          throw new Error("Bitte erst den Hinweis zum Overlay lesen und bestätigen.");
        current.accepted = OVERLAY_NOTICE_VERSION;
      }
      current.enabled = Boolean(enabled);
      await persist();
      return this.get();
    },
    async reset() {
      current = { ...DEFAULT_OVERLAY, enabled: false, accepted: 0 };
      try { await unlink(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
    },
  };
}

/**
 * Anzeigemodus aus CS2s eigener cs2_video.txt (Steam\userdata\<id>\730\local\cfg),
 * jüngste Datei gewinnt: "fullscreen", "borderless" (Vollbild-Fenstermodus),
 * "windowed" oder "unknown". Nur lesen; die Konto-ID wird nicht weitergegeben.
 */
export function windowModeFromVideo(text) {
  const value = (key) => {
    const m = String(text || "").match(new RegExp(`"${key.replace(".", "\\.")}"\\s+"(\\d+)"`));
    return m ? Number(m[1]) : null;
  };
  const fullscreen = value("setting.fullscreen");
  if (fullscreen === null) return "unknown";
  if (fullscreen === 1) return "fullscreen";
  return value("setting.nowindowborder") === 1 ? "borderless" : "windowed";
}

export async function cs2WindowMode(steamRoot = path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Steam")) {
  let best = null;
  try {
    for (const id of await readdir(path.join(steamRoot, "userdata"))) {
      if (!/^\d+$/.test(id)) continue;
      const file = path.join(steamRoot, "userdata", id, "730", "local", "cfg", "cs2_video.txt");
      try {
        const info = await stat(file);
        if (!best || info.mtimeMs > best.time) best = { file, time: info.mtimeMs };
      } catch { /* kein CS2 für dieses Konto */ }
    }
    if (!best) return "unknown";
    return windowModeFromVideo(await readFile(best.file, "utf8"));
  } catch {
    return "unknown";
  }
}
