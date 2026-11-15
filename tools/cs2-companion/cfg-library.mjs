import { readFile, writeFile, rename, mkdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { crosshairCommands, decodeCrosshairCode } from "./crosshair.mjs";

/**
 * CFG-Sammlung: fertige CS2-Einstellungen als eigene cfg-Dateien
 * (tecmon_<id>.cfg im CS2-cfg-Ordner). Nur CS2-eigene Konsolenbefehle aus
 * dieser festen Liste, kein freier Text von außen, keine Eingaben ans Spiel.
 * Der Spieler lädt eine cfg selbst mit "exec tecmon_<id>" in der Konsole.
 * Tasten für Binds kommen nur aus BIND_KEYS.
 */
export const CFG_PREFIX = "tecmon_cfg_";

/** Erlaubte Tasten für Binds (CS2-Tastennamen). */
export const BIND_KEYS = [
  "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
  "ins", "home", "pgup", "pgdn", "del", "end",
  "kp_ins", "kp_end", "kp_downarrow", "kp_pgdn", "kp_leftarrow", "kp_5", "kp_rightarrow", "kp_home", "kp_uparrow", "kp_pgup",
  "mouse4", "mouse5", "n", "m", "j", "k", "l", "p", "o", "i", "u", "h",
];

export const CFG_GROUPS = [
  { id: "pro", label: "Pro-Einstellungen" },
  { id: "komfort", label: "Komfort & Binds" },
  { id: "sound", label: "Sound" },
  { id: "hud", label: "HUD & Radar" },
  { id: "training", label: "Training (eigener Server)" },
];

const PRO_VIEWMODEL = ["viewmodel_presetpos 2", "viewmodel_fov 68", "viewmodel_offset_x 2.5", "viewmodel_offset_y 0", "viewmodel_offset_z -1.5"];
const NIKO_CROSSHAIR = "CSGO-p6EjX-NnfrY-ea7EX-evBaL-HOkTL";

/**
 * Feste Sammlung. `bind`: Die cfg legt einen Bind auf die gewählte Taste
 * (`{key}` wird nur durch eine Taste aus BIND_KEYS ersetzt).
 * Pro-Werte: öffentlich angegebene Einstellungen, Stand November 2026; Profis ändern sie öfter.
 */
export const CFG_CATALOG = [
  {
    id: "pro_viewmodel", group: "pro", label: "Pro-Viewmodel",
    description: "Waffe klein und weit rechts unten, wie bei ZywOo, ropz, b1t und s1mple (FOV 68, X 2,5, Y 0, Z −1,5). Sensitivity bleibt deine.",
    source: "Pro-Settings-Übersichten, Stand November 2026",
    lines: PRO_VIEWMODEL,
  },
  {
    id: "pro_niko", group: "pro", label: "NiKo (Falcons)",
    description: "NiKos grüner Punkt als Fadenkreuz, Viewmodel und Radar (zentriert, drehend, Zoom 0,35, Größe 1,15). Sensitivity bleibt deine.",
    source: "csdb.gg, Stand 9. November 2026",
    lines: [
      ...crosshairCommands(decodeCrosshairCode(NIKO_CROSSHAIR)),
      ...PRO_VIEWMODEL,
      "cl_radar_always_centered 1", "cl_radar_rotate 1", "cl_radar_scale 0.35", "cl_hud_radar_scale 1.15",
    ],
  },
  {
    id: "mute_toggle", group: "komfort", label: "Alle stumm per Taste",
    description: "Eine Taste schaltet den Sprachchat aller Spieler aus und wieder an (voice_enable).",
    bind: true, defaultKey: "f6",
    lines: ['bind "{key}" "toggle voice_enable 0 1"'],
  },
  {
    id: "mute_enemies", group: "komfort", label: "Gegner stumm",
    description: "Sprach- und Textchat des Gegnerteams dauerhaft aus; nur Freunde und Party bleiben im Gegnerteam hörbar.",
    lines: ["cl_mute_enemy_team 1", "cl_mute_all_but_friends_and_party 0"],
  },
  {
    id: "mute_strangers", group: "komfort", label: "Nur Freunde & Party hören",
    description: "Alle außer Steam-Freunden und deiner Party stumm, auch im eigenen Team.",
    lines: ["cl_mute_all_but_friends_and_party 1"],
  },
  {
    id: "mute_enemy_toggle", group: "komfort", label: "Gegner stumm per Taste",
    description: "Eine Taste schaltet das Gegnerteam stumm und wieder laut (cl_mute_enemy_team).",
    bind: true, defaultKey: "k",
    lines: ['bind "{key}" "incrementvar cl_mute_enemy_team 0 1 1"'],
  },
  {
    id: "chat_ignore", group: "komfort", label: "Chat ausblenden per Taste",
    description: "Eine Taste blendet Text-Nachrichten im Chat aus und wieder ein (ignoremsg).",
    bind: true, defaultKey: "l",
    lines: ['bind "{key}" "ignoremsg"'],
  },
  {
    id: "wheel_jump", group: "komfort", label: "Springen aufs Mausrad",
    description: "Mausrad hoch und runter springen zusätzlich zur Leertaste. Ein Befehl je Taste, kein Skript.",
    lines: ['bind "mwheelup" "+jump"', 'bind "mwheeldown" "+jump"'],
  },
  {
    id: "knife_left", group: "komfort", label: "Messer in der linken Hand",
    description: "Waffen rechts, Messer links: die Tasten 1 bis 4 wählen die Waffe und die passende Hand.",
    lines: ['bind "1" "slot1;switchhandsright"', 'bind "2" "slot2;switchhandsright"', 'bind "3" "slot3;switchhandsleft"', 'bind "4" "slot4;switchhandsright"'],
  },
  {
    id: "voice_quiet", group: "komfort", label: "Sprachchat leiser per Taste",
    description: "Eine Taste wechselt die Lautstärke des Sprachchats zwischen 30 % und 100 %.",
    bind: true, defaultKey: "f7",
    lines: ['bind "{key}" "toggle snd_voipvolume 0.3 1"'],
  },
  {
    id: "quiet_music", group: "sound", label: "Ohne Musik",
    description: "Menü-, Rundenstart-, Rundenende-, MVP- und Deathcam-Musik aus; Bomben-Warnung bleibt leise an.",
    lines: [
      "snd_menumusic_volume 0", "snd_roundstart_volume 0", "snd_roundend_volume 0", "snd_mvp_volume 0",
      "snd_deathcamera_volume 0", "snd_mapobjective_volume 0", "snd_tensecondwarning_volume 0.2",
    ],
  },
  {
    id: "sound_focus", group: "sound", label: "Ton auch ohne Fokus",
    description: "CS2 bleibt hörbar, wenn du per Alt+Tab wechselst.",
    lines: ["snd_mute_losefocus 0"],
  },
  {
    id: "net_info", group: "hud", label: "Netzwerk-Anzeige",
    description: "FPS, Ping und Paketverlust dauerhaft oben links (CS2-Telemetrie).",
    lines: ["cl_hud_telemetry_frametime_show 2", "cl_hud_telemetry_ping_show 2", "cl_hud_telemetry_net_misdelivery_show 2"],
  },
  {
    id: "radar_overview", group: "hud", label: "Radar mit Überblick",
    description: "Radar nicht zentriert und weiter herausgezoomt, damit du die ganze Map siehst.",
    lines: ["cl_radar_always_centered 0", "cl_radar_rotate 1", "cl_radar_scale 0.3", "cl_hud_radar_scale 1.15"],
  },
  {
    id: "fps_menu", group: "hud", label: "Weniger Last im Menü",
    description: "Menü auf 120 FPS begrenzt, im Spiel unbegrenzt.",
    lines: ["fps_max 0", "fps_max_ui 120"],
  },
  {
    id: "practice", group: "training", label: "Granaten-Training",
    description: "Nur auf deinem eigenen Offline-Server: lange Runden, viel Geld, kaufen überall, Flugbahnen und Einschläge sichtbar, keine Bots.",
    lines: [
      "sv_cheats 1", "bot_kick", "mp_warmup_end", "mp_limitteams 0", "mp_autoteambalance 0",
      "mp_freezetime 0", "mp_roundtime_defuse 60", "mp_roundtime 60", "mp_maxmoney 60000", "mp_startmoney 60000",
      "mp_buytime 9999", "mp_buy_anywhere 1", "sv_infinite_ammo 1", "ammo_grenade_limit_total 5",
      "sv_grenade_trajectory_prac_pipreview 1", "sv_showimpacts 1", "mp_restartgame 1",
    ],
  },
];

const byId = new Map(CFG_CATALOG.map((c) => [c.id, c]));

export const cfgFile = (id) => `${CFG_PREFIX}${id}.cfg`;
export const cfgExec = (id) => `exec ${CFG_PREFIX}${id}`;

/** Taste prüfen: nur aus BIND_KEYS, sonst die Standardtaste des Eintrags. */
export function cleanKey(entry, key) {
  const k = String(key || "").toLowerCase();
  return BIND_KEYS.includes(k) ? k : entry.defaultKey;
}

/** Befehle eines Eintrags; nur feste Zeilen und geprüfte Tasten. */
export function cfgCommands(id, key) {
  const entry = byId.get(id);
  if (!entry) return null;
  const k = entry.bind ? cleanKey(entry, key) : "";
  return entry.lines.map((l) => l.replace("{key}", k));
}

export function cfgText(id, key) {
  const entry = byId.get(id);
  const lines = cfgCommands(id, key);
  if (!entry || !lines) return null;
  return `// TecMon Companion: ${entry.label}. In der CS2-Konsole laden mit: ${cfgExec(id)}\n`
    + lines.join("\n") + "\n"
    + `echo "TecMon: ${entry.label} geladen."\n`;
}

/** cfg-Ordner aus dem Pfad zu cs2.exe (…\game\bin\win64\cs2.exe → …\game\csgo\cfg). */
export function cfgDir(cs2Exe) {
  if (!cs2Exe || path.basename(cs2Exe).toLowerCase() !== "cs2.exe") return "";
  return path.join(path.dirname(cs2Exe), "..", "..", "csgo", "cfg");
}

async function writeAtomic(file, text) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}

