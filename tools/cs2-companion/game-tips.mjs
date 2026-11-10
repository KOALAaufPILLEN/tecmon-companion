/**
 * Rundentipps aus der offiziellen CS2 Game State Integration (GSI).
 *
 * Grundsätze:
 * - Ausgewertet werden nur die eigenen Daten des Spielers, die CS2 ohnehin schickt.
 *   Zuschauer-, GOTV- und Demo-Daten anderer Spieler werden ignoriert.
 * - Kein Bomben-Countdown, keine Gegnerinfos, keine Eingaben an das Spiel.
 * - Tipps erscheinen nur in ruhigen Momenten: vor allem in der Kaufzeit zu Rundenbeginn,
 *   außerdem am Rundenende, nach dem eigenen Tod, in der Aufwärmphase, zur Halbzeit und
 *   am Matchende. Sobald die Runde läuft und du lebst, ist der Companion still.
 */

import { SPRAY_PATTERNS } from "./spray-patterns.mjs";
import { MAP_SPOTS, radarPoint, nearestSpot } from "./map-spots.mjs";

/** Einzeln abschaltbare Funktionen (Optionen im Companion). */
export const FEATURES = [
  { id: "economy", label: "Wirtschaft und Kaufempfehlung", categories: ["economy"] },
  { id: "buy", label: "Kauf-Check (Helm, Rüstung, Kit, Geld übrig)", categories: ["buy"] },
  { id: "map", label: "Map-Karte mit Callouts", categories: ["map"] },
  { id: "spray", label: "Spray-Muster beim Waffenkauf", categories: ["weapon"] },
  { id: "history", label: "Tipps aus deinen TecMon-Matches", categories: ["history"] },
  { id: "team", label: "Spielstand und Momentum (Serien, Timeout, Rundenenden)", categories: ["team"] },
  { id: "death", label: "Tipps nach deinem Tod", categories: ["death"] },
  { id: "habits", label: "Gewohnheiten (Nachladen, Flashes, Feuer, Schaden)", categories: ["habit"] },
  { id: "mindset", label: "Kopf und Lob (Tilt, Pausen, starke Runden)", categories: ["mindset", "praise"] },
  { id: "summary", label: "Aufwärmen, Halbzeit- und Match-Bilanz", categories: ["summary", "warmup"] },
  /* Anzeige statt Tipp-Art: Tipps derselben Runde in einer größeren Sprechblase sammeln. */
  { id: "stack", label: "Mehrere Tipps zusammen in einer großen Sprechblase", categories: [] },
];
const FEATURE_OF = Object.fromEntries(FEATURES.flatMap((f) => f.categories.map((c) => [c, f.id])));

/** Alternative Routen, wenn du an einem Spot oft stirbst. */
const ALTERNATIVES = {
  de_dust2: { "Long A": "Short", "Long Doors": "Short oder Mid", "Outside Long": "Mid zu Short", "Upper Tunnels": "Mid zu B", "Lower Tunnels": "Long A", Mid: "Long A oder Tunnels", Short: "Long A" },
  de_mirage: { "A-Ramp": "Palace", Palace: "A-Ramp oder Mid zu Connector", "Top-Mid": "Apartments zu B", Apartments: "Mid zu Short", Underpass: "Apartments", Short: "Apartments" },
  de_inferno: { Banana: "Apartments zu A", Apartments: "Mid zu Short", Mid: "Banana", Short: "Apartments" },
  de_ancient: { "A Main": "Mid zu Donut", Mid: "A Main", "B Ramp": "Mid zu Cave", Cave: "B Ramp" },
};

/** Spielmodi mit Wirtschaft und festen Halbzeiten. */
const HALF = { competitive: 12, premier: 12, scrimcomp2v2: 8 };
const OVERTIME_HALF = 3;
const OVERTIME_MONEY = 12500;
const FULL_BUY = { T: 4300, CT: 4800 };
/* Abstand zwischen zwei Tipps; Bilder brauchen länger. Die Kaufzeit dauert etwa 15 bis 20 Sekunden. */
const MIN_GAP = 4500;
const VISUAL_GAP = 8000;
const BRIEFING_LIMIT = 3;
const SESSION_GAP = 30 * 60 * 1000;
const LONG_SESSION = 2 * 60 * 60 * 1000;

const GRENADES = {
  weapon_flashbang: "Flash",
  weapon_smokegrenade: "Smoke",
  weapon_hegrenade: "HE-Granate",
  weapon_molotov: "Molotov",
  weapon_incgrenade: "Brandgranate",
};

/* Beschreibung passend zum Einschlagmuster aus spray-patterns.mjs: Muster nach links heißt Maus nach rechts. */
const SPRAY = {
  weapon_ak47:
    "AK-47: Schuss 1 bis 9 steigen steil, also Maus kräftig nach unten ziehen. Danach wandert das Muster nach links (Maus nach rechts), ab etwa Schuss 17 nach rechts (Maus nach links). Auf Distanz lieber Bursts von 3 bis 5 Kugeln.",
  weapon_m4a1:
    "M4A4: Die ersten 10 Schuss steigen gleichmäßig, Maus stetig nach unten. Danach zieht es nach links (Maus nach rechts) und ab etwa Schuss 20 wieder nach rechts.",
  weapon_m4a1_silencer:
    "M4A1-S: Steigt in den ersten 10 Schuss, dann leicht nach links (Maus etwas nach rechts). Nur 20 Schuss, also ruhig und kontrolliert, nicht wild sprayen.",
  weapon_galilar:
    "Galil AR: Steigt bis etwa Schuss 10 leicht nach rechts, dann nach links und ab Schuss 20 wieder nach rechts. Kurze Bursts treffen besser als lange Sprays.",
  weapon_famas:
    "FAMAS: Steigt bis etwa Schuss 12, danach pendelt es nach rechts. Bursts und kurze Sprays auf mittlere Distanz.",
  weapon_aug:
    "AUG: Mit Zoom auf Distanz sehr genau. Ohne Zoom steigt es wie ein normales Gewehr, Maus nach unten ziehen.",
  weapon_sg556:
    "SG 553: Mit Zoom auf Distanz sehr genau. Ohne Zoom steigt es wie ein normales Gewehr, Maus nach unten ziehen.",
  weapon_mac10:
    "MAC-10: Steigt bis etwa Schuss 13 mit Zug nach rechts (Maus nach links), dann nach links. Auf kurze Distanz im Laufen stark, auf Distanz schwach.",
  weapon_mp9:
    "MP9: Zieht in den ersten 13 Schuss deutlich nach rechts oben (Maus nach links unten), danach nach links. Stark auf kurze Distanz.",
  weapon_ump45:
    "UMP-45: Steigt bis etwa Schuss 10, danach nach rechts (Maus nach links). Auf mittlere Distanz lieber Bursts.",
  weapon_awp:
    "AWP: Nach dem Schuss nicht stehen bleiben. Position wechseln oder hinter Deckung, bevor du wieder peekst.",
  weapon_deagle:
    "Desert Eagle: Zwischen den Schüssen kurz warten, bis das Fadenkreuz wieder ruhig ist. Spammen trifft selten.",
};

