/**
 * Dota-2-Tipps aus der offiziellen Game State Integration.
 *
 * Grundsätze wie bei CS2:
 * - Nur eigene Werte (cleanDotaPayload), keine Gegner-Infos, keine Roshan- oder
 *   Buyback-Timer anderer Spieler, keine Eingaben ans Spiel.
 * - Gesprochen wird nur in Pausen: Strategiephase vor dem Horn, Spielpause, nach dem
 *   eigenen Tod und am Matchende. Solange du lebst und das Spiel läuft, ist der
 *   Companion still (`quiet`), und die Warteschlange wird geleert.
 * - Höchstens BRIEFING_LIMIT Tipps je Pause bzw. je Tod.
 */

export const DOTA_FEATURES = [
  { id: "farm", label: "Last Hits und Farm-Tempo", categories: ["farm"] },
  { id: "buyback", label: "Gold für Buyback", categories: ["buyback"] },
  { id: "actives", label: "Ungenutzte aktive Items beim Tod", categories: ["actives"] },
  { id: "gold", label: "Nicht ausgegebenes Gold beim Tod", categories: ["gold"] },
  { id: "summary", label: "Start- und Match-Bilanz", categories: ["summary"] },
];
const FEATURE_OF = Object.fromEntries(DOTA_FEATURES.flatMap((f) => f.categories.map((c) => [c, f.id])));

export const BRIEFING_LIMIT = 3;
const MIN_GAP = 4500;
/** Richtwerte für Kerne; Supports farmen bewusst weniger, das sagt der Tipp dazu. */
const LH_PER_MIN_CORE = 6;
const BUYBACK_FROM_MIN = 25;
const UNSPENT_GOLD = 2000;
const FARM_TIP_EVERY_S = 8 * 60;

/** Aktive Items, die man vor dem Tod meist hätte drücken können (interne Namen). */
const ACTIVES = {
  item_black_king_bar: "Black King Bar",
  item_blink: "Blink Dagger",
  item_overwhelming_blink: "Overwhelming Blink",
  item_swift_blink: "Swift Blink",
  item_arcane_blink: "Arcane Blink",
  item_glimmer_cape: "Glimmer Cape",
  item_force_staff: "Force Staff",
  item_hurricane_pike: "Hurricane Pike",
  item_ghost: "Ghost Scepter",
  item_ethereal_blade: "Ethereal Blade",
  item_cyclone: "Eul's Scepter",
  item_wind_waker: "Wind Waker",
  item_satanic: "Satanic",
  item_manta: "Manta Style",
  item_lotus_orb: "Lotus Orb",
  item_blade_mail: "Blade Mail",
  item_crimson_guard: "Crimson Guard",
  item_pipe: "Pipe of Insight",
  item_guardian_greaves: "Guardian Greaves",
  item_mekansm: "Mekansm",
  item_invis_sword: "Shadow Blade",
  item_silver_edge: "Silver Edge",
  item_sheepstick: "Scythe of Vyse",
  item_abyssal_blade: "Abyssal Blade",
  item_disperser: "Disperser",
  item_bloodthorn: "Bloodthorn",
  item_orchid: "Orchid Malevolence",
  item_nullifier: "Nullifier",
  item_refresher: "Refresher Orb",
  item_shivas_guard: "Shiva's Guard",
  item_solar_crest: "Solar Crest",
  item_pavise: "Pavise",
  item_harpoon: "Harpoon",
};

const STATE_PAUSE_OK = new Set([
  "DOTA_GAMERULES_STATE_HERO_SELECTION",
  "DOTA_GAMERULES_STATE_STRATEGY_TIME",
  "DOTA_GAMERULES_STATE_TEAM_SHOWCASE",
  "DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD",
  "DOTA_GAMERULES_STATE_PRE_GAME",
  "DOTA_GAMERULES_STATE_POST_GAME",
]);
const IN_PROGRESS = "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS";
const POST_GAME = "DOTA_GAMERULES_STATE_POST_GAME";

