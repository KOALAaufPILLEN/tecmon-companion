/**
 * Agenten-Tausch für Video-Szenen (Capability `agent-swap-v1`).
 *
 * Nutzt den eigenen TecMon-Demo-Rewriter (`native/tecmon-demo-rewriter`,
 * MIT, gebaut mit der Bibliothek source2-demo von Artem Rupasov,
 * MIT/Apache-2.0). Er liegt dem Companion als `tecmon-demo-rewriter.exe` bei;
 * es wird nichts nachgeladen.
 *
 * Der Rewriter schreibt eine Kopie der Demo, in der ein Spieler ein anderes
 * Agentenmodell trägt. Er setzt außerdem die Bodygroups der Standard-Handschuhe
 * passend zum Modell. Das repariert auch den Handschuh-Tausch aus dem
 * Skin-Addon, der sonst bei manchen Agenten Kopf oder Variante ändert. Die
 * Werte lernt er aus der Original-Demo und merkt sie sich lokal in
 * `agent-looks.json`.
 *
 * Aus dem Auftrag kommen nur Agenten-Nummern aus `AGENTS`; die Modellpfade
 * stehen fest hier im Companion. Nichts davon läuft im Spiel.
 */
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { access, readFile, writeFile, rm } from "node:fs/promises";
import { SKIN_GLOVES, SKIN_WEAPONS } from "./skin-swap.mjs";

export const AGENT_CAPABILITY = "agent-swap-v1";
/** Huhn-Modus (Experiment): Spieler als Huhn in wählbarer Größe, über denselben Rewriter. */
export const CHICKEN_CAPABILITY = "chicken-v1";
export const CHICKEN_MIN = 0.5;
export const CHICKEN_MAX = 3;
/**
 * Huhn-Rassen aus CS2 (Haustier-Update, Sept. 2026): Kennung -> Anzahl Farben.
 * Farben sind die Materialgruppen des Modells (0 = Standard). Modellpfade stehen
 * nur im Rewriter (`CHICKEN_BREEDS` in main.rs), nie im Auftrag.
 */
export const CHICKEN_BREED_CAPABILITY = "chicken-breed-v1";
export const CHICKEN_BREEDS = { catalana: 13, polish: 12, silkie: 9, chick: 1 };
export const REWRITER_EXE = "tecmon-demo-rewriter.exe";

/** Standard-Agenten (eigene Nummern, wie auf der Webseite). */
export const DEFAULT_T = 5036;
export const DEFAULT_CT = 5037;

