/**
 * TecMon-Kameraskript für HLAE (mirv-script, ab HLAE 2.190).
 *
 * HLAE lädt das Skript mit `mirv_script_load` in CS2, nur bei der
 * Offline-Demo-Wiedergabe (`-insecure`), nie im Live-Match. Es setzt in jedem
 * Bild die Kamera (`mirv.events.cViewRenderSetupView`) für Kamerafahrten über
 * mehrere Punkte und für die Verfolger-Kamera hinter einem Spieler. Dazu kommt
 * der Konsolenbefehl `tecmon_mark`, der die aktuelle Kamera als Punkt in die
 * Konsole schreibt; der Companion liest ihn aus `console.log` (`-condebug`).
 *
 * Der Plan enthält nur Zahlen aus dem geprüften Auftrag (job.mjs), nie Text
 * der Webseite.
 */
import { scriptedCut } from "./job.mjs";

export const SCRIPT_CAPABILITY = "camera-script-v1";
export const SESSION_CAPABILITY = "camera-session-v1";
export const MARK_COMMAND = "tecmon_mark";
export const MAX_MARKS = 24;
const COORD = 65536;

/** Kamera-Abschnitte des Auftrags in der Reihenfolge der Szenen. */
export function scriptPlan(job) {
  const segments = [];
  for (const s of job.sequences) {
    const cuts = s.cuts || [];
    cuts.forEach((c, i) => {
      if (!scriptedCut(c)) return;
      const to = i + 1 < cuts.length ? cuts[i + 1].tick : s.endTick;
      if (c.kind === "path")
        segments.push({
          from: c.tick,
          to,
          kind: "path",
          keys: c.keys.map((k) => [k.tick, k.x, k.y, k.z, k.pitch, k.yaw]),
        });
      else {
        if (!Number.isSafeInteger(s.slot)) throw new Error("Spieler-Slot fehlt für die Verfolger-Kamera.");
        segments.push({ from: c.tick, to, kind: "follow", slot: s.slot, distance: c.distance, height: c.height, orbit: c.orbit });
      }
    });
  }
  return { v: 1, tickRate: job.tickRate, segments };
}

/** Nur Zahlen und feste Schlüssel; alles andere bricht ab. */
function checkPlan(plan) {
  const ok = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 100_000_000;
  if (!plan || plan.v !== 1 || !ok(plan.tickRate) || !Array.isArray(plan.segments)) throw new Error("Ungültiger Kameraplan.");
  for (const s of plan.segments) {
    if (!ok(s.from) || !ok(s.to) || s.to <= s.from) throw new Error("Ungültiger Kameraplan.");
    if (s.kind === "path") {
      if (!Array.isArray(s.keys) || s.keys.some((k) => !Array.isArray(k) || k.length !== 6 || !k.every(ok)))
        throw new Error("Ungültiger Kameraplan.");
    } else if (s.kind !== "follow" || ![s.slot, s.distance, s.height, s.orbit].every(ok))
      throw new Error("Ungültiger Kameraplan.");
  }
}

/** Fertiger Skripttext: Plan als JSON-Zahlen plus der feste Programmteil. */
export function scriptSource(plan) {
  checkPlan(plan);
  return `var TECMON_PLAN = ${JSON.stringify(plan)};\n${RUNTIME}`;
}

/** Punkte, die `tecmon_mark` in die Konsole geschrieben hat. */
export function parseMarks(text) {
  const marks = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = /TECMON_MARK (\{[^{}]{1,400}\})\s*$/.exec(line);
    if (!m) continue;
    let v;
    try {
      v = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const num = (n, max) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max;
    if (![v.x, v.y, v.z].every((n) => num(n, COORD)) || !num(v.pitch, 360) || !num(v.yaw, 100000)) continue;
    let yaw = ((v.yaw % 360) + 360) % 360;
    if (yaw > 180) yaw -= 360;
    const r = (n) => Math.round(n * 100) / 100 + 0;
    marks.push({
      tick: Number.isSafeInteger(v.tick) && v.tick >= 0 ? v.tick : null,
      x: r(v.x),
      y: r(v.y),
      z: r(v.z),
      pitch: r(Math.max(-89, Math.min(89, v.pitch))),
      yaw: r(yaw),
    });
  }
  return marks.slice(-MAX_MARKS);
}

/*
 * Programmteil, läuft in HLAE (JavaScript-Engine von AfxHookSource2).
 * Bewusst einfaches JavaScript ohne Module. rX = Pitch, rY = Yaw, rZ = Roll.
 */