function sprayText(name) {
  if (SPRAY[name]) return SPRAY[name];
  const pattern = SPRAY_PATTERNS[name];
  return pattern
    ? `${pattern.label}: So landet ein Spray ohne Ausgleich. Zieh die Maus entgegen dem Muster und stoppe nach 5 bis 10 Schuss.`
    : "";
}

function sprayVisual(name) {
  const pattern = SPRAY_PATTERNS[name];
  return pattern ? { type: "spray", label: pattern.label, points: pattern.points } : null;
}


const MAP_TIPS = {
  de_mirage: {
    T: [
      "Mirage: Eine Window-Smoke von T-Spawn öffnet Mid für dein Team.",
      "Mirage: Für A sind Smokes auf CT, Jungle und Stairs Standard. Danach über Ramp und Palace gleichzeitig rein.",
      "Mirage: Mid-Kontrolle macht Splits über Connector nach A oder über Short nach B möglich.",
    ],
    CT: [
      "Mirage: Eine frühe Molotov in Apps bremst B-Rushes.",
      "Mirage: Über Connector und Jungle rotierst du am schnellsten zwischen Mid und A.",
      "Mirage: Kein Spieler sollte Mid allein ohne Hilfe halten. Sprich Rotationen mit deinem Team ab.",
    ],
  },
  de_inferno: {
    T: [
      "Inferno: Banana-Kontrolle ist der Schlüssel für B. Molotovs auf Car und Logs drängen den CT zurück.",
      "Inferno: Für A helfen Smokes auf Library, Arch und Pit, dann Apartments und Short gleichzeitig.",
      "Inferno: Ein langsamer Default mit Infos aus Banana und Apartments verunsichert die CTs.",
    ],
    CT: [
      "Inferno: Banana früh mit Molotov und HE verzögern, das kauft Zeit für Rotationen.",
      "Inferno: Auf B die CT- und Coffins-Smokes der Ts erwarten. Nach dem Plant gemeinsam retaken.",
      "Inferno: Bei Druck über Apartments rotiert Arch schnell nach A.",
    ],
  },
  de_dust2: {
    T: [
      "Dust2: Eine Flash über die Long-Doors hilft gegen den CT auf Long.",
      "Dust2: B-Exec aus Tunnels: Smoke auf Door, Flash über die Wand, dann zügig rein.",
      "Dust2: Mid-Kontrolle über Xbox öffnet Short-A und Splits nach B.",
    ],
    CT: [
      "Dust2: Long-A am besten mit Crossfire von Pit und Car spielen.",
      "Dust2: Auf B auf Schritte in Tunnels achten und früh Utility in den Ausgang werfen.",
      "Dust2: Mid-Doors sind die schnellste Rotation, aber gefährlich ohne Smoke.",
    ],
  },
  de_nuke: {
    T: [
      "Nuke: Hut- und Heaven-Kontrolle entscheiden A. Erst Heaven flashen, dann Hut peeken.",
      "Nuke: Ramp ist der direkte Weg nach B. Utility am Ramp-Eingang klärt die Ecken.",
      "Nuke: Outside-Smokes öffnen den Weg über Secret.",
    ],
    CT: [
      "Nuke: Über Vents rotierst du am schnellsten zwischen A und B.",
      "Nuke: Outside früh mit Utility verzögern, sonst kommen die Ts über Secret.",
      "Nuke: Halte Ramp nicht allein. Ein Trade aus dem Hintergrund rettet die Runde.",
    ],
  },
  de_ancient: {
    T: [
      "Ancient: Mid-Kontrolle öffnet beide Bombenplätze.",
      "Ancient: Für A lohnt sich Utility auf die typischen CT-Positionen vor dem Main-Push.",
    ],
    CT: [
      "Ancient: Auf A Main früh Utility werfen, die Ts kommen dort oft schnell.",
      "Ancient: Mid nicht kampflos abgeben. Von dort kommen Splits auf beide Plätze.",
    ],
  },
};

const GENERIC_TIPS = {
  T: [
    "Spielt mit Default: Erst Infos sammeln, spät entscheiden und dann gemeinsam auf einen Platz.",
    "Nach dem Plant: Crossfire-Positionen einnehmen statt allein auf der Bombe zu sitzen.",
    "Entry nie ohne Flash und Trade. Der zweite Spieler muss direkt nachkommen.",
  ],
  CT: [
    "Nicht allein peeken. Spiel so, dass ein Mitspieler deinen Tod sofort traden kann.",
    "Utility früh einsetzen, um Pushes zu verzögern. Zeit ist auf CT-Seite dein Vorteil.",
    "Beim Retake gemeinsam rein und vorher Utility koordinieren.",
  ],
};

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const dollars = (value) => `${number(value).toLocaleString("de-DE")} $`;

/** Verlustbonus der nächsten Niederlage in CS2 (1.400 $ bis 3.400 $). */
export function nextLossBonus(losses) {
  return 1400 + 500 * Math.min(Math.max(0, number(losses)), 4);
}

/** Rundenart aus Rundennummer (0-basiert) und Halbzeitlänge. */
export function roundKind(round, half) {
  const regulation = half * 2;
  if (round === 0 || round === half) return "pistol";
  if (round === half - 1 || round === regulation - 1) return "last-of-half";
  if (round >= regulation) {
    const step = (round - regulation) % (OVERTIME_HALF * 2);
    if (step === 0) return "overtime-start";
    if (step === OVERTIME_HALF - 1 || step === OVERTIME_HALF * 2 - 1) return "last-of-half";
  }
  return "normal";
}

function ownLosses(map, side) {
  const team = map?.[side === "CT" ? "team_ct" : "team_t"];
  if (team && Number.isFinite(Number(team.consecutive_round_losses)))
    return number(team.consecutive_round_losses);
  const wins = map?.round_wins;
  if (!wins || typeof wins !== "object") return 0;
  let losses = 0;
  const keys = Object.keys(wins)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => b - a);
  for (const key of keys) {
    if (String(wins[key]).startsWith(side === "CT" ? "ct_" : "t_")) break;
    losses++;
  }
  return losses;
}

function grenadesOf(player) {
  const names = [];
  for (const weapon of Object.values(player?.weapons || {})) {
    const label = GRENADES[weapon?.name];
    if (!label) continue;
    const count = Math.max(1, number(weapon.ammo_reserve));
    for (let i = 0; i < count; i++) names.push(label);
  }
  return names;
}