const fmt = (n) => Math.round(n).toLocaleString("de-DE");
const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export function createDotaTips({ now = () => Date.now(), enabled = () => true, flavor = (_c, text) => text } = {}) {
  let tipId = 0;
  let current = null;
  const history = [];
  let queue = [];
  let lastShown = 0;
  let lastSeen = 0;
  let quiet = false;
  let match = null;

  const allowed = (category) => enabled(FEATURE_OF[category] ?? category);

  function push(text, category, priority = 1) {
    if (!text || !allowed(category)) return;
    queue.push({ text, category, priority, queuedAt: now() });
  }

  function once(flag, text, category, priority) {
    if (match.flags.has(flag)) return;
    match.flags.add(flag);
    push(text, category, priority);
  }

  function publish(entry) {
    current = { id: ++tipId, text: flavor(entry.category, entry.text), category: entry.category, round: 0, at: now() };
    history.unshift(current);
    history.length = Math.min(history.length, 12);
    lastShown = current.at;
  }

  function farmTip(p, clockS) {
    const minutes = clockS / 60;
    if (minutes < 5 || clockS - match.lastFarmTip < FARM_TIP_EVERY_S) return;
    match.lastFarmTip = clockS;
    const rate = p.lastHits / minutes;
    const text =
      rate >= LH_PER_MIN_CORE
        ? `Starkes Farm-Tempo: ${p.lastHits} Last Hits nach ${clock(clockS)} (${rate.toFixed(1)} pro Minute).`
        : `${p.lastHits} Last Hits nach ${clock(clockS)} (${rate.toFixed(1)} pro Minute). Als Kern sind etwa ${LH_PER_MIN_CORE} pro Minute ein guter Richtwert, als Support ist weniger normal.`;
    push(text, "farm", 1);
  }

  function buybackTip(p, hero, clockS) {
    if (clockS < BUYBACK_FROM_MIN * 60 || hero?.buybackCost == null) return;
    const missing = hero.buybackCost - p.gold;
    if (missing > 0 && hero.buybackCooldown <= 0)
      push(`Für einen Buyback fehlen dir ${fmt(missing)} Gold (kostet ${fmt(hero.buybackCost)}). Ab jetzt lohnt es sich, Gold dafür zu halten.`, "buyback", 2);
  }

  function deathTips(data, clockS) {
    const { player: p, hero, items } = data;
    const ready = items.filter((it) => ACTIVES[it.name] && it.canCast && it.cooldown <= 0).map((it) => ACTIVES[it.name]);
    if (ready.length)
      push(`Beim Tod war ${ready.slice(0, 2).join(" und ")} noch bereit. Aktive Items früh im Kampf drücken.`, "actives", 3);
    if (p.gold >= UNSPENT_GOLD)
      push(`Du bist mit ${fmt(p.gold)} Gold gestorben. Vor Kämpfen ausgeben oder bewusst für Buyback halten.`, "gold", 2);
    buybackTip(p, hero, clockS);
    farmTip(p, clockS);
  }

  function summary(data) {
    const p = data.player;
    const won = data.map?.winTeam && p.team ? data.map.winTeam === p.team : null;
    push(
      `${won === null ? "Match vorbei" : won ? "Sieg" : "Niederlage"}: ${p.kills}/${p.deaths}/${p.assists}, ${p.lastHits} Last Hits, ${fmt(p.gpm)} GPM, ${fmt(p.xpm)} XPM. Lade das Replay auf TecMon, dann siehst du jeden Item-Kauf mit Zeit.`,
      "summary",
      3,
    );
  }

  /** Gibt einen Tipp aus, wenn gerade eine erlaubte Pause ist. */
  function flush(windowOpen) {
    if (!windowOpen || !queue.length || now() - lastShown < MIN_GAP) return;
    if (match && match.briefed >= BRIEFING_LIMIT) return;
    queue.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
    publish(queue.shift());
    if (match) match.briefed++;
  }

  /** Bekommt eine mit cleanDotaPayload bereinigte Nachricht. */
  function ingest(data) {
    lastSeen = now();
    if (!data?.map || !data.player) {
      match = null;
      quiet = false;
      return;
    }
    const { map, player: p, hero } = data;
    const key = map.matchid || "lokal";
    if (!match || match.key !== key) {
      match = { key, flags: new Set(), alive: true, paused: false, briefed: 0, lastFarmTip: -Infinity, ended: false };
      queue = [];
    }
    const clockS = map.clock ?? 0;
    const inProgress = map.state === IN_PROGRESS;
    const alive = hero ? hero.alive : true;

    if (map.state === "DOTA_GAMERULES_STATE_STRATEGY_TIME" || map.state === "DOTA_GAMERULES_STATE_PRE_GAME")
      once("start", "Dota-2-Tipps sind an: Ich melde mich nur in Pausen, nach deinem Tod und am Matchende.", "summary", 1);

    // Neue Pause (Tod oder Spielpause) = neues Kontingent an Tipps.
    if (inProgress && match.alive && !alive) {
      match.briefed = 0;
      deathTips(data, clockS);
    }
    if (inProgress && map.paused && !match.paused) {
      match.briefed = 0;
      buybackTip(p, hero, clockS);
      farmTip(p, clockS);
    }
    if (map.state === POST_GAME && !match.ended) {
      match.ended = true;
      match.briefed = 0;
      queue = [];
      summary(data);
    }
    match.alive = alive;
    match.paused = map.paused;

    const windowOpen = STATE_PAUSE_OK.has(map.state) || map.paused || (inProgress && !alive);
    quiet = inProgress && alive && !map.paused;
    if (quiet) queue = queue.filter((e) => e.category === "summary");
    flush(windowOpen);
  }

  function state() {
    const time = now();
    const connected = !!lastSeen && time - lastSeen < 40000;
    return {
      connected,
      lastSeen: lastSeen || null,
      map: match ? "Dota 2" : null,
      mode: null,
      side: null,
      quiet: quiet && connected,
      tip: current ? { ...current, age: time - current.at } : null,
      history: history.map((entry) => ({ ...entry, age: time - entry.at })),
    };
  }

  return { ingest, state };
}
