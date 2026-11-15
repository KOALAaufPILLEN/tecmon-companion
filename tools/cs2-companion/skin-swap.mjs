/**
 * Skin-Tausch für Video-Szenen (Capability `skin-swap-v1`).
 *
 * Freiwilliges Zusatz-Addon, standardmäßig aus. Es nutzt den eigenständigen
 * Demo-Rewriter aus dem Open-Source-Projekt CS2-nskinz von Lyan-edit
 * (https://github.com/Lyan-edit/CS2-nskinz, AGPL-3.0). Der Companion lädt die
 * unveränderte `nskinz-demo-rewriter.exe` erst beim Einschalten vom festen
 * Commit des Autors, prüft die SHA-256-Prüfsumme und startet sie als eigenes
 * Programm. Es wird kein Code des Projekts in den Companion kopiert.
 *
 * Der Rewriter schreibt aus der Demo eine Kopie, in der die Waffen eines
 * Spielers andere Skins (Paintkit, Abnutzung, Muster) tragen. Aufgenommen wird
 * aus dieser Kopie, danach wird sie gelöscht; die Original-Demo bleibt
 * unverändert. Nichts davon läuft im Spiel: keine DLL in CS2, nur die
 * Offline-Demo-Wiedergabe der TecMon-Engine.
 *
 * Aus dem Auftrag kommen nur geprüfte Zahlen (Waffe aus `SKIN_WEAPONS`,
 * Paintkit, Abnutzung, Muster), nie Text, Pfade oder Befehle.
 */
import path from "node:path";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, rename, rm, mkdir } from "node:fs/promises";

export const SKIN_CAPABILITY = "skin-swap-v1";
/** Webseite darf Skin-Tausch über `GET/POST /bridge/skins` ein- und ausschalten (mit bestätigtem Hinweis). */
export const SKIN_SETUP_CAPABILITY = "skin-swap-setup-v1";
/** Unveränderlicher Stand im Repository des Autors (Release v0.7.4). */
export const REWRITER_REVISION = "68cff11fc316bb6767dd381f1b2369e4b930ca4a";
export const REWRITER_SHA256 = "165b323f5d4cbed59d3d52ac69f1f9fd2269a33ab2b2e26e9f085024c3754c94";
export const REWRITER_URL = `https://raw.githubusercontent.com/Lyan-edit/CS2-nskinz/${REWRITER_REVISION}/assets/tools/nskinz-demo-rewriter.exe`;
export const REWRITER_CREDIT = {
  name: "CS2-nskinz",
  author: "Lyan-edit",
  url: "https://github.com/Lyan-edit/CS2-nskinz",
  license: "AGPL-3.0",
  version: "v0.7.4",
};
/** Ändert sich der Hinweis inhaltlich, Version erhöhen: dann muss neu bestätigt werden. */
export const SKIN_NOTICE_VERSION = 1;
export const SKIN_NOTICE =
  "Skin-Tausch nutzt das freie Programm CS2-nskinz von Lyan-edit (AGPL-3.0). Der Companion lädt es vom festen Stand des Autors, prüft die Prüfsumme und schreibt damit nur eine Kopie der Demo für die Aufnahme um. Nichts davon läuft im Spiel oder im Live-Match. Getauschte Skins gehören nicht dem Spieler; das Video bekommt den Namensschild-Text „TecMon Skin“.";
/** Höchstens so viele Waffen mit neuem Skin je Szene. */
export const MAX_SKINS = 4;
const MAX_EXE = 8 * 1024 * 1024;
/** Namensschild auf getauschten Waffen; macht im Video sichtbar, dass der Skin nicht echt ist. */
export const SKIN_TAG = "TecMon Skin";

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

/** Skins einer Szene prüfen: nur Zahlen, jede Waffe höchstens einmal. */
export function cleanSkins(value, fail) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SKINS) fail();
  const seen = new Set();
  return value.map((s) => {
    if (!s || typeof s !== "object" || Array.isArray(s)) fail();
    const { weapon, paintKit, wear, seed } = s;
    if (!Number.isSafeInteger(weapon) || !SKIN_WEAPONS[weapon] || seen.has(weapon)) fail();
    if (!Number.isSafeInteger(paintKit) || paintKit < 1 || paintKit > 4000) fail();
    if (typeof wear !== "number" || !Number.isFinite(wear) || wear < 0 || wear > 1) fail();
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 1000) fail();
    seen.add(weapon);
    return { weapon, paintKit, wear: Math.round(wear * 1e6) / 1e6, seed };
  });
}

export const hasSkins = (job) => job.sequences.some((s) => s.skins?.length);

/**
 * Anfrage für den Rewriter. Der Rewriter tauscht je Spieler und Waffe für die
 * ganze Demo; zwei Szenen desselben Spielers dürfen derselben Waffe also keine
 * unterschiedlichen Skins geben.
 */
