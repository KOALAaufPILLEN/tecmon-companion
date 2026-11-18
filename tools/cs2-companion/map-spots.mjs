/**
 * Bekannte Callouts auf den CS2-Radarbildern (1024 × 1024, Valve-Overview-Ausschnitt),
 * als Anteil von Breite und Höhe. Die Radarbilder selbst kopiert der Companion nur aus
 * einem schon vorhandenen lokalen Ordner (radars.mjs) und verteilt sie nicht.
 *
 * kind: site = Bombenplatz, spawn = Spawn, spot = Callout.
 * radar: Overview-Werte der Karte (linke obere Ecke in Spieleinheiten, Einheiten pro Pixel),
 * dieselben wie im Replay der Webseite, um Spielkoordinaten auf das Radar zu legen.
 * T/CT: Spots, die für die jeweilige Seite in den meisten Runden wichtig sind.
 */
const p = (label, x, y, kind = "spot") => ({ label, x: x / 1024, y: y / 1024, kind });

export const MAP_SPOTS = {
  de_mirage: {
    radar: { minX: -3230, maxY: 1713, unitsPerPx: 5 },
    name: "Mirage",
    spots: [
      p("A", 555, 780, "site"),
      p("B", 232, 290, "site"),
      p("T", 900, 370, "spawn"),
      p("CT", 325, 710, "spawn"),
      p("Palace", 780, 775),
      p("A-Ramp", 790, 650),
      p("Jungle", 515, 650),
      p("Connector", 440, 565),
      p("Window", 470, 430),
      p("Top-Mid", 705, 470),
      p("Underpass", 445, 330),
      p("Short", 400, 500),
      p("Apartments", 500, 215),
      p("Market", 245, 440),
    ],
    T: ["Palace", "A-Ramp", "Top-Mid", "Apartments"],
    CT: ["Jungle", "Connector", "Window", "Market"],
  },
  de_dust2: {
    radar: { minX: -2476, maxY: 3239, unitsPerPx: 4.4 },
    name: "Dust II",
    spots: [
      p("A", 812, 172, "site"),
      p("B", 210, 130, "site"),
      p("T", 390, 915, "spawn"),
      p("CT", 595, 205, "spawn"),
      p("Long A", 880, 420),
      p("Long Doors", 710, 615),
      p("Pit", 945, 610),
      p("Outside Long", 690, 760),
      p("Short", 648, 360),
      p("Mid", 485, 520),
      p("Xbox", 492, 410),
      p("Mid Doors", 470, 340),
      p("Upper Tunnels", 160, 460),
      p("Lower Tunnels", 330, 395),
      p("B Doors", 262, 240),
    ],
    T: ["Long Doors", "Outside Long", "Mid", "Upper Tunnels"],
    CT: ["Long A", "Short", "Mid Doors", "B Doors"],
  },
  de_inferno: {
    radar: { minX: -2087, maxY: 3870, unitsPerPx: 4.9 },
    name: "Inferno",
    spots: [
      p("A", 830, 695, "site"),
      p("B", 497, 225, "site"),
      p("T", 100, 680, "spawn"),
      p("CT", 918, 360, "spawn"),
      p("Banana", 470, 470),
      p("Car", 580, 340),
      p("Mid", 655, 670),
      p("Apartments", 625, 880),
      p("Short", 715, 760),
      p("Pit", 905, 860),
      p("Library", 940, 730),
      p("Arch", 795, 500),
    ],
    T: ["Banana", "Apartments", "Mid", "Short"],
    CT: ["Car", "Arch", "Library", "Pit"],
  },
  de_ancient: {
    radar: { minX: -2953, maxY: 2164, unitsPerPx: 5 },
    name: "Ancient",
    spots: [
      p("A", 310, 265, "site"),
      p("B", 765, 420, "site"),
      p("T", 495, 885, "spawn"),
      p("CT", 518, 150, "spawn"),
      p("Mid", 490, 420),
      p("Donut", 310, 465),
      p("A Main", 220, 650),
      p("B Ramp", 810, 680),
      p("Cave", 650, 560),
    ],
    T: ["A Main", "Mid", "B Ramp"],
    CT: ["Donut", "Cave", "Mid"],
  },
  // Positionen aus den env_cs_place-/func_bomb_target-/Spawn-Entities der Karte (Update 17.11.2026),
  // umgerechnet mit der Overview (pos_x -3615, pos_y 2712, scale 4.724792). Der T-Spawn liegt
  // knapp außerhalb des gezeichneten Radars.
  de_cbble: {
    radar: { minX: -3615, maxY: 2712, unitsPerPx: 4.724792 },
    name: "Cobblestone",
    spots: [
      p("A", 193, 924, "site"),
      p("B", 803, 756, "site"),
      p("T", 606, 77, "spawn"),
      p("CT", 288, 897, "spawn"),
      p("Tower", 474, 41),
      p("Courtyard", 291, 232),
      p("Crypt", 559, 266),
      p("Side Hall", 447, 417),
      p("Stairs", 305, 478),
      p("Middle", 282, 531),
      p("Long A", 92, 569),
      p("A Ramp", 294, 696),
      p("Balcony", 381, 865),
      p("Connector", 494, 809),
      p("B Halls", 609, 493),
      p("B Main", 712, 610),
      p("B Platform", 891, 603),
      p("Drop", 594, 685),
      p("Back of B", 895, 869),
    ],
    T: ["Courtyard", "Long A", "B Halls", "Drop"],
    CT: ["A Ramp", "Connector", "Drop", "B Main"],
  },
};

/** Spielkoordinaten (x, y) als Anteil des 1024er-Radars, oder null außerhalb. */
export function radarPoint(radar, x, y) {
  const px = (Number(x) - radar.minX) / radar.unitsPerPx / 1024;
  const py = (radar.maxY - Number(y)) / radar.unitsPerPx / 1024;
  return Number.isFinite(px) && Number.isFinite(py) && px >= 0 && px <= 1 && py >= 0 && py <= 1
    ? { x: Math.round(px * 1000) / 1000, y: Math.round(py * 1000) / 1000 }
    : null;
}

/** Nächster Callout (keine Bombenplätze und Spawns) im Umkreis von etwa 90 Radarpixeln. */
export function nearestSpot(spots, point, radius = 0.09) {
  let best = null;
  let distance = radius;
  for (const spot of spots) {
    if (spot.kind !== "spot") continue;
    const d = Math.hypot(spot.x - point.x, spot.y - point.y);
    if (d <= distance) {
      best = spot;
      distance = d;
    }
  }
  return best;
}