/** Agent → [Seite, Modell, Name]. Aus ByMykel/CSGO-API (MIT), Seite t/ct. */
export const AGENTS = {
  [DEFAULT_T]: ["t", "agents/models/tm_phoenix/tm_phoenix.vmdl", "Standard-T"],
  [DEFAULT_CT]: ["ct", "agents/models/ctm_sas/ctm_sas.vmdl", "Standard-CT"],
  4613: ["t", "agents/models/tm_professional/tm_professional_varf5.vmdl", "Bloody Darryl The Strapped | The Professionals"],
  4619: ["ct", "agents/models/ctm_st6/ctm_st6_variantj.vmdl", "'Blueberries' Buckshot | NSWC SEAL"],
  4680: ["ct", "agents/models/ctm_st6/ctm_st6_variantl.vmdl", "'Two Times' McCoy | TACP Cavalry"],
  4711: ["ct", "agents/models/ctm_swat/ctm_swat_variante.vmdl", "Cmdr. Mae 'Dead Cold' Jamison | SWAT"],
  4712: ["ct", "agents/models/ctm_swat/ctm_swat_variantf.vmdl", "1st Lieutenant Farlow | SWAT"],
  4713: ["ct", "agents/models/ctm_swat/ctm_swat_variantg.vmdl", "John 'Van Healen' Kask | SWAT"],
  4714: ["ct", "agents/models/ctm_swat/ctm_swat_varianth.vmdl", "Bio-Haz Specialist | SWAT"],
  4715: ["ct", "agents/models/ctm_swat/ctm_swat_varianti.vmdl", "Sergeant Bombson | SWAT"],
  4716: ["ct", "agents/models/ctm_swat/ctm_swat_variantj.vmdl", "Chem-Haz Specialist | SWAT"],
  4718: ["t", "agents/models/tm_balkan/tm_balkan_variantk.vmdl", "Rezan the Redshirt | Sabre"],
  4726: ["t", "agents/models/tm_professional/tm_professional_varf.vmdl", "Sir Bloody Miami Darryl | The Professionals"],
  4727: ["t", "agents/models/tm_professional/tm_professional_varg.vmdl", "Safecracker Voltzmann | The Professionals"],
  4728: ["t", "agents/models/tm_professional/tm_professional_varh.vmdl", "Little Kev | The Professionals"],
  4730: ["t", "agents/models/tm_professional/tm_professional_varj.vmdl", "Getaway Sally | The Professionals"],
  4732: ["t", "agents/models/tm_professional/tm_professional_vari.vmdl", "Number K | The Professionals"],
  4733: ["t", "agents/models/tm_professional/tm_professional_varf1.vmdl", "Sir Bloody Silent Darryl | The Professionals"],
  4734: ["t", "agents/models/tm_professional/tm_professional_varf2.vmdl", "Sir Bloody Skullhead Darryl | The Professionals"],
  4735: ["t", "agents/models/tm_professional/tm_professional_varf3.vmdl", "Sir Bloody Darryl Royale | The Professionals"],
  4736: ["t", "agents/models/tm_professional/tm_professional_varf4.vmdl", "Sir Bloody Loudmouth Darryl | The Professionals"],
  4749: ["ct", "agents/models/ctm_gendarmerie/ctm_gendarmerie_varianta.vmdl", "Sous-Lieutenant Medic | Gendarmerie Nationale"],
  4750: ["ct", "agents/models/ctm_gendarmerie/ctm_gendarmerie_variantb.vmdl", "Chem-Haz Capitaine | Gendarmerie Nationale"],
  4751: ["ct", "agents/models/ctm_gendarmerie/ctm_gendarmerie_variantc.vmdl", "Chef d'Escadron Rouchard | Gendarmerie Nationale"],
  4752: ["ct", "agents/models/ctm_gendarmerie/ctm_gendarmerie_variantd.vmdl", "Aspirant | Gendarmerie Nationale"],
  4753: ["ct", "agents/models/ctm_gendarmerie/ctm_gendarmerie_variante.vmdl", "Officer Jacques Beltram | Gendarmerie Nationale"],
  4756: ["ct", "agents/models/ctm_swat/ctm_swat_variantk.vmdl", "Lieutenant 'Tree Hugger' Farlow | SWAT"],
  4757: ["ct", "agents/models/ctm_diver/ctm_diver_varianta.vmdl", "Cmdr. Davida 'Goggles' Fernandez | SEAL Frogman"],
  4771: ["ct", "agents/models/ctm_diver/ctm_diver_variantb.vmdl", "Cmdr. Frank 'Wet Sox' Baroud | SEAL Frogman"],
  4772: ["ct", "agents/models/ctm_diver/ctm_diver_variantc.vmdl", "Lieutenant Rex Krikey | SEAL Frogman"],
  4773: ["t", "agents/models/tm_jungle_raider/tm_jungle_raider_varianta.vmdl", "Elite Trapper Solman | Guerrilla Warfare"],
  4774: ["t", "agents/models/tm_jungle_raider/tm_jungle_raider_variantb.vmdl", "Crasswater The Forgotten | Guerrilla Warfare"],
  4775: ["t", "agents/models/tm_jungle_raider/tm_jungle_raider_variantc.vmdl", "Arno The Overgrown | Guerrilla Warfare"],
  4776: ["t", "agents/models/tm_jungle_raider/tm_jungle_raider_variantd.vmdl", "Col. Mangos Dabisi | Guerrilla Warfare"],
  4777: ["t", "agents/models/tm_jungle_raider/tm_jungle_raider_variante.vmdl", "Vypa Sista of the Revolution | Guerrilla Warfare"],
  4778: ["t", "agents/models/tm_jungle_raider/tm_jungle_raider_variantf.vmdl", "Trapper Aggressor | Guerrilla Warfare"],
  4780: ["t", "agents/models/tm_jungle_raider/tm_jungle_raider_variantb2.vmdl", "'Medium Rare' Crasswater | Guerrilla Warfare"],
  4781: ["t", "agents/models/tm_jungle_raider/tm_jungle_raider_variantf2.vmdl", "Trapper | Guerrilla Warfare"],
  5105: ["t", "agents/models/tm_leet/tm_leet_variantg.vmdl", "Ground Rebel  | Elite Crew"],
  5106: ["t", "agents/models/tm_leet/tm_leet_varianth.vmdl", "Osiris | Elite Crew"],
  5107: ["t", "agents/models/tm_leet/tm_leet_varianti.vmdl", "Prof. Shahmat | Elite Crew"],
  5108: ["t", "agents/models/tm_leet/tm_leet_variantf.vmdl", "The Elite Mr. Muhlik | Elite Crew"],
  5109: ["t", "agents/models/tm_leet/tm_leet_variantj.vmdl", "Jungle Rebel | Elite Crew"],
  5205: ["t", "agents/models/tm_phoenix/tm_phoenix_varianth.vmdl", "Soldier | Phoenix"],
  5206: ["t", "agents/models/tm_phoenix/tm_phoenix_variantf.vmdl", "Enforcer | Phoenix"],
  5207: ["t", "agents/models/tm_phoenix/tm_phoenix_variantg.vmdl", "Slingshot | Phoenix"],
  5208: ["t", "agents/models/tm_phoenix/tm_phoenix_varianti.vmdl", "Street Soldier | Phoenix"],
  5305: ["ct", "agents/models/ctm_fbi/ctm_fbi_variantf.vmdl", "Operator | FBI SWAT"],
  5306: ["ct", "agents/models/ctm_fbi/ctm_fbi_variantg.vmdl", "Markus Delrow | FBI HRT"],
  5307: ["ct", "agents/models/ctm_fbi/ctm_fbi_varianth.vmdl", "Michael Syfers  | FBI Sniper"],
  5308: ["ct", "agents/models/ctm_fbi/ctm_fbi_variantb.vmdl", "Special Agent Ava | FBI"],
  5400: ["ct", "agents/models/ctm_st6/ctm_st6_variantk.vmdl", "3rd Commando Company | KSK"],
  5401: ["ct", "agents/models/ctm_st6/ctm_st6_variante.vmdl", "Seal Team 6 Soldier | NSWC SEAL"],
  5402: ["ct", "agents/models/ctm_st6/ctm_st6_variantg.vmdl", "Buckshot | NSWC SEAL"],
  5403: ["ct", "agents/models/ctm_st6/ctm_st6_variantm.vmdl", "'Two Times' McCoy | USAF TACP"],
  5404: ["ct", "agents/models/ctm_st6/ctm_st6_varianti.vmdl", "Lt. Commander Ricksaw | NSWC SEAL"],
  5405: ["ct", "agents/models/ctm_st6/ctm_st6_variantn.vmdl", "Primeiro Tenente | Brazilian 1st Battalion"],
  5500: ["t", "agents/models/tm_balkan/tm_balkan_variantf.vmdl", "Dragomir | Sabre"],
  5501: ["t", "agents/models/tm_balkan/tm_balkan_varianti.vmdl", "Maximus | Sabre"],
  5502: ["t", "agents/models/tm_balkan/tm_balkan_variantg.vmdl", "Rezan The Ready | Sabre"],
  5503: ["t", "agents/models/tm_balkan/tm_balkan_variantj.vmdl", "Blackwolf | Sabre"],
  5504: ["t", "agents/models/tm_balkan/tm_balkan_varianth.vmdl", "'The Doctor' Romanov | Sabre"],
  5505: ["t", "agents/models/tm_balkan/tm_balkan_variantl.vmdl", "Dragomir | Sabre Footsoldier"],
  5601: ["ct", "agents/models/ctm_sas/ctm_sas_variantf.vmdl", "B Squadron Officer | SAS"],
  5602: ["ct", "agents/models/ctm_sas/ctm_sas_variantg.vmdl", "D Squadron Officer | NZSAS"],
};