function list(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) || 0) + 1);
  const parts = [...counts].map(([name, count]) => (count > 1 ? `${count} × ${name}` : name));
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} und ${parts.at(-1)}` : parts[0];
}

function activeWeapon(player) {
  return Object.values(player?.weapons || {}).find(
    (weapon) => weapon?.state === "active" || weapon?.state === "reloading",
  );
}

function primaryWeapon(player) {
  return Object.values(player?.weapons || {}).find((weapon) =>
    ["Rifle", "SniperRifle", "Submachine Gun", "Machine Gun", "Shotgun"].includes(weapon?.type),
  );
}

export const HABIT_KEYS = [
  "matches", "rounds", "kills", "deaths", "openingKills", "openingDeaths", "tradedDeaths",
  "shots", "hits", "shotsMoving", "headHits", "unusedNades", "flashes", "enemiesFlashed",
  "teamFlashed", "clutchPlayed", "clutchWon", "roundsAfterLoss", "killsAfterLoss",
  "roundsAfterWin", "killsAfterWin", "damage", "utilityDamage", "teamDamage", "grenades",
  "selfFlashed", "flashAssists", "bombRounds", "bombLost", "plants", "soloPlants", "multi3",
  "tKills", "tDeaths", "ctKills", "ctDeaths", "tAlive", "tAlone", "ctAlive", "ctAlone",
];

function sumHabits(list) {
  const valid = list.filter((h) => h && h.matches > 0);
  if (!valid.length) return null;
  return Object.fromEntries(HABIT_KEYS.map((k) => [k, valid.reduce((s, h) => s + number(h[k]), 0)]));
}

const WEAPON_LABELS = {
  ak47: "AK-47", m4a1: "M4A4", m4a1_silencer: "M4A1-S", awp: "AWP", galilar: "Galil AR", famas: "FAMAS",
  aug: "AUG", sg556: "SG 553", ssg08: "SSG 08", deagle: "Desert Eagle", usp_silencer: "USP-S",
  glock: "Glock-18", mac10: "MAC-10", mp9: "MP9", ump45: "UMP-45", p250: "P250", mp7: "MP7", p90: "P90",
};
const weaponLabel = (name) => WEAPON_LABELS[name] || name.toUpperCase();

function sumWeapons(list) {
  const out = {};
  for (const weapons of list) {
    if (!weapons) continue;
    for (const [name, w] of Object.entries(weapons)) {
      const sum = (out[name] ??= [0, 0, 0, 0]);
      for (let i = 0; i < 4; i++) sum[i] += number(w?.[i]);
    }
  }
  return Object.keys(out).length ? out : null;
}

const share = (part, total) => Math.round((part / total) * 100);
const decimal = (value) => value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Tipps aus eigenen, gemessenen Summen. Schwächen zuerst, danach Lob. Jede Regel braucht
 * genug Daten, damit ein einzelnes schlechtes Match keinen Tipp auslöst.
 */
export function habitAdvice(h, scope, side = "", weapons = null) {
  const tips = [];
  const openings = h.openingKills + h.openingDeaths;
  const rounds = Math.max(1, h.rounds);
  const kd = (kills, deaths) => (deaths ? kills / deaths : kills);
  const sideKd = { T: kd(h.tKills, h.tDeaths), CT: kd(h.ctKills, h.ctDeaths) };
  const other = side === "CT" ? "T" : "CT";
  const fmt = (v) => v.toFixed(2).replace(".", ",");
  /* Seitenbezogen zuerst, weil sie genau zur gerade beginnenden Hälfte passen. */
  if ((side === "T" || side === "CT") && h[`${side.toLowerCase()}Deaths`] >= 20 && h[`${other.toLowerCase()}Deaths`] >= 20) {
    if (sideKd[side] < 0.8 && sideKd[other] >= 1)
      tips.push({ key: `side-${side}`, text: `${scope} liegt deine K/D als ${side} bei ${fmt(sideKd[side])}, als ${other} bei ${fmt(sideKd[other])}. Spiel diese Hälfte mehr mit deinem Team und such dir Positionen, in denen du getradet wirst.` });
    else if (sideKd[side] >= 1.2 && sideKd[side] > sideKd[other])
      tips.push({ key: `side-${side}`, text: `${scope} ist ${side} deine stärkere Seite (K/D ${fmt(sideKd[side])}). Übernimm Verantwortung und fordere die wichtigen Positionen.` });
  }
  if (side === "T" && h.tAlive >= 2000 && h.tAlone / h.tAlive >= 0.4 && h.deaths >= 20 && h.tradedDeaths / h.deaths < 0.3)
    tips.push({ key: "lurk", text: `${scope} warst du als T ${share(h.tAlone, h.tAlive)} % deiner Zeit ohne Mitspieler in der Nähe und wurdest selten getradet. Als Lurker gezielt Infos holen und Timings mit dem Team absprechen, sonst lieber beim Team bleiben.` });
  if (side === "T" && h.bombRounds >= 10 && h.bombLost / h.bombRounds >= 0.3)
    tips.push({ key: "bomb", text: `${scope} bist du in ${h.bombLost} von ${h.bombRounds} Runden mit der Bombe gestorben, ohne zu planten. Mit der Bombe nicht als Erster peeken, sondern hinter dem Team bleiben.` });
  if (side === "T" && h.plants >= 8 && h.soloPlants / h.plants >= 0.5)
    tips.push({ key: "soloplant", text: `${scope} hast du ${h.soloPlants} von ${h.plants} Bomben ohne Mitspieler in der Nähe gelegt. Warte kurz auf Deckung, bevor du plantest.` });
  if (side === "CT" && weapons) {
    const acc = (w) => (w && w[2] >= 150 ? w[3] / w[2] : null);
    const m4 = acc(weapons.m4a1);
    const m4s = acc(weapons.m4a1_silencer);
    if (m4 !== null && m4s !== null && Math.abs(m4 - m4s) >= 0.05) {
      const [best, worse, a, b] = m4s > m4 ? ["M4A1-S", "M4A4", m4s, m4] : ["M4A4", "M4A1-S", m4, m4s];
      tips.push({ key: "m4", text: `${scope} triffst du mit der ${best} ${Math.round(a * 100)} % deiner Schüsse, mit der ${worse} nur ${Math.round(b * 100)} %. Kauf dir lieber die ${best}.` });
    }
  }
  if (openings >= 10 && h.openingDeaths / openings >= 0.6)
    tips.push({ key: "opening", text: `${scope} hast du ${h.openingDeaths} von ${openings} Eröffnungsduellen verloren. Geh zum Rundenstart nicht allein als Erster rein, sondern mit Flash oder zu zweit.` });
  if (h.deaths >= 30 && h.tradedDeaths / h.deaths < 0.2)
    tips.push({ key: "trade", text: `${scope} wurden nur ${share(h.tradedDeaths, h.deaths)} % deiner Tode getradet. Bleib näher an deinem Team, damit ein Mitspieler sofort nachziehen kann.` });
  if (h.shots >= 300 && h.shotsMoving / h.shots >= 0.3)
    tips.push({ key: "moving", text: `${scope} kamen ${share(h.shotsMoving, h.shots)} % deiner Schüsse aus der Bewegung. Vor dem Schuss kurz stoppen (Counter-Strafe), dann treffen Gewehre deutlich besser.` });
  if (h.hits >= 200 && h.headHits / h.hits < 0.15)
    tips.push({ key: "head", text: `${scope} gingen nur ${share(h.headHits, h.hits)} % deiner Treffer an den Kopf. Halte das Fadenkreuz auf Kopfhöhe an den Ecken, wo Gegner auftauchen.` });
  if (weapons?.awp && weapons.awp[2] >= 40 && weapons.awp[3] / weapons.awp[2] < 0.3)
    tips.push({ key: "awp", text: `${scope} trifft nur jeder ${Math.max(2, Math.round(weapons.awp[2] / Math.max(1, weapons.awp[3])))}. AWP-Schuss. Lass den Gegner in dein Fadenkreuz laufen, statt hinterherzuflicken, und schieß erst, wenn das Visier ruhig ist.` });
  if (h.deaths >= 20 && h.unusedNades / h.deaths >= 0.6)
    tips.push({ key: "nades", text: `${scope} hattest du beim Tod im Schnitt ${decimal(h.unusedNades / h.deaths)} ungenutzte Granaten dabei. Wirf sie, bevor du in einen Kampf gehst.` });
  if (h.rounds >= 60 && h.grenades / rounds < 0.8)
    tips.push({ key: "utility", text: `${scope} hast du im Schnitt nur ${decimal(h.grenades / rounds)} Granaten pro Runde geworfen. Kauf in jeder Full-Buy-Runde Flash und Smoke und setz sie für dein Team ein.` });
  if (h.flashes >= 10 && h.teamFlashed > h.enemiesFlashed)
    tips.push({ key: "teamflash", text: `${scope} haben deine Flashes öfter Mitspieler (${h.teamFlashed}) als Gegner (${h.enemiesFlashed}) geblendet. Sag sie vorher an und wirf sie so, dass dein Team nicht hineinschaut.` });
  if (h.flashes >= 15 && h.selfFlashed / h.flashes >= 0.3)
    tips.push({ key: "selfflash", text: `${scope} hast du dich ${h.selfFlashed}× mit deinen eigenen Flashes geblendet. Wirf sie über eine Kante oder dreh dich kurz weg, bevor sie zündet.` });
  if (h.rounds >= 40 && h.teamDamage / rounds >= 5)
    tips.push({ key: "teamdamage", text: `${scope} hast du im Schnitt ${Math.round(h.teamDamage / rounds)} Schaden pro Runde an Mitspielern gemacht. Achte auf deine Schusslinie und wirf Molotovs nicht in Positionen deines Teams.` });
  if (h.roundsAfterLoss >= 20 && h.roundsAfterWin >= 20) {
    const afterLoss = h.killsAfterLoss / h.roundsAfterLoss;
    const afterWin = h.killsAfterWin / h.roundsAfterWin;
    if (afterWin >= 0.5 && afterLoss < afterWin * 0.7)
      tips.push({ key: "tilt", text: `${scope} machst du nach verlorenen Runden weniger Kills (${decimal(afterLoss)} statt ${decimal(afterWin)} pro Runde). Nach einer Niederlage kurz durchatmen und die nächste Runde ruhig angehen.` });
  }
  /* Lob zum Schluss. */
  if (h.clutchPlayed >= 8 && h.clutchWon / h.clutchPlayed >= 0.35)
    tips.push({ key: "clutch", text: `${scope} hast du ${h.clutchWon} von ${h.clutchPlayed} Clutches gewonnen. Wenn du als Letzter übrig bist, bleib ruhig. Das kannst du.` });
  if (openings >= 10 && h.openingKills / openings >= 0.6)
    tips.push({ key: "entry", text: `${scope} hast du ${h.openingKills} von ${openings} Eröffnungsduellen gewonnen. Als Entry bist du stark, nimm die ersten Duelle mit Selbstvertrauen.` });
  if (h.flashes >= 15 && h.flashAssists >= 8)
    tips.push({ key: "flashassist", text: `${scope} haben deine Flashes ${h.flashAssists} Kills vorbereitet. Gute Support-Arbeit, sag deine Flashes weiter an.` });
  if (h.rounds >= 60 && h.damage / rounds >= 90)
    tips.push({ key: "adr", text: `${scope} machst du ${Math.round(h.damage / rounds)} Schaden pro Runde. Das ist stark, bleib bei deinem Spiel.` });
  if (h.multi3 >= 6)
    tips.push({ key: "multi", text: `${scope} hattest du ${h.multi3} Runden mit drei oder mehr Kills. Du kannst Runden allein drehen, such dir dafür aber gute Trades.` });
  if (weapons) {
    const best = Object.entries(weapons)
      .filter(([, w]) => w[0] >= 20 && w[1] / w[0] >= 0.55)
      .sort((a, b) => b[1][0] - a[1][0])[0];
    if (best)
      tips.push({ key: "weaponpraise", text: `${scope} sind ${share(best[1][1], best[1][0])} % deiner Kills mit der ${weaponLabel(best[0])} Headshots. Deine Zielhöhe passt.` });
  }
  return tips;
}

function halfIndex(round, half) {
  return round < half * 2 ? Math.floor(round / half) : 2 + Math.floor((round - half * 2) / OVERTIME_HALF);
}

export function createGameTips({
  now = () => Date.now(),
  radarPath = () => "",
  enabled = () => true,
  insights = () => null,
} = {}) {
  let tipId = 0;
  let current = null;
  const history = [];
  let queue = [];
  let lastShown = 0;
  let gap = MIN_GAP;
  let lastSeen = 0;
  let sessionStart = 0;
  let longSessionShown = false;
  let match = null;
  let last = null;
  let quiet = false;

  function newMatch(map) {
    return {
      name: map.name,
      mode: map.mode,
      ownSeen: false,
      lastOwn: null,
      lowHpSince: 0,
      deadThisRound: false,
      deathTipCount: 0,
      utilityDeaths: 0,
      awpDeaths: 0,
      earlyReloads: 0,
      lastReload: "",
      fullFlashes: 0,
      burns: 0,
      noKillDeaths: 0,
      kills: 0,
      headshots: 0,
      damage: 0,
      rounds: 0,
      sprayShown: new Set(),
      liveSince: 0,
      earlyDeaths: 0,
      mapShown: new Set(),
      briefed: 0,
      freezeSince: 0,
      buyChecked: -1,
      mvps: 0,
      streakShown: "",
      endShown: new Set(),
      mapTip: 0,
      economy: "",
      flags: new Set(),
    };
  }

  const allowed = (category) => enabled(FEATURE_OF[category] || category) !== false;

  function push(text, { priority = 1, category = "info", round = 0, visual = null } = {}) {
    if (!text || !allowed(category)) return;
    queue.push({ text, priority, category, round, visual, queuedAt: now() });
  }

  function publish(entry) {
    current = { id: ++tipId, text: entry.text, category: entry.category, round: entry.round, at: now() };
    if (entry.visual) current.visual = entry.visual;
    /* Bilder brauchen länger zum Lesen als ein Satz. */
    gap = entry.visual ? VISUAL_GAP : MIN_GAP;
    history.unshift(current);
    history.length = Math.min(history.length, 12);
    lastShown = current.at;
  }

  function once(flag, text, options) {
    if (match.flags.has(flag)) return;
    match.flags.add(flag);
    push(text, options);
  }

  function economyTip(map, own, round, half) {
    const side = own.team;
    const money = number(own.state?.money);
    const kind = roundKind(round, half);
    const scores = { CT: number(map.team_ct?.score), T: number(map.team_t?.score) };
    const enemy = side === "CT" ? "T" : "CT";
    const winAt = half + 1;
    if (round < half * 2 && (scores[side] === half || scores[enemy] === half)) {
      const ours = scores[side] === half;
      const theirs = scores[enemy] === half;
      return {
        key: `match-point-${round}`,
        text:
          ours && theirs
            ? "Beide Teams brauchen nur noch eine Runde. Alles ausgeben, Sparen bringt nichts mehr."
            : ours
              ? `Matchball für euch, noch eine Runde bis ${winAt}. Volle Ausrüstung, aber nicht überhastet spielen.`
              : "Matchball für den Gegner. Alles ausgeben, Sparen bringt jetzt nichts mehr.",
      };
    }
    if (kind === "pistol")
      return {
        key: `pistol-${round}`,
        text:
          side === "CT"
            ? "Pistolenrunde: Mit 800 $ wirkt Kevlar oder ein Defuse-Kit mit einer Granate oft mehr als eine bessere Pistole."
            : "Pistolenrunde: Kevlar (650 $) oder Flash und Smoke kaufen und gemeinsam mit dem Team pushen.",
      };
    if (kind === "overtime-start")
      return {
        key: `ot-${round}`,
        text: `Verlängerung: Ihr startet mit ${dollars(OVERTIME_MONEY)}. Full Buy mit kompletter Utility, Sparen lohnt sich nicht.`,
      };
    if (kind === "last-of-half" && money >= 1000)
      return {
        key: `last-${round}`,
        text: `Letzte Runde vor dem Seitenwechsel: Deine ${dollars(money)} verfallen danach. Gib alles aus.`,
      };
    const full = FULL_BUY[side] || FULL_BUY.T;
    const bonus = nextLossBonus(ownLosses(map, side));
    if (money >= full + 4000)
      return {
        key: "rich",
        text: `Du hast ${dollars(money)}: Full Buy und danach genug übrig, um einem Mitspieler eine Waffe zu kaufen.`,
      };
    if (money >= full) return { key: "full", text: "" };
    if (money + bonus >= full)
      return {
        key: "eco",
        text: `Eco empfohlen (${dollars(money)}). Selbst bei einer Niederlage hast du nächste Runde mindestens ${dollars(money + bonus)} für einen Full Buy.`,
      };
    return {
      key: "tight",
      text: `Knapp bei Kasse: ${dollars(money)}, Verlustbonus bei Niederlage ${dollars(bonus)}. Mit dem Team absprechen, ob ihr gemeinsam spart oder gemeinsam force-buyt.`,
    };
  }

  function buyCheck(own, round, half) {
    if (roundKind(round, half) === "pistol") return;
    const state = own.state || {};
    const money = number(state.money);
    const equipment = number(state.equip_value);
    if (equipment < 3000) return;
    const notes = [];
    if (!allowed("buy")) return;
    if (number(state.armor) === 0 && money >= 650)
      notes.push(`Ohne Rüstung unterwegs, obwohl du ${dollars(money)} hast.`);
    else if (number(state.armor) < 70 && money >= 650)
      notes.push(`Deine Weste hat nur noch ${number(state.armor)}. Eine neue kostet 650 $ und lohnt sich.`);
    else if (number(state.armor) > 0 && !state.helmet && money >= 350)
      notes.push("Kein Helm gekauft. Ohne Helm ist ein Kopftreffer mit dem Gewehr fast immer tödlich.");
    if (own.team === "CT" && !state.defusekit && money >= 400)
      notes.push("Kein Defuse-Kit (400 $). Mit Kit dauert das Entschärfen 5 statt 10 Sekunden.");
    if (money >= 5000)
      notes.push(`Noch ${dollars(money)} übrig. Wirf einem Mitspieler eine Waffe, solange die Kaufzeit läuft.`);
    if (notes.length) publish({ text: notes.slice(0, 2).join(" "), category: "buy", round });
  }

  /** Radarkarte mit den wichtigsten Spots zu Beginn jeder Halbzeit (nur wenn das Radarbild lokal vorhanden ist). */
  function mapOverview(mapName, side, round) {
    const data = MAP_SPOTS[mapName];
    const key = `${side}-${round}`;
    if (match.mapShown.has(key)) return false;
    match.mapShown.add(key);
    const tipPool = MAP_TIPS[mapName]?.[side] || GENERIC_TIPS[side] || [];
    const extra = tipPool.length ? ` ${tipPool[match.mapTip++ % tipPool.length].replace(/^[^:]+: /, "")}` : "";
    if (!data) {
      if (extra) push(extra.trim(), { priority: 2, category: "map", round });
      return true;
    }
    const hot = data[side] || [];
    const image = radarPath(mapName);
    push(`${data.name} als ${side}: Die wichtigsten Spots sind ${list(hot)}.${extra}`, {
      priority: 3,
      category: "map",
      round,
      visual: image
        ? {
            type: "map",
            map: mapName,
            image,
            side,
            spots: data.spots.map((spot) => ({ ...spot, hot: hot.includes(spot.label) })),
          }
        : null,
    });
    return true;
  }

  /** Tipps aus den auf TecMon ausgewerteten Matches (vom Browser an den Companion übertragen). */
  function historyTips(mapName, side, round, steamId) {
    const data = insights(steamId);
    const stats = data?.maps?.[mapName];
    const spots = MAP_SPOTS[mapName];
    if (!stats || !stats.matches) return;
    const name = spots?.name || mapName.replace(/^de_/, "");
    const recent = `In deinen letzten ${stats.matches} ${stats.matches === 1 ? "Match" : "Matches"} auf ${name}`;
    const sideKey = side === "CT" ? 1 : 0;
    const deaths = (stats.deaths || []).filter((d) => d[2] === sideKey || d[2] === -1);
    if (spots?.radar && deaths.length >= 6) {
      const zones = new Map();
      const marks = [];
      for (const [x, y] of deaths) {
        const point = radarPoint(spots.radar, x, y);
        if (!point) continue;
        marks.push(point);
        const spot = nearestSpot(spots.spots, point);
        if (spot) zones.set(spot.label, (zones.get(spot.label) || 0) + 1);
      }
      const [label, count] = [...zones].sort((a, b) => b[1] - a[1])[0] || [];
      if (label && count >= 5 && count / deaths.length >= 0.2) {
        const share = Math.round((count / deaths.length) * 100);
        const other = ALTERNATIVES[mapName]?.[label];
        const advice =
          side === "T"
            ? other
              ? ` Probier mal eine andere Route, zum Beispiel ${other}.`
              : " Probier mal eine andere Route oder komm dort mit Flash und einem Mitspieler."
            : " Spiel dort mal einen anderen Winkel, wechsle nach einem Kill die Position oder lass dich zurückfallen.";
        const image = radarPath(mapName);
        push(`${recent} bist du als ${side} ${count}× bei ${label} gestorben (${share} % deiner Tode).${advice}`, {
          priority: 3,
          category: "history",
          round,
          visual: image
            ? {
                type: "map",
                map: mapName,
                image,
                side,
                marks: marks.slice(0, 300),
                spots: spots.spots.map((spot) => ({ ...spot, hot: spot.label === label })),
              }
            : null,
        });
        return;
      }
    }
    const rounds = number(stats[side === "CT" ? "ctRounds" : "tRounds"]);
    const won = number(stats[side === "CT" ? "ctWon" : "tWon"]);
    if (rounds >= 30) {
      const rate = Math.round((won / rounds) * 100);
      if (rate < 45)
        push(`${recent} gewinnst du als ${side} nur ${rate} % der Runden. Spiel diese Hälfte bewusst mit deinem Team und nimm dir keine Solo-Peeks.`, { priority: 2, category: "history", round });
      else if (rate >= 58)
        push(`${recent} gewinnst du als ${side} ${rate} % der Runden. Das ist deine starke Seite, spiel sie selbstbewusst.`, { priority: 1, category: "history", round });
    }
  }

  /**
   * Gewohnheiten aus den TecMon-Matches (insights-v2): je Seitenstart höchstens ein Tipp,
   * immer ein anderer. Reicht die Map nicht für eine Aussage, zählen alle Maps zusammen.
   */
  function habitTips(mapName, side, round, steamId, priority = 2) {
    const data = insights(steamId);
    if (!data?.maps) return false;
    const name = MAP_SPOTS[mapName]?.name || mapName.replace(/^de_/, "");
    const here = data.maps[mapName];
    let habits = here?.habits;
    let weapons = here?.weapons || null;
    let scope = habits && habits.matches >= 3 ? `In deinen letzten ${habits.matches} Matches auf ${name}` : "";
    if (!scope) {
      habits = sumHabits(Object.values(data.maps).map((m) => m.habits));
      if (!habits || habits.matches < 3) return false;
      weapons = sumWeapons(Object.values(data.maps).map((m) => m.weapons));
      scope = `In deinen letzten ${habits.matches} ausgewerteten Matches`;
    }
    const tip = habitAdvice(habits, scope, side, weapons).find((entry) => !match.flags.has(`habit-${entry.key}`));
    if (!tip) return false;
    match.flags.add(`habit-${tip.key}`);
    push(tip.text, { priority, category: "history", round });
    return true;
  }

  /** Eigene Trefferquote mit der gerade gekauften Waffe, falls genug Schüsse ausgewertet sind. */
  function weaponNote(mapName, steamId, weaponName) {
    const data = insights(steamId);
    const key = String(weaponName || "").replace(/^weapon_/, "");
    if (!data?.maps) return "";
    const here = data.maps[mapName]?.weapons?.[key];
    const all = sumWeapons(Object.values(data.maps).map((m) => m.weapons))?.[key];
    const [w, where] = here && here[2] >= 150 ? [here, "auf dieser Map"] : all && all[2] >= 150 ? [all, "in deinen Matches"] : [];
    if (!w) return "";
    const hs = w[0] >= 10 ? `, ${share(w[1], w[0])} % deiner Kills damit sind Headshots` : "";
    return ` Deine Trefferquote damit ${where}: ${share(w[3], w[2])} %${hs}.`;
  }


  /** Serien und Rundenenden aus round_wins: Momentum, Timeout, typische Niederlagen. */
  function teamTips(map, side, round, half) {
    const wins = map.round_wins;
    if (!wins || typeof wins !== "object") return;
    const results = Object.keys(wins)
      .map(Number)
      .filter((key) => Number.isFinite(key) && key >= 1 && key <= round)
      .sort((a, b) => a - b)
      .map((key) => {
        const value = String(wins[key]);
        const played = key - 1;
        const same = (halfIndex(played, half) - halfIndex(round, half)) % 2 === 0;
        const ownSide = same ? side : side === "CT" ? "T" : "CT";
        return { value, ownSide, won: value.startsWith(ownSide === "CT" ? "ct_" : "t_") };
      });
    if (!results.length) return;
    let streak = 0;
    const lastWon = results.at(-1).won;
    for (let i = results.length - 1; i >= 0 && results[i].won === lastWon; i--) streak++;
    const key = `${lastWon ? "w" : "l"}${streak}`;
    if (streak >= 4 && match.streakShown !== key && (streak === 4 || streak % 3 === 1)) {
      match.streakShown = key;
      const team = map[side === "CT" ? "team_ct" : "team_t"];
      const timeouts = number(team?.timeouts_remaining);
      push(
        lastWon
          ? `${streak} Runden in Folge gewonnen. Tempo halten, aber nicht übermütig werden: Der Gegner hat bald genug Geld für einen Full Buy.`
          : `Der Gegner hat ${streak} Runden in Folge geholt.${timeouts > 0 ? ` Ein taktisches Timeout (noch ${timeouts} übrig) kann den Lauf brechen.` : ""} Kurz neu sortieren und als Team einen klaren Plan spielen.`,
        { priority: 3, category: "team", round },
      );
      return;
    }
    const lost = results.filter((r) => !r.won && r.ownSide === side);
    const count = (type) => lost.filter((r) => r.value.endsWith(type)).length;
    const checks =
      side === "CT"
        ? [["bomb", 3, "Ihr verliert als CT oft nach dem Plant. Defuse-Kit kaufen, früher rotieren und den Retake gemeinsam mit Utility starten."]]
        : [
            ["time", 2, "Als T ist euch schon zweimal die Zeit ausgegangen. Früher entscheiden: spätestens bei 40 Sekunden auf einen Platz gehen."],
            ["defuse", 2, "Nach eurem Plant wurde schon zweimal entschärft. Post-Plant-Positionen mit Crossfire halten und eine Molotov für die Bombe aufheben."],
          ];
    for (const [type, limit, text] of checks)
      if (count(type) >= limit && !match.endShown.has(`${side}-${type}`)) {
        match.endShown.add(`${side}-${type}`);
        push(text, { priority: 2, category: "team", round });
        return;
      }
  }

  function onDeath(previous, round) {
    match.deadThisRound = true;
    const nades = grenadesOf(previous);
    const health = number(previous.state?.health);
    const weapon = activeWeapon(previous)?.name;
    const roundKills = number(previous.state?.round_kills);
    if (weapon === "weapon_awp" && roundKills === 0) match.awpDeaths++;
    if (nades.length) {
      match.utilityDeaths++;
      if (match.utilityDeaths === 1 || match.utilityDeaths % 3 === 0) {
        const repeat = match.utilityDeaths > 1 ? ` Das ist schon das ${match.utilityDeaths}. Mal in dieser Partie.` : "";
        push(
          `Du bist mit ${list(nades)} gestorben, die du nicht geworfen hast. Utility früher einsetzen hilft dem Team auch nach deinem Tod.${repeat}`,
          { priority: 3, category: "death", round },
        );
        return;
      }
    }
    if (health > 0 && health <= 30 && match.lowHpSince && now() - match.lowHpSince >= 4000) {
      push(
        `Mit ${health} HP gestorben. Mit wenig Leben lieber zurückfallen, auf Infos spielen und den Peek einem Mitspieler überlassen.`,
        { priority: 2, category: "death", round },
      );
      return;
    }
    const alive = match.liveSince ? (now() - match.liveSince) / 1000 : 0;
    if (alive > 0 && alive <= 20) {
      match.earlyDeaths++;
      if (match.earlyDeaths === 1 || match.earlyDeaths % 3 === 0) {
        push(
          `Früher Tod nach ${Math.round(alive)} Sekunden${match.earlyDeaths > 1 ? ` (schon ${match.earlyDeaths}× in dieser Partie)` : ""}. Nicht als Erster ohne Flash peeken: Lass dir Infos geben oder geh mit einem Mitspieler, der dich traden kann.`,
          { priority: 2, category: "death", round },
        );
        return;
      }
    }
    if (match.awpDeaths === 2 && weapon === "weapon_awp")
      push(
        "Zweimal mit der AWP ohne Kill gestorben, das kostet jedes Mal 4.750 $. Spiel sie passiver oder nimm diesmal ein Gewehr.",
        { priority: 2, category: "death", round },
      );
  }

  function trackOwn(own, previous, phase, round) {
    const state = own.state || {};
    const health = number(state.health);
    if (health > 0 && health <= 30) {
      if (!match.lowHpSince) match.lowHpSince = now();
    } else match.lowHpSince = 0;
    if (phase !== "live") return;
    const before = previous?.state || {};
    if (number(state.flashed) >= 200 && number(before.flashed) < 200) {
      match.fullFlashes++;
      if (match.fullFlashes === 4)
        push(
          "Du warst diese Partie schon viermal voll geblendet. Bei einer Flash umdrehen oder hinter Deckung gehen.",
          { priority: 2, category: "habit", round },
        );
    }
    if (number(state.burning) > 0 && !(number(before.burning) > 0)) {
      match.burns++;
      if (match.burns === 4)
        push(
          "Du hast schon mehrmals im Feuer gestanden. Molotov-Flächen sofort verlassen oder umgehen, das spart viel HP.",
          { priority: 2, category: "habit", round },
        );
    }
    const weapon = activeWeapon(own);
    const prior = previous && activeWeapon(previous);
    if (
      weapon?.state === "reloading" &&
      !(prior?.state === "reloading" && prior?.name === weapon.name) &&
      number(weapon.ammo_clip_max) >= 10
    ) {
      const clip = number(weapon.ammo_clip);
      const max = number(weapon.ammo_clip_max);
      if (clip / max >= 0.6) {
        match.earlyReloads++;
        match.lastReload = `${clip}/${max}`;
        if (match.earlyReloads % 3 === 0)
          push(
            `Du hast schon ${match.earlyReloads}× mit fast vollem Magazin nachgeladen (zuletzt ${match.lastReload}). In der Nachladezeit bist du wehrlos. Lade erst nach, wenn du sicher stehst.`,
            { priority: 2, category: "habit", round },
          );
      }
    }
  }

  function roundOver(round) {
    const own = match.lastOwn;
    if (!own) return;
    const state = own.state || {};
    match.rounds++;
    match.headshots += number(state.round_killhs);
    match.damage += number(state.round_totaldmg);
    const kills = number(state.round_kills);
    const damage = number(state.round_totaldmg);
    if (kills === 0 && damage >= 100)
      push(
        `${damage} Schaden, aber kein Kill. Setz nach, wenn ein Gegner angeschlagen ist, oder gib die Info sofort weiter (zum Beispiel „einer hat 20 HP“).`,
        { priority: 1, category: "habit", round },
      );
    const mvps = number(own.match_stats?.mvps);
    if (mvps > match.mvps && kills < 3) push("MVP dieser Runde. Stark gespielt!", { priority: 0, category: "praise", round });
    match.mvps = mvps;
    if (kills >= 3)
      push(
        kills >= 5
          ? "ACE! Alle fünf Gegner in einer Runde. Genau so weiter."
          : `Starke Runde: ${kills} Kills${number(state.round_killhs) >= 2 ? `, davon ${number(state.round_killhs)} Headshots` : ""}. Merk dir, was hier funktioniert hat.`,
        { priority: 1, category: "praise", round },
      );
    if (match.deadThisRound && kills === 0) {
      match.noKillDeaths++;
      if (match.noKillDeaths === 4)
        push(
          "Vier Runden in Folge ohne Kill gestorben. Kurz durchatmen: etwas passiver spielen, bei einem Mitspieler bleiben und auf Trades achten.",
          { priority: 3, category: "mindset", round },
        );
    } else match.noKillDeaths = 0;
  }

  function summary(label) {
    const stats = match.lastOwn?.match_stats || {};
    const kills = number(stats.kills);
    const deaths = number(stats.deaths);
    const kd = deaths ? kills / deaths : kills;
    const hs = kills ? Math.round((match.headshots / kills) * 100) : 0;
    const adr = match.rounds && match.damage ? Math.round(match.damage / match.rounds) : 0;
    let text = `${label}: ${kills} Kills, ${deaths} Tode (K/D ${kd.toFixed(2).replace(".", ",")}), Headshot-Quote ${hs} %`;
    if (adr) text += `, ${adr} Schaden pro Runde`;
    text += ".";
    return { text, kd, hs, kills };
  }

  function training({ kd, hs, kills }) {
    if (kills >= 5 && hs < 35)
      return " Training auf TecMon: Headshot- und Flick-Übungen im Aim-Trainer, Fadenkreuz auf Kopfhöhe halten.";
    if (match.earlyReloads >= 3) return " Achte im nächsten Match auf deine Nachlade-Momente.";
    if (match.utilityDeaths >= 3) return " Tipp für das nächste Match: Granaten früher einsetzen.";
    if (kd < 0.8) return " Training auf TecMon: Tracking und Crosshair-Placement verbessern.";
    return " Training auf TecMon: Im Recoil Lab die Spray-Kontrolle weiter schärfen.";
  }

  function flush(windowOpen, freezetime) {
    if (!windowOpen || !queue.length || now() - lastShown < gap) return;
    if (freezetime && match && match.briefed >= BRIEFING_LIMIT) return;
    queue.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
    publish(queue.shift());
    if (freezetime && match) match.briefed++;
  }

  function ingest(payload) {
    const time = now();
    if (!sessionStart || time - lastSeen > SESSION_GAP) {
      sessionStart = time;
      longSessionShown = false;
    }
    lastSeen = time;
    const map = payload?.map;
    const provider = payload?.provider;
    const player = payload?.player;
    if (!map || typeof map !== "object" || !map.name) {
      match = null;
      last = null;
      quiet = false;
      return;
    }
    const half = HALF[map.mode];
    const round = number(map.round);
    if (!match || match.name !== map.name || (last && round < last.round)) {
      match = newMatch(map);
      queue = [];
    }
    const own =
      player && provider?.steamid && player.steamid === provider.steamid && player.team ? player : null;
    const roundPhase = payload.round?.phase || "";
    const mapPhase = map.phase || "";
    const previous = match.lastOwn;

    if (last && last.round !== round) {
      match.deadThisRound = false;
      match.lowHpSince = 0;
    }
    if (roundPhase === "live" && last?.roundPhase !== "live") match.liveSince = time;
    else if (roundPhase !== "live") match.liveSince = 0;
    if (own) {
      match.ownSeen = true;
      const health = number(own.state?.health);
      if (
        roundPhase === "live" &&
        previous &&
        number(previous.state?.health) > 0 &&
        health === 0 &&
        last?.round === round &&
        !match.deadThisRound
      )
        onDeath(previous, round);
      trackOwn(own, previous, roundPhase, round);
      /* Nach dem Tod bleibt der letzte lebende Stand erhalten (Granaten, Rundenkills); nur die Matchwerte laufen weiter. */
      match.lastOwn =
        health > 0 || !previous
          ? own
          : { ...previous, match_stats: own.match_stats || previous.match_stats };
    } else if (
      match.ownSeen &&
      roundPhase === "live" &&
      previous &&
      number(previous.state?.health) > 0 &&
      last?.round === round &&
      !match.deadThisRound
    ) {
      onDeath(previous, round);
    }

    if (!match.ownSeen) {
      last = { round, roundPhase, mapPhase };
      return;
    }

    const lastOwn = match.lastOwn;
    const side = lastOwn?.team;
    if (mapPhase === "warmup")
      once(
        "warmup",
        "Aufwärmphase: Nutze die Zeit für Spray-Kontrolle an der Wand und ein paar Headshot-Flicks. Viel Erfolg!",
        { priority: 1, category: "warmup" },
      );

    if (half && mapPhase === "live" && own) {
      if (roundPhase === "freezetime" && last?.roundPhase !== "freezetime") {
        /* Rundenbeginn: das Briefing für diese Kaufzeit zusammenstellen. Alte Tipps verfallen. */
        queue = queue.filter((entry) => ["summary", "mindset"].includes(entry.category));
        match.briefed = 0;
        match.freezeSince = time;
        const tip = economyTip(map, own, round, half);
        const show = tip.text && (!["rich", "eco", "tight"].includes(tip.key) || tip.key !== match.economy);
        match.economy = tip.key;
        const kind = roundKind(round, half);
        const firstOfSide = kind === "pistol" || kind === "overtime-start" || !match.mapShown.size;
        if (firstOfSide) {
          mapOverview(map.name, side, round);
          historyTips(map.name, side, round, own.steamid);
          habitTips(map.name, side, round, own.steamid);
        }
        if (show) push(tip.text, { priority: 2, category: "economy", round });
        teamTips(map, side, round, half);
        /* Zwischendurch eine weitere Erinnerung aus deinen Matches, jede nur einmal pro Match. */
        if (!firstOfSide && round % 4 === 2) habitTips(map.name, side, round, own.steamid, 1);
        if (!firstOfSide && !show && round % 3 === 1) {
          const pool = MAP_TIPS[map.name]?.[side] || GENERIC_TIPS[side];
          if (pool?.length) push(pool[match.mapTip++ % pool.length], { priority: 0, category: "map", round });
        }
      }
      if (roundPhase === "freezetime") {
        const primary = primaryWeapon(own);
        if (primary && sprayText(primary.name) && !match.sprayShown.has(primary.name)) {
          match.sprayShown.add(primary.name);
          push(sprayText(primary.name) + weaponNote(map.name, own.steamid, primary.name), {
            priority: 2,
            category: "weapon",
            round,
            visual: sprayVisual(primary.name),
          });
        }
        /* Kauf-Check kurz vor Ende der Kaufzeit, solange noch gekauft werden kann. */
        const countdown = payload.phase_countdowns;
        const endsIn = countdown?.phase === "freezetime" ? Number(countdown.phase_ends_in) : NaN;
        const late = Number.isFinite(endsIn) ? endsIn <= 5 : time - match.freezeSince >= 12000;
        if (late && match.buyChecked !== round) {
          match.buyChecked = round;
          buyCheck(own, round, half);
        }
      }
      /* Runde läuft: alles, was nicht zum eigenen Tod gehört, verfällt. */
      if (roundPhase === "live" && last?.roundPhase !== "live")
        queue = queue.filter((entry) => entry.category === "summary" || entry.category === "death");
    }
    if (roundPhase === "over" && last?.roundPhase === "live") roundOver(round);
    if (mapPhase === "intermission" && last?.mapPhase !== "intermission" && half)
      push(summary("Halbzeit").text, { priority: 4, category: "summary", round });
    if (mapPhase === "gameover" && last?.mapPhase !== "gameover") {
      const result = summary("Match vorbei");
      push(result.text + training(result), { priority: 5, category: "summary", round });
    }
    if (!longSessionShown && time - sessionStart >= LONG_SESSION) {
      longSessionShown = true;
      push("Du spielst seit über zwei Stunden. Eine kurze Pause nach diesem Match hilft der Konzentration.", {
        priority: 1,
        category: "mindset",
        round,
      });
    }

    queue = queue.filter((entry) => round - entry.round <= 2 && time - entry.queuedAt < 5 * 60 * 1000);
    const dead = !own || number(own.state?.health) === 0;
    const windowOpen =
      ["warmup", "intermission", "gameover"].includes(mapPhase) ||
      roundPhase === "freezetime" ||
      roundPhase === "over" ||
      (roundPhase === "live" && dead);
    flush(windowOpen, roundPhase === "freezetime" && mapPhase === "live");
    quiet = mapPhase === "live" && roundPhase === "live" && !dead;
    last = { round, roundPhase, mapPhase };
  }

  function state() {
    const time = now();
    const own = match?.lastOwn;
    return {
      connected: !!lastSeen && time - lastSeen < 20000,
      lastSeen: lastSeen || null,
      map: match?.name || null,
      mode: match?.mode || null,
      side: own?.team || null,
      /* Runde läuft und du lebst: Sprechblase ausblenden. */
      quiet: quiet && !!lastSeen && time - lastSeen < 20000,
      tip: current ? { ...current, age: time - current.at } : null,
      history: history.map((entry) => ({ ...entry, age: time - entry.at })),
    };
  }

  return { ingest, state };
}
