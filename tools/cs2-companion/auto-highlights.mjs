/**
 * Automatisches Highlight-Video nach dem Match (Capability `auto-highlights-v1`).
 *
 * Standardmäßig an (seit 0.48.5, mit CS2-Paket). Eingeschaltet merkt sich der Companion aus den eigenen
 * GSI-Daten nur: Map, Modus, eigene SteamID und ob das Match zu Ende gespielt
 * wurde. Kommen danach eine Minute lang keine GSI-Daten mehr und CS2 ist
 * geschlossen, fragt die Figur, ob ein Highlight-Video entstehen soll. Erst
 * nach „Ja“ holt der Companion über das eigene Steam die Demo des letzten
 * Matches und öffnet die TecMon-Seite, die Highlights auswählt, die Aufnahme
 * schickt und das Video hochlädt. Nichts davon greift ins laufende Spiel ein.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, rm, mkdir, stat } from "node:fs/promises";

/** Stand der Standardwerte, siehe DEFAULTS_VERSION in gsi-config.mjs. */
export const AUTO_DEFAULTS = 2;
export const AUTO_CAPABILITY = "auto-highlights-v1";
/** Nur Modi, zu denen Valve eine Demo bereitstellt. */
export const DEMO_MODES = new Set(["competitive", "scrimcomp2v2", "premier"]);
/** So lange ohne Spieldaten gilt das Spiel als beendet. */
export const QUIET_MS = 60_000;
/** So lange zurück im CS2-Hauptmenü (GSI ohne Map) nach Matchende, dann wird gefragt. */
export const MENU_MS = 10_000;
/** Nach „Ja“ bei offenem CS2: so oft nachsehen, ob die Exe beendet ist. */
export const RECHECK_MS = 15_000;
/**
 * Spiele, deren Ende der Companion an der beendeten Exe erkennt. Ein neues
 * Spiel braucht hier einen Eintrag; nur `tasklist`, kein Zugriff auf den Prozess.
 */
export const GAME_EXES = { cs2: "cs2.exe" };
/** Matches, die länger zurückliegen, werden nicht mehr angeboten. */
const OFFER_TTL = 6 * 60 * 60_000;
/** Bereitgestellte Demo bleibt so lange für die Webseite abrufbar. */
const READY_TTL = 24 * 60 * 60_000;
const MAP = /^[a-z0-9_]{1,40}$/;
const STEAM = /^\d{17}$/;