/** Agenten einer Szene prüfen: `{ t?, ct? }` mit Nummern aus `AGENTS` der passenden Seite. */
export function cleanAgents(value, fail) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const out = {};
  for (const [side, id] of Object.entries(value)) {
    if (side !== "t" && side !== "ct") fail();
    if (!Number.isSafeInteger(id) || AGENTS[id]?.[0] !== side) fail();
    out[side] = id;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Huhn-Größe einer Szene prüfen: Zahl von CHICKEN_MIN bis CHICKEN_MAX, auf 0,05 gerundet. */
export function cleanChicken(value, fail) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < CHICKEN_MIN || value > CHICKEN_MAX) fail();
  return Math.round(value * 20) / 20;
}

/** Rasse und Farbe einer Szene prüfen: `{ breed, coat }`, nur zusammen mit einer Huhn-Größe. */
export function cleanChickenLook(value, fail) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const coats = Object.hasOwn(CHICKEN_BREEDS, value.breed) ? CHICKEN_BREEDS[value.breed] : 0;
  if (!coats) fail();
  const coat = value.coat ?? 0;
  if (!Number.isSafeInteger(coat) || coat < 0 || coat >= coats) fail();
  return { breed: value.breed, coat };
}

export const hasAgents = (job) => job.sequences.some((s) => s.agents || s.chicken !== undefined);
const hasGloveSkins = (s) => (s.skins || []).some((skin) => Boolean(SKIN_GLOVES[skin.weapon]));
/** Waffen (keine Messer/Handschuhe) mit getauschtem Skin: ihre echten Sticker entfernt der Rewriter. */
const skinWeapons = (s) =>
  s.keepStickers ? [] : (s.skins || []).map((skin) => skin.weapon).filter((id) => SKIN_WEAPONS[id]);

