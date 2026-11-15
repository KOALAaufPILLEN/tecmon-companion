/**
 * Was der Companion gerade für ein Video tut, für die Sprechblase der Figur.
 * Nur Status und feste Texte; keine Pfade, Namen oder Protokollzeilen.
 */
const STEPS = {
  downloading: [1, "Ich lade gerade die Demo herunter …"],
  preparing: [2, "Ich bereite die Aufnahme vor und prüfe die TecMon-Visuals …"],
  analyzing: [2, "Ich lese die Demo ein und suche die Szenen …"],
  recording: [3, "Aktuell nehme ich die Szenen in CS2 auf. Bitte CS2 in Ruhe lassen …"],
  branding: [4, "Aktuell arbeite ich am Video-Branding, das dauert kurz …"],
  done: [5, "Fertig! Dein Video ist bereit, die Webseite übernimmt den Rest."],
  error: [0, "Da ist etwas schiefgegangen. Die Webseite zeigt dir, was los ist."],
};
const CAMERA = "CS2 ist offen: Setz deine Kamerapunkte, ich merke sie mir.";

/** Letzter Auftrag als `{ id, status, step, steps, text }` oder null. */
export function workState(jobs) {
  let last = null;
  for (const job of jobs.values()) last = job;
  if (!last) return null;
  const capture = Array.isArray(last.job?.sequences) && last.job.sequences.length > 0;
  if (last.status === "camera") return { id: last.id, status: "camera", step: 2, steps: 2, text: CAMERA };
  const known = STEPS[last.status];
  if (!known) return null;
  if (!capture) {
    // Nur Download (oder Kamera-Auftrag vor dem Start): ein Schritt.
    const text = last.status === "done" ? "Fertig! Die Demo ist heruntergeladen." : last.status === "error" ? known[1] : STEPS.downloading[1];
    return { id: last.id, status: last.status, step: last.status === "done" ? 1 : 0, steps: 1, text };
  }
  return { id: last.id, status: last.status, step: known[0], steps: 5, text: known[1] };
}