export async function createAutoHighlights({
  dir,
  now = () => Date.now(),
  isRunning = async () => false,
  fetchLatest,
  openPage = () => {},
  busy = () => false,
  defaultEnabled = false,
}) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "auto-highlights.json");
  /* Seit 23.11.2026 standardmäßig an (Nutzerentscheid: in CS2 alles an außer Fadenkreuz-Overlay).
     Dateien ohne neuen Standard-Stand (`defaults`) bekommen ihn einmal, danach gilt die eigene Wahl. */
  let enabled = defaultEnabled;
  let migrate = defaultEnabled;
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    const current = saved?.defaults === AUTO_DEFAULTS;
    enabled = current || !defaultEnabled ? saved?.enabled === true : true;
    migrate = defaultEnabled && !current;
  } catch {
    /* nicht gespeichert = Standard */
  }
  /** Zuletzt gesehenes Match aus GSI. */
  let match = null;
  let lastGsi = 0;
  let offer = null;
  let run = null;
  let checking = false;
  let checkedAt = 0;
  /** Seit wann GSI ohne Map kommt (Hauptmenü), 0 = im Match. */
  let menuSince = 0;
  /** Nur zur Anzeige: was zuletzt aus CS2 ankam (Map, Modus, Phase). */
  let seen = null;

  async function save() {
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, defaults: AUTO_DEFAULTS, enabled }), { mode: 0o600 });
    await rename(temporary, file);
  }
  if (migrate) await save().catch(() => {});

  /** Nur eigene Werte aus der offiziellen GSI-Nachricht; sonst nichts. */
  function observe(payload) {
    if (!enabled) return;
    lastGsi = now();
    const map = payload?.map;
    const steamId = String(payload?.provider?.steamid || "");
    if (!map?.name) {
      if (!menuSince) menuSince = lastGsi;
      seen = { map: "", mode: "", phase: "menu" };
      return;
    }
    menuSince = 0;
    const phase = String(map.phase || "");
    seen = {
      map: MAP.test(String(map.name)) ? map.name : "",
      mode: /^[a-z0-9_]{1,30}$/.test(String(map.mode || "")) ? map.mode : "",
      phase: /^[a-z]{1,20}$/.test(phase) ? phase : "",
    };
    if (!MAP.test(String(map.name || "")) || !DEMO_MODES.has(map.mode) || !STEAM.test(steamId)) return;
    if (!["live", "intermission", "gameover"].includes(phase)) return;
    const finished = phase === "gameover";
    if (!match || match.map !== map.name || (match.finished && !finished))
      match = { map: map.name, mode: map.mode, steamId, startedAt: lastGsi, finished };
    match.finished = finished;
    match.seenAt = lastGsi;
  }

  /**
   * Alle paar Sekunden: Match fertig und zurück im Hauptmenü (oder keine
   * Spieldaten mehr)? Dann einmal fragen. Die Frage nimmt CS2 keinen Fokus;
   * geladen wird erst, wenn die Spiel-Exe beendet ist.
   */
  async function tick() {
    if (!enabled || checking) return;
    if (run?.status === "waiting") return waitForGame();
    if (offer || (run && !["done", "error"].includes(run.status))) return;
    if (run?.status === "done" && now() - run.at > READY_TTL) await clear();
    if (!match?.finished) return;
    const inMenu = menuSince && now() - menuSince >= MENU_MS;
    if (!inMenu && now() - lastGsi < QUIET_MS) return;
    if (now() - match.seenAt > OFFER_TTL) {
      match = null;
      return;
    }
    offer = { id: randomUUID(), map: match.map, mode: match.mode, steamId: match.steamId, startedAt: match.startedAt, at: now() };
    match = null;
  }

  /** Steam kann die Match-Infos nur ohne laufendes CS2 abfragen: bis dahin warten. */
  async function waitForGame() {
    if (checkedAt && now() - checkedAt < RECHECK_MS) return;
    checking = true;
    checkedAt = now();
    try {
      if (await isRunning(GAME_EXES.cs2)) return;
      if (busy()) {
        run.status = "error";
        run.error = "Auf deinem PC läuft bereits eine Aufnahme oder ein Download.";
        return;
      }
      checkedAt = 0;
      download(run);
    } finally {
      checking = false;
    }
  }

  function download(current) {
    current.status = "downloading";
    void (async () => {
      try {
        const result = await fetchLatest({
          directory: current.directory,
          // Etwas Spielraum: die Matchzeit von Valve ist der Start des Matches.
          after: current.startedAt - 30 * 60_000,
          log: (message) => {
            current.log += `\n${message}`;
          },
        });
        current.demo = result.demo;
        current.matchId = result.matchId;
        current.size = (await stat(result.demo)).size;
        current.status = "ready";
        current.at = now();
        openPage(current.id);
      } catch (error) {
        current.status = "error";
        current.error = error.message || "Demo konnte nicht geladen werden.";
      }
    })();
  }

  async function clear() {
    if (run?.directory) await rm(run.directory, { recursive: true, force: true }).catch(() => {});
    run = null;
  }

  async function answer(id, yes, directory) {
    if (!offer || offer.id !== id) throw new Error("Diese Frage ist nicht mehr aktuell.");
    const asked = offer;
    offer = null;
    if (!yes) return { message: "Alles klar, diesmal kein Video." };
    if (busy()) throw new Error("Auf deinem PC läuft bereits eine Aufnahme oder ein Download.");
    await clear();
    run = {
      id: asked.id,
      map: asked.map,
      steamId: asked.steamId,
      startedAt: asked.startedAt,
      status: "waiting",
      error: "",
      log: "",
      demo: "",
      directory: path.join(directory, asked.id),
      at: now(),
    };
    checkedAt = 0;
    if (await isRunning(GAME_EXES.cs2))
      return { message: "Alles klar. Sobald du CS2 schließt, lädt TecMon die Demo und erstellt das Video." };
    download(run);
    return { message: "Demo deines letzten Matches wird geladen. Danach öffnet sich die TecMon-Seite." };
  }

  async function setEnabled(value) {
    enabled = value === true;
    if (!enabled) {
      match = null;
      offer = null;
    }
    await save();
    return state();
  }

  /** Die Webseite fragt die bereitgestellte Demo ab; nur die eigene SteamID, keine Pfade. */
  function ready(id) {
    if (!run || run.id !== id) return null;
    return { id: run.id, status: run.status, map: run.map, steamId: run.steamId, size: run.size || 0, error: run.status === "error" ? run.error : undefined };
  }
  function demoPath(id) {
    return run && run.id === id && run.status === "ready" ? run.demo : "";
  }
  /** Aufnahme gestartet: die Demo gehört jetzt zum Auftrag. */
  function consume(id) {
    const demo = demoPath(id);
    if (!demo) throw new Error("Die Demo vom Companion ist nicht mehr vorhanden.");
    run.status = "done";
    run.at = now();
    return demo;
  }

  function state() {
    return {
      enabled,
      offer: offer ? { id: offer.id, map: offer.map } : null,
      run: run ? { id: run.id, map: run.map, status: run.status, error: run.error } : null,
      // Zur Fehlersuche auf der Companion-Seite: kommt überhaupt etwas aus CS2 an?
      gsiAgo: lastGsi ? Math.round((now() - lastGsi) / 1000) : null,
      seen: seen ? { ...seen, demo: DEMO_MODES.has(seen.mode) } : null,
      match: match ? { map: match.map, finished: match.finished } : null,
    };
  }

  return { observe, tick, answer, setEnabled, ready, demoPath, consume, state, get enabled() { return enabled; } };
}
