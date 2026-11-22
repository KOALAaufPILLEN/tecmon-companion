/**
 * Noch nicht ausgewertete Matches (Capability `recent-matches-v1`, Nutzerwunsch 22.11.2026).
 *
 * Der Companion kennt über das eigene, angemeldete Steam die letzten Matches des
 * Kontos (boiler-writter ohne Match-Angaben, nur Match-Infos, keine Demo). Die
 * Webseite holt diese Liste über die Bridge, lädt die Demos selbst (Browser-Add-on
 * oder `demo-fetch-v1`), wertet sie im Browser aus und lädt nur die Zahlen hoch.
 * Danach meldet sie die Match-IDs als erledigt.
 *
 * Wird CS2 geschlossen, fragt TecMon „Stats hochladen?“, sobald es offene Matches
 * gibt (abschaltbar, `ask` in `stats-backlog.json`). Erkannt wird das Schließen nur
 * über `tasklist` (Prozessliste), kein Zugriff auf den Spielprozess, keine GSI nötig.
 * Die Frage nimmt CS2 keinen Fokus; nach „Ja“ öffnet sich die TecMon-Seite.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";

export const BACKLOG_CAPABILITY = "recent-matches-v1";
/** So oft nachsehen, ob CS2 läuft (nur `tasklist`). */
export const POLL_MS = 20_000;
/** Nach dem Schließen warten, bis Steam die Verbindung zum CS2-Coordinator freigibt. */
export const CLOSE_DELAY_MS = 20_000;
/** boiler-writter höchstens so oft (Steam drosselt Abfragen beim Coordinator). */
export const REFRESH_MIN_MS = 5 * 60_000;
/** Valve löscht Demos nach einigen Wochen; ältere Matches werden nicht mehr angeboten. */
export const MAX_AGE_MS = 30 * 24 * 60 * 60_000;
/** Ein geschlossenes CS2 zählt nur so lange als Anlass für die Frage. */
const CLOSE_TTL_MS = 2 * 60 * 60_000;
export const MAX_MATCHES = 40;
export const MAX_DONE = 400;
const MATCH_ID = /^\d{1,24}$/;
const MAP = /^[a-z0-9_]{1,40}$/;
const CODE = /^CSGO(-[A-Za-z0-9]{5}){5}$/;
const REPLAY = /^http:\/\/replay\d{1,4}\.valve\.net\/730\/\d{1,24}_\d{1,24}\.dem\.bz2$/;

function cleanMatch(m) {
  if (!m || !MATCH_ID.test(String(m.matchId || ""))) return null;
  const time = Number(m.time) || 0;
  return {
    matchId: String(m.matchId),
    // boiler-writter liefert Sekunden, gespeichert wird in ms.
    time: time > 0 && time < 1e11 ? time * 1000 : time > 0 ? time : 0,
    shareCode: CODE.test(String(m.shareCode || "")) ? m.shareCode : "",
    link: REPLAY.test(String(m.link || "")) ? m.link : "",
    map: MAP.test(String(m.map || "")) ? m.map : "",
  };
}