async function removeFile(file) {
  try { await unlink(file); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

/** Eingerichtete Einträge (cfgs.json im Profil) und Schreiben der cfg-Dateien. */
export async function createCfgLibrary(dir) {
  const file = path.join(dir, "cfgs.json");
  /** id → { key } */
  let installed = {};
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    for (const [id, v] of Object.entries(saved || {})) {
      const entry = byId.get(id);
      if (entry) installed[id] = entry.bind ? { key: cleanKey(entry, v?.key) } : {};
    }
  } catch { /* noch nichts eingerichtet */ }
  const persist = async () => {
    await mkdir(dir, { recursive: true });
    await writeAtomic(file, JSON.stringify(installed));
  };
  return {
    state: (cs2Exe) => ({
      available: Boolean(cfgDir(cs2Exe)),
      groups: CFG_GROUPS,
      keys: BIND_KEYS,
      items: CFG_CATALOG.map((c) => ({
        id: c.id, group: c.group, label: c.label, description: c.description, source: c.source || "",
        bind: Boolean(c.bind), defaultKey: c.defaultKey || "",
        installed: Boolean(installed[c.id]), key: installed[c.id]?.key || c.defaultKey || "",
        exec: cfgExec(c.id), commands: cfgCommands(c.id, installed[c.id]?.key),
      })),
    }),
    async install(id, key, cs2Exe) {
      const entry = byId.get(id);
      if (!entry) throw new Error("Diese cfg gibt es nicht in der Sammlung.");
      installed[id] = entry.bind ? { key: cleanKey(entry, key) } : {};
      await persist();
      const target = cfgDir(cs2Exe);
      if (!target) return { written: false, exec: cfgExec(id) };
      await mkdir(target, { recursive: true });
      await writeAtomic(path.join(target, cfgFile(id)), cfgText(id, installed[id].key));
      return { written: true, exec: cfgExec(id) };
    },
    async remove(id, cs2Exe) {
      if (!byId.has(id)) throw new Error("Diese cfg gibt es nicht in der Sammlung.");
      delete installed[id];
      await persist();
      const target = cfgDir(cs2Exe);
      if (target) await removeFile(path.join(target, cfgFile(id)));
    },
    /** Paket entfernen: nur eigene Dateien (cfgs.json und tecmon_cfg_*.cfg aus der Sammlung). */
    async reset(cs2Exe) {
      installed = {};
      await removeFile(file);
      const target = cfgDir(cs2Exe);
      if (target) for (const c of CFG_CATALOG) await removeFile(path.join(target, cfgFile(c.id)));
    },
  };
}
