/**
 * Skin-Tausch für Video-Szenen (Capability `skin-swap-v1`).
 *
 * Freiwilliges Zusatz-Addon, standardmäßig aus. Den Tausch macht der eigene
 * TecMon-Demo-Rewriter (`native/tecmon-demo-rewriter`, MIT), der dem Companion
 * als `tecmon-demo-rewriter.exe` beiliegt; es wird nichts nachgeladen. Er
 * schreibt eine Kopie der Demo, in der die Waffen eines Spielers andere Skins
 * tragen (Paintkit, Abnutzung, Muster), dazu Messer und Handschuhe. Aufgenommen
 * wird aus der Kopie, danach wird sie gelöscht; die Original-Demo bleibt
 * unverändert. Nichts davon läuft im Spiel: keine DLL in CS2, nur die
 * Offline-Demo-Wiedergabe der TecMon-Engine.
 *
 * Aus dem Auftrag kommen nur geprüfte Zahlen (Waffe aus `SKIN_WEAPONS`,
 * Paintkit, Abnutzung, Muster), nie Text, Pfade oder Befehle.
 */
import path from "node:path";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";

export const SKIN_CAPABILITY = "skin-swap-v1";
/** Webseite darf Skin-Tausch über `GET/POST /bridge/skins` ein- und ausschalten (mit bestätigtem Hinweis). */
export const SKIN_SETUP_CAPABILITY = "skin-swap-setup-v1";
/** Ändert sich der Hinweis inhaltlich, Version erhöhen: dann muss neu bestätigt werden. */
export const SKIN_NOTICE_VERSION = 1;
export const SKIN_NOTICE =
  "Skin-Tausch schreibt mit dem TecMon-Demo-Rewriter nur eine Kopie der Demo für die Aufnahme um. Nichts davon läuft im Spiel oder im Live-Match. Getauschte Skins gehören nicht dem Spieler; das Video bekommt den Namensschild-Text „www.TecMon.Online“.";
/** Höchstens so viele Waffen mit neuem Skin je Szene. */
export const MAX_SKINS = 4;
/** Namensschild auf getauschten Waffen; macht im Video sichtbar, dass der Skin nicht echt ist. */
export const SKIN_TAG = "www.TecMon.Online";

/** Waffen, deren Skin sich tauschen lässt: Item-Definition aus CS2 → Name. */
export const SKIN_WEAPONS = {
  1: "Desert Eagle",
  2: "Dual Berettas",
  3: "Five-SeveN",
  4: "Glock-18",
  7: "AK-47",
  8: "AUG",
  9: "AWP",
  10: "FAMAS",
  11: "G3SG1",
  13: "Galil AR",
  14: "M249",
  16: "M4A4",
  17: "MAC-10",
  19: "P90",
  23: "MP5-SD",
  24: "UMP-45",
  25: "XM1014",
  26: "PP-Bizon",
  27: "MAG-7",
  28: "Negev",
  29: "Sawed-Off",
  30: "Tec-9",
  31: "Zeus x27",
  32: "P2000",
  33: "MP7",
  34: "MP9",
  35: "Nova",
  36: "P250",
  38: "SCAR-20",
  39: "SG 553",
  40: "SSG 08",
  60: "M4A1-S",
  61: "USP-S",
  63: "CZ75-Auto",
  64: "R8 Revolver",
};

/**
 * Ab `skin-swap-v2`: Messer (Modell + Skin) und Handschuhe. Der Rewriter ersetzt
 * dafür jedes Messer und die Handschuhe des Spielers auf der gewählten Seite;
 * `from` (Messer aus der Demo) wird angenommen, aber nicht mehr gebraucht.
 */