export async function createStatsBacklog({
  dir,
  now = () => Date.now(),
  isRunning = async () => false,
  listMatches,
  openPage = () => {},
  busy = () => false,
  /** Andere Frage oder anderer boiler-writter-Lauf aktiv (Auto-Highlights). */
  blocked = () => false,
}) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, "stats-backlog.json");
  let ask = true;
  let done = new Set();
  let matches = [];
  let checkedAt = 0;
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    ask = saved.ask !== false;
    done = new Set((Array.isArray(saved.done) ? saved.done : []).filter((id) => MATCH_ID.test(String(id))).slice(-MAX_DONE));
    matches = (Array.isArray(saved.matches) ? saved.matches : []).map(cleanMatch).filter(Boolean).slice(0, MAX_MATCHES);
    checkedAt = Number(saved.checkedAt) || 0;
  } catch {
    /* nicht gespeichert = Frage an, noch keine Matches */
  }
  let error = "";
  let refreshing = null;
  let offer = null;
  let wasRunning = false;
  let closedAt = 0;
  let polledAt = 0;
  let polling = false;

  async function save() {
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, ask, done: [...done].slice(-MAX_DONE), matches, checkedAt }), { mode: 0o600 });
    await rename(temporary, file);
  }

  const fresh = (m) => !m.time || now() - m.time <= MAX_AGE_MS;
  /** Offen: nicht erledigt, noch nicht zu alt, mit Valve-Link oder Sharecode. */
  function open() {
    return matches.filter((m) => !done.has(m.matchId) && fresh(m) && (m.link || m.shareCode));
  }

  /** Liste neu bei Steam abfragen. `force` umgeht die Drosselung (Knopf auf der Webseite). */
  async function refresh({ force = false } = {}) {
    if (refreshing) return refreshing;
    if (!force && checkedAt && now() - checkedAt < REFRESH_MIN_MS) return list();
    if (force && checkedAt && now() - checkedAt < 30_000) return list();
    if (busy()) throw new Error("Auf deinem PC läuft gerade eine Aufnahme oder ein Download. Danach erneut versuchen.");
    if (blocked()) throw new Error("TecMon lädt gerade die Demo für dein Highlight-Video. Danach erneut versuchen.");
    if (await isRunning("cs2.exe")) throw new Error("Bitte CS2 schließen; Steam kann sonst keine Match-Infos abfragen.");
    refreshing = (async () => {
      try {
        const found = (await listMatches()).map(cleanMatch).filter(Boolean);
        const byId = new Map(matches.map((m) => [m.matchId, m]));
        for (const m of found) byId.set(m.matchId, { ...byId.get(m.matchId), ...m });
        matches = [...byId.values()].filter(fresh).sort((a, b) => b.time - a.time).slice(0, MAX_MATCHES);
        checkedAt = now();
        error = "";
        await save();
      } catch (e) {
        error = e?.message || "Steam konnte die letzten Matches nicht liefern.";
        checkedAt = now();
      } finally {
        refreshing = null;
      }
      return list();
    })();
    return refreshing;
  }

  /** Alle paar Sekunden: CS2 gerade geschlossen? Dann Liste holen und einmal fragen. */
  async function tick() {
    if (!ask || polling || offer) return;
    if (polledAt && now() - polledAt < POLL_MS && !closedAt) return;
    polling = true;
    polledAt = now();
    try {
      if (await isRunning("cs2.exe")) {
        wasRunning = true;
        closedAt = 0;
        return;
      }
      if (wasRunning) {
        wasRunning = false;
        closedAt = now();
      }
      if (!closedAt || now() - closedAt < CLOSE_DELAY_MS) return;
      if (now() - closedAt > CLOSE_TTL_MS) {
        closedAt = 0;
        return;
      }
      if (busy() || blocked()) return;
      closedAt = 0;
      await refresh({ force: true }).catch((e) => {
        error = e?.message || "Steam konnte die letzten Matches nicht liefern.";
      });
      const count = open().length;
      if (count) offer = { id: randomUUID(), count, at: now() };
    } finally {
      polling = false;
    }
  }

  async function answer(id, yes) {
    if (!offer || offer.id !== id) throw new Error("Diese Frage ist nicht mehr aktuell.");
    const count = offer.count;
    offer = null;
    if (!yes) return { message: "Alles klar. Die Matches bleiben auf tecmon.online unter „Meine Stats“ als offen markiert." };
    openPage();
    return { message: `TecMon wertet ${count === 1 ? "dein Match" : `${count} Matches`} im Browser aus und lädt die Stats hoch.` };
  }

  async function markDone(ids) {
    if (!Array.isArray(ids) || ids.length > 50) throw new Error("Ungültige Match-Liste.");
    let changed = false;
    for (const id of ids) {
      const value = String(id);
      if (!MATCH_ID.test(value)) throw new Error("Ungültige Match-ID.");
      if (!done.has(value)) {
        done.add(value);
        changed = true;
      }
    }
    if (changed) {
      done = new Set([...done].slice(-MAX_DONE));
      await save();
    }
    return { done: ids.length, open: open().length };
  }

  async function setAsk(value) {
    ask = value === true;
    if (!ask) {
      offer = null;
      closedAt = 0;
    }
    await save();
    return state();
  }

  /** CS2-Paket entfernt: eigene Datei löschen, alles auf Anfang. */
  async function reset() {
    ask = true;
    done = new Set();
    matches = [];
    checkedAt = 0;
    error = "";
    offer = null;
    closedAt = 0;
    wasRunning = false;
    await rm(file, { force: true });
  }

  /** Für die Webseite: nur Match-Infos, keine Pfade. */
  function list() {
    return {
      ask,
      checkedAt,
      error,
      refreshing: Boolean(refreshing),
      matches: matches.filter(fresh).map((m) => ({ ...m, done: done.has(m.matchId) })),
    };
  }

  function state() {
    return {
      ask,
      open: open().length,
      checkedAt,
      error,
      offer: offer ? { id: offer.id, count: offer.count } : null,
    };
  }

  return { tick, refresh, answer, markDone, setAsk, reset, list, state, get ask() { return ask; } };
}
