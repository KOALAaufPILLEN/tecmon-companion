/**
 * Bekannte Callouts auf den CS2-Radarbildern (1024 × 1024, Valve-Overview-Ausschnitt),
 * als Anteil von Breite und Höhe. Die Radarbilder selbst bringt CS Demo Manager mit;
 * der Companion liest sie nur lokal und verteilt sie nicht.
 *
 * kind: site = Bombenplatz, spawn = Spawn, spot = Callout.
 * T/CT: Spots, die für die jeweilige Seite in den meisten Runden wichtig sind.
 */
const p = (label, x, y, kind = "spot") => ({ label, x: x / 1024, y: y / 1024, kind });

export const MAP_SPOTS = {
  de_mirage: {
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
};