export function rewriteRequest(job, inputDem, outputDem) {
  const players = new Map();
  for (const s of job.sequences) {
    if (!s.skins?.length) continue;
    const items = players.get(s.steamId) || new Map();
    for (const skin of s.skins) {
      const known = items.get(skin.weapon);
      if (known && (known.paintKit !== skin.paintKit || known.wear !== skin.wear || known.seed !== skin.seed))
        throw new Error(
          `${s.playerName}: ${SKIN_WEAPONS[skin.weapon]} hat in zwei Szenen verschiedene Skins. Pro Spieler und Waffe geht nur ein Skin je Video.`,
        );
      items.set(skin.weapon, skin);
    }
    players.set(s.steamId, items);
  }
  return {
    schema_version: 2,
    input_dem: inputDem,
    output_dem: outputDem,
    passes: [...players].map(([steamId, items]) => ({
      // SteamID64 bleibt Text, nie über Number runden.
      steam_id64: steamId,
      items: [...items.values()].map((skin) => ({
        definition_index: skin.weapon,
        replacement_definition_index: null,
        paint_kit: skin.paintKit,
        quality: 0,
        pattern_seed: skin.seed,
        wear: Math.max(skin.wear, 0.0000001),
        custom_name: SKIN_TAG,
        team: "ANY",
      })),
    })),
  };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function runExe(exe, args) {
  return new Promise((resolve, reject) =>
    execFile(exe, args, { cwd: path.dirname(exe), windowsHide: true, timeout: 15 * 60_000, shell: false }, (error) =>
      error ? reject(error) : resolve(),
    ),
  );
}

export async function createSkinSwap({ dir, cacheDir, request = fetch, run = runExe, expected = REWRITER_SHA256 }) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "skin-swap.json");
  const exe = path.join(cacheDir, "skin-swap", `nskinz-demo-rewriter-${REWRITER_REVISION.slice(0, 12)}.exe`);
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
    credit: REWRITER_CREDIT,
    weapons: SKIN_WEAPONS,
  });

  /** Rewriter aus dem Cache, sonst einmalig vom festen Commit laden; nie ungeprüft. */
  async function rewriter() {
    try {
      if (sha256(await readFile(exe)) === expected) return exe;
    } catch {
      /* noch nicht geladen */
    }
    const response = await request(REWRITER_URL, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error("Skin-Tausch-Programm konnte nicht geladen werden.");
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_EXE) throw new Error("Skin-Tausch-Programm zu groß.");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (sha256(bytes) !== expected)
      throw new Error("Prüfsumme des Skin-Tausch-Programms stimmt nicht. Aufnahme abgebrochen.");
    await mkdir(path.dirname(exe), { recursive: true });
    await writeFile(`${exe}.tmp`, bytes);
    await rename(`${exe}.tmp`, exe);
    return exe;
  }

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
      if (on) await rewriter();
      enabled = on;
      // Ausschalten entfernt das geladene Programm wieder.
      if (!on) await rm(path.dirname(exe), { recursive: true, force: true });
      await save();
      return state();
    },
    /**
     * Demo-Kopie mit getauschten Skins schreiben. Gibt den Pfad der Kopie zurück;
     * der Aufrufer löscht sie nach der Aufnahme mit `cleanup()`.
     */
    async rewrite(job, demo, log = () => {}) {
      if (!enabled) throw new Error("Skin-Tausch ist im Companion ausgeschaltet.");
      const program = await rewriter();
      const base = demo.replace(/\.dem$/i, "");
      const output = `${base}.tecmon-skins.dem`;
      const requestFile = `${base}.tecmon-skins.request.json`;
      const responseFile = `${base}.tecmon-skins.response.json`;
      await writeFile(requestFile, JSON.stringify(rewriteRequest(job, demo, output)));
      log("Skins in einer Kopie der Demo tauschen (CS2-nskinz von Lyan-edit) …");
      try {
        await run(program, ["--request", requestFile, "--response", responseFile]).catch(() => {});
        let result = null;
        try {
          result = JSON.parse(await readFile(responseFile, "utf8"));
        } catch {
          /* fehlt = Fehler */
        }
        if (!result?.ok) {
          await rm(output, { force: true }).catch(() => {});
          const reason = typeof result?.error === "string" ? result.error.slice(0, 300) : "keine Antwort";
          throw new Error(`Skin-Tausch fehlgeschlagen (${reason}). Nach einem CS2-Update braucht es oft eine neue Version.`);
        }
        if (!result.matched_player_count)
          log("Hinweis: Der Spieler mit Skin-Wunsch wurde in der Demo nicht gefunden; das Video zeigt die echten Skins.");
        log(`Skins getauscht: ${result.weapon_count ?? 0} Waffen in der Demo-Kopie.`);
        return output;
      } finally {
        await rm(requestFile, { force: true }).catch(() => {});
        await rm(responseFile, { force: true }).catch(() => {});
      }
    },
    async cleanup(copy) {
      if (copy && /\.tecmon-skins\.dem$/i.test(copy)) await rm(copy, { force: true }).catch(() => {});
    },
  };
}
