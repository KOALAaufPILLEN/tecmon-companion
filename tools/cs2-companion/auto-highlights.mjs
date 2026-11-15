/**
 * Automatisches Highlight-Video nach dem Match (Capability `auto-highlights-v1`).
 *
 * Standardmäßig aus. Eingeschaltet merkt sich der Companion aus den eigenen
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

export const AUTO_CAPABILITY = "auto-highlights-v1";
/** Nur Modi, zu denen Valve eine Demo bereitstellt. */
export const DEMO_MODES = new Set(["competitive", "scrimcomp2v2", "premier"]);
/** So lange ohne Spieldaten, dann wird geprüft, ob die Spiel-Exe noch läuft. */
export const QUIET_MS = 60_000;
/** Läuft die Exe noch (z. B. Hauptmenü), erst nach dieser Zeit wieder nachsehen. */
export const RECHECK_MS = 60_000;
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
}) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "auto-highlights.json");
  let enabled = false;
  try {
    enabled = JSON.parse(await readFile(file, "utf8")).enabled === true;
  } catch {
    /* nicht gespeichert = aus */
  }
  /** Zuletzt gesehenes Match aus GSI. */
  let match = null;
  let lastGsi = 0;
  let offer = null;
  let run = null;
  let checking = false;
  let checkedAt = 0;

  async function save() {
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, enabled }), { mode: 0o600 });
    await rename(temporary, file);
  }

  /** Nur eigene Werte aus der offiziellen GSI-Nachricht; sonst nichts. */
  function observe(payload) {
    if (!enabled) return;
    lastGsi = now();
    checkedAt = 0;
    const map = payload?.map;
    const steamId = String(payload?.provider?.steamid || "");
    if (!map || !MAP.test(String(map.name || "")) || !DEMO_MODES.has(map.mode) || !STEAM.test(steamId)) return;
    const phase = String(map.phase || "");
    if (!["live", "intermission", "gameover"].includes(phase)) return;
    const finished = phase === "gameover";
    if (!match || match.map !== map.name || (match.finished && !finished))
      match = { map: map.name, mode: map.mode, steamId, startedAt: lastGsi, finished };
    match.finished = finished;
    match.seenAt = lastGsi;
  }

  /** Alle paar Sekunden: Match vorbei und CS2 zu? Dann einmal fragen. */
  async function tick() {
    if (!enabled || checking || offer || (run && !["done", "error"].includes(run.status))) return;
    if (run?.status === "done" && now() - run.at > READY_TTL) await clear();
    if (!match?.finished || now() - lastGsi < QUIET_MS) return;
    if (now() - match.seenAt > OFFER_TTL) {
      match = null;
      return;
    }
    if (checkedAt && now() - checkedAt < RECHECK_MS) return;
    checking = true;
    checkedAt = now();
    try {
      if (await isRunning(GAME_EXES.cs2)) return;
      offer = { id: randomUUID(), map: match.map, mode: match.mode, steamId: match.steamId, startedAt: match.startedAt, at: now() };
      match = null;
      checkedAt = 0;
    } finally {
      checking = false;
    }
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
    const folder = path.join(directory, asked.id);
    run = { id: asked.id, map: asked.map, steamId: asked.steamId, status: "downloading", error: "", log: "", demo: "", directory: folder, at: now() };
    const current = run;
    void (async () => {
      try {
        const result = await fetchLatest({
          directory: folder,
          // Etwas Spielraum: die Matchzeit von Valve ist der Start des Matches.
          after: asked.startedAt - 30 * 60_000,
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
    };
  }

  return { observe, tick, answer, setEnabled, ready, demoPath, consume, state, get enabled() { return enabled; } };
}