export const SKIN_KNIFE_CAPABILITY = "skin-swap-v2";
export const SKIN_KNIVES = {
  500: "Bayonet",
  503: "Classic Knife",
  505: "Flip Knife",
  506: "Gut Knife",
  507: "Karambit",
  508: "M9 Bayonet",
  509: "Huntsman Knife",
  512: "Falchion Knife",
  514: "Bowie Knife",
  515: "Butterfly Knife",
  516: "Shadow Daggers",
  517: "Paracord Knife",
  518: "Survival Knife",
  519: "Ursus Knife",
  520: "Navaja Knife",
  521: "Nomad Knife",
  522: "Stiletto Knife",
  523: "Talon Knife",
  525: "Skeleton Knife",
  526: "Kukri Knife",
};
export const SKIN_GLOVES = {
  4725: "Broken Fang Gloves",
  5027: "Bloodhound Gloves",
  5030: "Sport Gloves",
  5031: "Driver Gloves",
  5032: "Hand Wraps",
  5033: "Moto Gloves",
  5034: "Specialist Gloves",
  5035: "Hydra Gloves",
};
/**
 * Ab `skin-side-v1` (nur zusammen mit `skin-swap-v2`): Messer und Handschuhe optional je Seite
 * (`side: "t"` oder `"ct"`). Ohne Seite gilt die Wahl für beide Seiten wie bisher.
 */
export const SKIN_SIDE_CAPABILITY = "skin-side-v1";
export const SKIN_SIDES = ["t", "ct"];
/**
 * Ab `skin-legacy-v1`: Waffen-Skins tragen `legacy` (1 = Skin für das alte Waffenmodell, 0 = neues).
 * Der Rewriter stellt dann die passende Mesh-Gruppe ein (2 alt, 1 neu); ohne Angabe bleibt das
 * Modell der echten Waffe, und alte Skins wie Howl oder Dragon Lore sehen falsch aus.
 */
export const SKIN_LEGACY_CAPABILITY = "skin-legacy-v1";
/** Ab `skin-stickers-v1`: je Szene `keepStickers: true` lässt die Sticker der echten Waffe drauf. */
export const SKIN_STICKER_CAPABILITY = "skin-stickers-v1";
/** Standard-Messer und -Handschuhe in Demos, die der Rewriter ersetzt. */
export const DEFAULT_KNIVES = [42, 59];
export const DEFAULT_GLOVES = [5028, 5029];
const isKnife = (id) => Boolean(SKIN_KNIVES[id]);
const isGlove = (id) => Boolean(SKIN_GLOVES[id]);
const itemName = (id) => SKIN_WEAPONS[id] || SKIN_KNIVES[id] || SKIN_GLOVES[id] || `Waffe ${id}`;

/** Skins einer Szene prüfen: nur Zahlen, jede Waffe höchstens einmal, je höchstens ein Messer und ein Handschuh. */
export function cleanSkins(value, fail) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SKINS) fail();
  const seen = new Set();
  return value.map((s) => {
    if (!s || typeof s !== "object" || Array.isArray(s)) fail();
    const { weapon, paintKit, wear, seed, from, side, legacy } = s;
    const knife = isKnife(weapon);
    const glove = isGlove(weapon);
    const slot = knife ? "knife" : glove ? "glove" : weapon;
    if (!Number.isSafeInteger(weapon) || !(SKIN_WEAPONS[weapon] || knife || glove) || seen.has(slot)) fail();
    if (!Number.isSafeInteger(paintKit) || paintKit < (knife ? 0 : 1) || paintKit > 100000) fail();
    if (typeof wear !== "number" || !Number.isFinite(wear) || wear < 0 || wear > 1) fail();
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 1000) fail();
    if (from !== undefined && !(knife && Number.isSafeInteger(from) && (DEFAULT_KNIVES.includes(from) || isKnife(from)))) fail();
    if (side !== undefined && !((knife || glove) && SKIN_SIDES.includes(side))) fail();
    if (legacy !== undefined && (knife || glove || (legacy !== 0 && legacy !== 1))) fail();
    seen.add(slot);
    return {
      weapon,
      paintKit,
      wear: Math.round(wear * 1e6) / 1e6,
      seed,
      ...(from !== undefined ? { from } : {}),
      ...(side !== undefined ? { side } : {}),
      ...(legacy !== undefined ? { legacy } : {}),
    };
  });
}