/**
 * Auftrag für den Rewriter. Agenten gelten je Spieler für das ganze Video;
 * Spieler mit getauschten Handschuhen kommen ohne Agentenwunsch dazu, damit
 * nur ihre Handschuh-Bodygroups repariert werden.
 */
export function agentRequest(job, { input, output, original, cache, skinsSwapped = false, gloveSkinsLater = false }) {
  const players = new Map();
  for (const s of job.sequences) {
    const wants = s.agents || {};
    const gloves = (skinsSwapped || gloveSkinsLater) && hasGloveSkins(s);
    const weapons = skinsSwapped || gloveSkinsLater ? skinWeapons(s) : [];
    if (!s.agents && s.chicken === undefined && !gloves && !weapons.length) continue;
    const known = players.get(s.steamId) || {};
    known.stickers = [...new Set([...(known.stickers || []), ...weapons])];
    if (gloveSkinsLater && gloves) known.forceGloves = true;
    if (s.chicken !== undefined) {
      if (known.chicken !== undefined && known.chicken !== s.chicken)
        throw new Error(`${s.playerName}: In zwei Szenen sind verschiedene Huhn-Größen gewählt. Pro Spieler geht nur eine je Video.`);
      const look = s.chickenLook ? `${s.chickenLook.breed}:${s.chickenLook.coat}` : "catalana:0";
      if (known.look !== undefined && known.look !== look)
        throw new Error(`${s.playerName}: In zwei Szenen sind verschiedene Hühner gewählt. Pro Spieler geht nur eins je Video.`);
      known.chicken = s.chicken;
      known.look = look;
      known.chickenLook = s.chickenLook;
    }
    for (const side of ["t", "ct"]) {
      if (wants[side] === undefined) continue;
      if (known[side] !== undefined && known[side] !== wants[side])
        throw new Error(`${s.playerName}: In zwei Szenen sind verschiedene Agenten gewählt. Pro Spieler und Seite geht nur einer je Video.`);
      known[side] = wants[side];
    }
    players.set(s.steamId, known);
  }
  if (!players.size) return null;
  return {
    input,
    output,
    learn: original,
    looks_cache: cache,
    players: [...players].map(([steamId, sides]) => ({
      // SteamID64 bleibt Text, nie über Number runden.
      steamid: steamId,
      ...(sides.t !== undefined ? { t: AGENTS[sides.t][1] } : {}),
      ...(sides.ct !== undefined ? { ct: AGENTS[sides.ct][1] } : {}),
      // Huhn-Modus (chicken-v1): ersetzt für diesen Spieler den Agenten im ganzen Video.
      ...(sides.chicken !== undefined ? { chicken: sides.chicken } : {}),
      // Rasse und Farbe (chicken-breed-v1); ohne Angabe Catalana in Standardfarbe.
      ...(sides.chickenLook ? { chicken_breed: sides.chickenLook.breed, chicken_coat: sides.chickenLook.coat } : {}),
      // Handschuhe kommen erst danach per Skin-Tausch: Bodygroups schon passend setzen.
      ...(sides.forceGloves ? { force_gloves: true } : {}),
      // Getauschte Waffen ohne die Sticker der echten Waffe.
      ...(sides.stickers?.length ? { clear_stickers: sides.stickers } : {}),
    })),
  };
}