export const RUNTIME = String.raw`(function () {
  var ID = "tecmon/camera";
  var plan = TECMON_PLAN;
  var g = globalThis;
  if (g[ID]) {
    try { g[ID].stop(); } catch (e) {}
  }
  var DEG = Math.PI / 180;
  var lastTick = -1;
  var lastTime = 0;
  var shown = null;
  var followYaw = null;

  // Bruchteil-Tick aus Demo-Tick und Demo-Zeit, damit Fahrten in jedem Bild weich laufen.
  function nowTick() {
    var t = mirv.getDemoTick();
    if (t === undefined || t === null) return undefined;
    var time = mirv.getDemoTime();
    if (time === undefined || time === null) return t;
    if (t !== lastTick) { lastTick = t; lastTime = time; }
    return Math.min(t + 1, t + Math.max(0, time - lastTime) * plan.tickRate);
  }
  function segmentAt(t) {
    for (var i = 0; i < plan.segments.length; i++) {
      var s = plan.segments[i];
      if (t >= s.from && t < s.to) return s;
    }
    return null;
  }
  function angle(a, b, u) {
    var d = ((((b - a) % 360) + 540) % 360) - 180;
    return a + d * u;
  }
  function spline(p0, p1, p2, p3, u) {
    var u2 = u * u, u3 = u2 * u;
    return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (3 * p1 - p0 - 3 * p2 + p3) * u3);
  }
  function ease(u) { return u * u * (3 - 2 * u); }
  function view(k) { return { x: k[1], y: k[2], z: k[3], rX: k[4], rY: k[5], rZ: 0 }; }
  function pathView(s, t) {
    var k = s.keys, n = k.length;
    if (t <= k[0][0]) return view(k[0]);
    if (t >= k[n - 1][0]) return view(k[n - 1]);
    var i = 0;
    while (i < n - 2 && t >= k[i + 1][0]) i++;
    var a = k[Math.max(0, i - 1)], b = k[i], c = k[i + 1], d = k[Math.min(n - 1, i + 2)];
    var u = (t - b[0]) / (c[0] - b[0]);
    var e = ease(u);
    return {
      x: spline(a[1], b[1], c[1], d[1], u),
      y: spline(a[2], b[2], c[2], d[2], u),
      z: spline(a[3], b[3], c[3], d[3], u),
      rX: b[4] + (c[4] - b[4]) * e,
      rY: angle(b[5], c[5], e),
      rZ: 0
    };
  }
  function pawnOf(slot) {
    var controller = mirv.getEntityFromIndex(slot);
    if (!controller) return null;
    var handle = controller.getPlayerPawnHandle();
    if (!mirv.isHandleValid(handle)) return null;
    return mirv.getEntityFromIndex(mirv.getHandleEntryIndex(handle));
  }
  function followView(s, t) {
    var pawn = pawnOf(s.slot);
    if (!pawn) return undefined;
    var eye = pawn.getRenderEyeOrigin();
    var look = pawn.getRenderEyeAngles();
    var target = look[1] + (s.orbit * (t - s.from)) / plan.tickRate;
    // Blick des Spielers gedämpft folgen, damit die Kamera nicht mit jedem Mauszucken springt.
    followYaw = followYaw === null ? target : angle(followYaw, target, 0.12);
    var r = followYaw * DEG;
    var x = eye[0] - Math.cos(r) * s.distance;
    var y = eye[1] - Math.sin(r) * s.distance;
    var z = eye[2] + s.height;
    var dx = eye[0] - x, dy = eye[1] - y, dz = eye[2] - z;
    return {
      x: x, y: y, z: z,
      rX: -Math.atan2(dz, Math.sqrt(dx * dx + dy * dy)) / DEG,
      rY: Math.atan2(dy, dx) / DEG,
      rZ: 0
    };
  }
  mirv.events.cViewRenderSetupView.on(ID, function (e) {
    var result;
    if (mirv.isPlayingDemo()) {
      var t = nowTick();
      var s = t === undefined ? null : segmentAt(t);
      if (!s || s.kind !== "follow") followYaw = null;
      if (s) result = s.kind === "path" ? pathView(s, t) : followView(s, t);
    }
    var v = result || e.currentView;
    shown = { x: v.x, y: v.y, z: v.z, pitch: v.rX, yaw: v.rY };
    return result;
  });
  var command = new AdvancedfxConCommand(function () {
    if (!shown) {
      mirv.warning("TecMon: noch kein Bild gerendert.\n");
      return;
    }
    var tick = mirv.getDemoTick();
    mirv.message(
      "TECMON_MARK " +
        JSON.stringify({ tick: tick === undefined ? null : tick, x: shown.x, y: shown.y, z: shown.z, pitch: shown.pitch, yaw: shown.yaw }) +
        "\n"
    );
    mirv.message("TecMon: Kamerapunkt gemerkt.\n");
  });
  command.register("${MARK_COMMAND}", "TecMon: aktuelle Kamera als Punkt merken");
  g[ID] = {
    stop: function () {
      mirv.events.cViewRenderSetupView.off(ID);
      command.unregister();
    }
  };
})();
`;