export const hasSkins = (job) => job.sequences.some((s) => s.skins?.length);

/**
 * Skin-Wünsche je Spieler für den TecMon-Demo-Rewriter (`skins` im Spieler-Auftrag).
 * Der Rewriter tauscht je Spieler und Waffe für die ganze Demo; zwei Szenen desselben
 * Spielers dürfen derselben Waffe also keine unterschiedlichen Skins geben.
 * Ergebnis: SteamID64 (Text) -> Liste für den Rewriter.
 */
export function skinPlan(job) {
  const players = new Map();
  for (const s of job.sequences) {
    if (!s.skins?.length) continue;
    const items = players.get(s.steamId) || new Map();
    for (const skin of s.skins) {
      const base = isKnife(skin.weapon) ? "knife" : isGlove(skin.weapon) ? "glove" : skin.weapon;
      // Messer und Handschuhe je Seite; ohne `side` für beide Seiten.
      const slots = typeof base === "string" ? (skin.side ? [skin.side] : SKIN_SIDES).map((side) => `${base}:${side}`) : [base];
      for (const slot of slots) {
        const known = items.get(slot);
        if (
          known &&
          (known.weapon !== skin.weapon || known.paintKit !== skin.paintKit || known.wear !== skin.wear || known.seed !== skin.seed)
        )
          throw new Error(
            typeof base === "string"
              ? `${s.playerName}: In zwei Szenen sind verschiedene ${base === "knife" ? "Messer" : "Handschuhe"} für ${slot.endsWith(":t") ? "T" : "CT"} gewählt. Pro Spieler und Seite geht nur eins je Video.`
              : `${s.playerName}: ${itemName(skin.weapon)} hat in zwei Szenen verschiedene Skins. Pro Spieler und Waffe geht nur ein Skin je Video.`,
          );
        items.set(slot, skin);
      }
    }
    players.set(s.steamId, items);
  }
  const plan = new Map();
  for (const [steamId, items] of players)
    plan.set(
      steamId,
      [...items].map(([slot, skin]) => {
        const [base, side] = typeof slot === "string" ? slot.split(":") : [slot];
        return {
          kind: base === "knife" ? "knife" : base === "glove" ? "glove" : "weapon",
          def: skin.weapon,
          ...(side ? { side } : {}),
          paint_kit: skin.paintKit,
          seed: skin.seed,
          wear: skin.wear,
          // Altes oder neues Waffenmodell passend zum Skin (skin-legacy-v1).
          ...(base !== "knife" && base !== "glove" && skin.legacy !== undefined ? { legacy: skin.legacy } : {}),
        };
      }),
    );
  return plan;
}

/**
 * Schalter für das Addon. Der Tausch selbst läuft im Agenten-Tausch mit
 * (`createAgentSwap`), weil beides derselbe Rewriter in einem Durchgang macht.
 */
export async function createSkinSwap({ dir }) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "skin-swap.json");
  let enabled = false;
  let accepted = 0;
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    accepted = Number.isSafeInteger(saved.accepted) ? saved.accepted : 0;
    enabled = saved.enabled === true && accepted >= SKIN_NOTICE_VERSION;
  } catch {
    /* nicht gespeichert = aus */
  }
  const save = async () => {
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify({ enabled, accepted }));
    await rename(temp, file);
  };
  const state = () => ({
    enabled,
    notice: SKIN_NOTICE,
    noticeVersion: SKIN_NOTICE_VERSION,
    needsNotice: accepted < SKIN_NOTICE_VERSION,
    weapons: SKIN_WEAPONS,
  });
  return {
    state,
    get enabled() {
      return enabled;
    },
    async set(on, accept) {
      if (on && accepted < SKIN_NOTICE_VERSION) {
        if (accept !== SKIN_NOTICE_VERSION) throw new Error("Bitte zuerst den Hinweis zum Skin-Tausch bestätigen.");
        accepted = SKIN_NOTICE_VERSION;
      }
      enabled = on;
      await save();
      return state();
    },
  };
}