/** Erste aussagekräftige Zeilen der Fehlerausgabe (Rust-Panics beginnen mit einer Leerzeile). */
export function failureReason(error) {
  const lines = String(error?.stderr || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^note: |^stack backtrace/.test(line));
  const text = lines.slice(0, /panicked at/.test(lines[0] || "") ? 2 : 1).join(" ") || String(error?.message || "").split("\n")[0];
  return text.slice(0, 240);
}

function runExe(exe, args) {
  return new Promise((resolve, reject) =>
    execFile(exe, args, { cwd: path.dirname(exe), windowsHide: true, timeout: 15 * 60_000, shell: false, maxBuffer: 1 << 20 }, (error, stdout, stderr) =>
      error ? reject(Object.assign(error, { stderr: String(stderr || "") })) : resolve(String(stdout || "")),
    ),
  );
}

export async function createAgentSwap({
  dir,
  exe = path.join(path.dirname(fileURLToPath(import.meta.url)), REWRITER_EXE),
  run = runExe,
  exists = async (file) => access(file).then(() => true, () => false),
}) {
  const available = await exists(exe);
  const cache = path.join(dir, "agent-looks.json");
  return {
    available,
    /**
     * Demo-Kopie mit getauschten Agenten schreiben, oder `""`, wenn nichts zu tun ist.
     * `input` ist die Demo für die Aufnahme (eventuell schon mit getauschten Skins),
     * `original` die unveränderte Demo zum Lernen der Bodygroups.
     */
    async rewrite(job, { input, original, skinsSwapped = false, gloveSkinsLater = false, log = () => {} }) {
      const base = original.replace(/\.dem$/i, "");
      const output = `${base}.tecmon-agents.dem`;
      const request = agentRequest(job, { input, output, original, cache, skinsSwapped, gloveSkinsLater });
      if (!request) return "";
      if (!available) {
        if (hasAgents(job)) log("Agenten-Tausch braucht einen neueren Companion; das Video zeigt die echten Agenten.");
        return "";
      }
      const requestFile = `${base}.tecmon-agents.request.json`;
      await writeFile(requestFile, JSON.stringify(request));
      log(
        job.sequences.some((s) => s.chicken !== undefined)
          ? "Hühner und Agenten in einer Kopie der Demo einsetzen …"
          : hasAgents(job)
            ? "Agenten in einer Kopie der Demo tauschen …"
            : request.players.some((p) => p.force_gloves || job.sequences.some((s) => s.steamId === p.steamid && hasGloveSkins(s)))
              ? "Handschuhe einstellen und Sticker der getauschten Waffen entfernen …"
              : "Sticker der getauschten Waffen entfernen …",
      );
      try {
        let result = null;
        try {
          result = JSON.parse((await run(exe, ["rewrite", requestFile])).trim().split("\n").pop());
        } catch (error) {
          await rm(output, { force: true }).catch(() => {});
          const reason = failureReason(error);
          throw new Error(`Agenten-Tausch fehlgeschlagen (${reason || "keine Antwort"}).`);
        }
        if (!result?.ok) throw new Error("Agenten-Tausch fehlgeschlagen.");
        const changed = Object.keys(result.changed || {}).length;
        if (result.stickers) log(`Sticker entfernt an ${result.stickers} getauschten Waffe${result.stickers === 1 ? "" : "n"}.`);
        if (!changed && hasAgents(job)) log("Hinweis: Kein Spieler mit Agentenwunsch in der Demo gefunden.");
        else if (changed) log(`Agenten/Handschuhe angepasst bei ${changed} Spieler${changed === 1 ? "" : "n"}.`);
        if (result.guessed?.length)
          log("Hinweis: Für manche Agenten sind die Handschuh-Einstellungen geschätzt; die Hände können leicht anders aussehen.");
        return output;
      } finally {
        await rm(requestFile, { force: true }).catch(() => {});
      }
    },
    async cleanup(copy) {
      if (copy && /\.tecmon-agents\.dem$/i.test(copy)) await rm(copy, { force: true }).catch(() => {});
    },
  };
}

/** Lädt die gelernten Werte (nur zur Anzeige/Fehlersuche). */
export async function readLooks(dir) {
  try {
    return JSON.parse(await readFile(path.join(dir, "agent-looks.json"), "utf8"));
  } catch {
    return {};
  }
}
