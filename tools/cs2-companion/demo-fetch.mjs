/**
 * Demo-Download für die Webseite (`demo-fetch-v1`).
 *
 * Valve liefert Demos nur über http; eine https-Seite darf sie nicht direkt
 * laden. Ohne Companion oder Browser-Erweiterung gibt es keinen automatischen
 * Download über die Webseite. Mit Companion holt dieser PC die Demo selbst bei
 * Valve und gibt sie unverändert (.dem.bz2) an den Browser weiter. Nichts wird
 * gespeichert. Erlaubt sind nur Links auf Valves Replay-Server.
 */
import { Readable } from "node:stream";
import { REPLAY_URL } from "./valve-download.mjs";

export const DEMO_FETCH_CAPABILITY = "demo-fetch-v1";
/** Gepackte CS2-Demos liegen weit darunter; größere Antworten werden abgebrochen. */
export const MAX_FETCH_BYTES = 1024 * 1024 * 1024;
export const MAX_PARALLEL = 2;

export function createDemoFetch({ fetch = globalThis.fetch, max = MAX_PARALLEL, limit = MAX_FETCH_BYTES } = {}) {
  let running = 0;
  const fail = (res, status, error) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error }));
  };
  return {
    get running() {
      return running;
    },
    /** Streamt die Demo an `res`. Erledigt die Antwort immer selbst. */
    async send(res, value) {
      const url = String(value || "");
      if (!REPLAY_URL.test(url)) return fail(res, 400, "Nur Demo-Links von Valves Replay-Servern sind erlaubt.");
      if (running >= max) return fail(res, 429, "Es laufen schon Demo-Downloads. Bitte kurz warten.");
      running++;
      const abort = new AbortController();
      const stop = () => abort.abort();
      res.on("close", stop);
      try {
        let upstream;
        try {
          upstream = await fetch(url, { redirect: "error", signal: abort.signal });
        } catch {
          return fail(res, 502, "Valves Replay-Server ist nicht erreichbar.");
        }
        if (upstream.status === 404)
          return fail(res, 404, "Die Demo liegt nicht mehr bei Valve. Demos aus dem Match-Verlauf werden nach einigen Wochen gelöscht.");
        if (!upstream.ok || !upstream.body) return fail(res, 502, `Valves Replay-Server antwortet mit Fehler ${upstream.status}.`);
        const length = upstream.headers.get("content-length");
        if (length && (!/^\d+$/.test(length) || Number(length) > limit)) {
          abort.abort();
          return fail(res, 502, "Die Demo ist zu groß.");
        }
        const headers = { "Content-Type": "application/x-bzip2", "Cache-Control": "no-store" };
        if (length) headers["Content-Length"] = length;
        res.writeHead(200, headers);
        let seen = 0;
        const body = Readable.fromWeb(upstream.body);
        await new Promise((resolve) => {
          body.on("data", (chunk) => {
            seen += chunk.length;
            if (seen > limit) {
              abort.abort();
              body.destroy();
              res.destroy();
              return;
            }
            if (!res.write(chunk)) {
              body.pause();
              res.once("drain", () => body.resume());
            }
          });
          body.on("end", () => {
            res.end();
            resolve();
          });
          body.on("error", () => {
            res.destroy();
            resolve();
          });
          res.on("close", resolve);
        });
      } finally {
        res.off("close", stop);
        running--;
      }
    },
  };
}
