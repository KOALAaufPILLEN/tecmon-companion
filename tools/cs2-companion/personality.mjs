import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { MAP_SPOTS } from "./map-spots.mjs";

/**
 * TecMons Persönlichkeit, Werte und Interaktionen. Alles bleibt lokal (pet.json).
 * Die Modi färben die Ansprache vor jedem Tipp sowie alle Interaktionen und spontanen Sprüche.
 * Der HUAN-Modus (ab 18, mit Bestätigung) liefert derben Trashtalk über das eigene Spiel: Aim, Waffenwahl, Quiz-Wissen und Spielweise. Flüche sind erlaubt, Beleidigungen von Personen oder Gruppen nicht.
 */
export const MODES = [
  { id: "nett", label: "Super nett", short: "Nett" },
  { id: "normal", label: "Normal", short: "Normal" },
  { id: "nerdy", label: "Nerdy", short: "Nerdy" },
  { id: "huan", label: "HUAN-Modus (18+)", short: "HUAN 18+" },
];
const MODE_IDS = new Set(MODES.map((m) => m.id));

/* Waffenspezifische Sprüche beim Kauf in der Freezetime (erkannt am Präfix des Waffentipps). */
export const WEAPON_OPENERS = {
  awp: {
    nett: [
      "Uiii, die große Sniper! Du triffst heute bestimmt jeden Flick:",
      "Mit der AWP hältst du deinem Team den Rücken frei, viel Erfolg:",
    ],
    nerdy: [
      "One-Shot-Kill-Potenzial bei 4.750 $ Investitionsvolumen:",
      "Ballistische Langstrecken-Plattform aktiv – Positionsdisziplin wahren:",
    ],
    huan: [
      "4.750 $ für 'ne AWP ausgegeben, nur um gleich nach 12 Sekunden den Boden in Mid zu küssen?!",
      "Leg die verdammte AWP weg, das hier ist kein s1mple-Highlight, das ist teures Kanonenfutter!",
      "Schön 4.750 $ für das Gegnerteam gesponsert! Wirf sie denen doch gleich direkt in den Spawn:",
      "Mit diesem Flick triffst du mit der AWP nicht mal 'nen geparkten Bus auf Long:",
    ],
  },
  deagle: {
    nett: [
      "Oha, die Desert Eagle! Ein sauberer Schuss reicht schon:",
      "Ich glaub an deine Juan-Deags! Bleib ganz ruhig am Abzug:",
    ],
    nerdy: [
      "Hohe Reset-Zeit der Streuung nach Schussabgabe beachten:",
      "700 $ Investment mit maximalem Kopfschuss-Hebel:",
    ],
    huan: [
      "Oh nein, der Herr hält sich wieder für 'nen Deagle-Gott und ballert gleich 7 Fahrkarten in die Luft!",
      "700 $ für 'ne Deagle verbrannt, nur um am Ende in Panik auf den Bauch zu spammen wie der letzte Silber-Bot:",
      "Deine sogenannten 'Juan-Deags' landen zu 99 % in der verfickten Decke:",
      "Hör auf mit der Deagle rumzufuchteln, du triffst ja nicht mal stehende AFK-Gegner im ersten Schuss:",
    ],
  },
  sg553: {
    nett: [
      "Die SG 553! Mit dem Visier hast du alles super im Blick:",
      "Starke Wahl mit der Krieg – besonders auf Distanz richtig fies:",
    ],
    nerdy: [
      "100 % Rüstungsdurchschlag und 1,5-fache optische Vergrößerung:",
      "Diagonales Rückstoßmuster nach unten rechts kompensieren:",
    ],
    huan: [
      "SG 553 gekauft?! Brauchst du 'ne verfickte Lupe, weil dein Aim ohne Zoom komplett im Arsch ist?!",
      "Schön die CoD-Knarre mit Zielfernrohr ausgepackt, weil's für 'ne richtige AK-47 vom Skill her nicht reicht, wa?!",
      "Mit dem Scope der SG 553 siehst du wenigstens in Ultra-HD, wie dich der Gegner zuerst trifft:",
      "SG 553 in der Hand – sag mir, dass du kein AK-Spraypattern kannst, ohne mir zu sagen, dass du's nicht kannst:",
    ],
  },
  aug: {
    nett: [
      "Mit der AUG stehst du als CT richtig stabil:",
    ],
    nerdy: [
      "Zielfernrohr-gestützte CT-Verteidigungswaffe aktiv:",
    ],
    huan: [
      "AUG mit Visier gekauft – Zielhilfe mit Zoom, und trotzdem geht's daneben, wetten?",
      "Selbst mit Zoom sprayst du mit der AUG noch am Gegner vorbei, ganz sicher:",
    ],
  },
  p90: {
    nett: [
      "P90-Power! Viele Kugeln und richtig viel Tempo!",
      "Mit der P90 überraschst du sie im Nahkampf bestimmt:",
    ],
    nerdy: [
      "50 Schuss Magazinkapazität bei 857 Schuss pro Minute – ideal für Nahdistanz-Durchbrüche:",
    ],
    huan: [
      "P90 gekauft?! Dein Ernst?! Einfach Augen zu, W gedrückt halten und beten, oder was?!",
      "Die offizielle Knarre für 0,0 % Aim und 100 % Panik im Zeigefinger! Schämst du dich gar nicht?!",
      "50 Schuss in der P90, damit selbst nach deinen ersten 45 kompletten Fehlschüssen vielleicht noch einer aus Versehen trifft:",
      "Rush B mit P90 – spielst du Counter-Strike oder Autoscooter auf Silber 1?!",
    ],
  },
  ak47: {
    nett: [
      "Der Klassiker! Mit der AK-47 sitzt der erste Schuss perfekt:",
    ],
    nerdy: [
      "Primärwaffe AK-47 erkannt – vertikaler Initialrückstoß über 9 Schuss:",
    ],
    huan: [
      "Die AK-47 hat Besseres verdient – der erste Schuss geht bei dir eh in die Wolken:",
      "Versuch mit der AK wenigstens einmal stehenzubleiben vorm Schießen, statt rumzuzappeln:",
    ],
  },
  m4: {
    nett: [
      "Mit der M4 hältst du deinen Bombenplatz bestimmt sauber!",
    ],
    nerdy: [
      "CT-Standardgewehr aktiv – kontrollierte Feuerstöße maximieren die Trefferquote:",
    ],
    huan: [
      "98 in 4 incoming! Den Kopf kennst du ja eh nur vom Hörensagen:",
      "Mal schauen, wie schnell du die M4 diesmal an die Ts verschenkst:",
    ],
  },
  smg: {
    nett: [
      "Flotte SMG! Perfekt, um ordentlich Geld für das Team zu sammeln:",
    ],
    nerdy: [
      "Hoher Kill-Reward (600 $) und geringe Bewegungs-Ungenauigkeit:",
    ],
    huan: [
      "Wieder wild um die Ecke hüpfen und hoffen, dass die SMG das regelt, wa?!",
    ],
  },
  lmg: {
    nett: [
      "Ui, ganz schweres Geschütz! Da traut sich keiner durch die Smoke:",
    ],
    nerdy: [
      "Unterdrückungsfeuer-Plattform mit extremem Munitionsvorrat:",
    ],
    huan: [
      "Willst du gerade die ganze Map tapezieren oder warum kaufst du dir diese komplett absurde Bleispritze?!",
      "150 Schuss im Magazin und trotzdem wird's wieder kein einziger Kill:",
    ],
  },
};

function detectWeaponKey(text) {
  const t = String(text || "");
  if (t.startsWith("AWP:") || t.startsWith("SSG 08:")) return "awp";
  if (t.startsWith("Desert Eagle:")) return "deagle";
  if (t.startsWith("SG 553:")) return "sg553";
  if (t.startsWith("AUG:")) return "aug";
  if (t.startsWith("P90:") || t.startsWith("PP-Bizon:")) return "p90";
  if (t.startsWith("AK-47:") || t.startsWith("Galil AR:")) return "ak47";
  if (t.startsWith("M4A4:") || t.startsWith("M4A1-S:") || t.startsWith("FAMAS:")) return "m4";
  if (/^(MP9|MAC-10|MP7|MP5-SD|UMP-45):/.test(t)) return "smg";
  if (/^(Negev|M249):/.test(t)) return "lmg";
  return "";
}

/* Ansprache vor einem Tipp, für ALLE CS2- und Dota-2-Kategorien. */
const OPENERS = {
  nett: {
    death: [
      "Kein Ding, das passiert den Besten.",
      "Kopf hoch, nächste Runde gehört dir!",
      "Du machst das super, nur ein kleiner Hinweis fürs nächste Mal:",
      "Ach schade, fast hattest du ihn! Kleiner Tipp:",
      "Nicht ärgern lassen, wir holen uns die nächste Runde:",
    ],
    economy: [
      "Kleiner Finanz-Tipp mit Herz:",
      "Ich hab mal lieb auf dein Konto geschaut:",
      "Damit wir gleich wieder voll einkaufen können:",
      "Schatz-Berater TecMon sagt:",
    ],
    buy: [
      "Warte kurz, bevor du losläufst, Liebling:",
      "Ich pass auf dich auf – schau mal kurz ins Kaufmenü:",
      "Kleiner Ausrüstungs-Check für dich:",
    ],
    weapon: [
      "Gute Waffenwahl! Kleiner Tipp dazu:",
      "Damit du mit dem guten Stück noch besser triffst:",
      "Ich halt dir die Daumen – denk beim Schießen hieran:",
    ],
    map: [
      "Schöne Map! Hier unser kleiner Spielplan:",
      "Auf geht's! Das hier hilft uns auf dieser Seite:",
      "Zusammen packen wir die Hälfte locker:",
    ],
    history: [
      "Ich hab mir deine letzten Matches angeschaut, um dir zu helfen:",
      "Aus deinen bisherigen Runden hab ich was Spannendes entdeckt:",
      "Kleiner Geheimtipp aus deiner eigenen Statistik:",
    ],
    team: [
      "Ihr schafft das als Team! Schau mal:",
      "Gemeinsam seid ihr stark – kleiner Hinweis zur Lage:",
      "Kurzer Blick aufs große Ganze:",
    ],
    habit: [
      "Mir ist da eine winzige Kleinigkeit aufgefallen, nur lieb gemeint:",
      "Du spielst toll, aber hier kannst du noch ein paar Prozent rausholen:",
      "Ein kleiner Gewohnheits-Stupser von deinem Buddy:",
    ],
    mindset: [
      "Atme kurz tief durch, du schaffst das!",
      "Ich glaub fest an dich – lass dich nicht unterkriegen:",
      "Mach dir keinen Druck, du hast das drauf:",
    ],
    praise: [
      "Wow, ich bin so stolz auf dich!",
      "Das war richtig, richtig stark von dir!",
      "Gänsehaut! Du spielst heute wie ein Profi!",
      "Mega! Genau so macht man das!",
    ],
    summary: [
      "Danke fürs gemeinsame Zocken! Hier deine Bilanz:",
      "Du hast alles gegeben! Schau mal auf deine Runde:",
      "Egal wie es ausging, ich bin gern dein Companion:",
    ],
    warmup: [
      "Mach dich ganz entspannt warm, wir rocken das gleich!",
      "Viel Spaß im Match! Ich drück dir alle Daumen:",
    ],
    farm: [
      "Du sammelst fleißig! Kleiner Blick auf deinen Farm:",
      "Schritt für Schritt zum starken Build:",
    ],
    buyback: [
      "Nur zur Sicherheit für später, mein Guter:",
      "Pass gut auf dein Gold auf:",
    ],
    actives: [
      "Kleiner Hinweis zu deinen tollen Items:",
      "Beim nächsten Kampf denkst du bestimmt dran:",
    ],
    gold: [
      "Du hattest so schön viel Gold gespart:",
      "Kleiner Tipp für deinen Goldbeutel:",
    ],
    default: [
      "Hey, nur ganz lieb gemeint:",
      "Darf ich dir kurz was flüstern?",
      "Dein kleiner Robo-Buddy meint:",
    ],
  },
  /* Normal bleibt neutral: der Tipp kommt ohne Einstieg. */
  normal: { default: [""] },
  nerdy: {
    death: [
      "Statistisch gesehen war dieses Ableben zu 94,2 % vermeidbar.",
      "Post-Mortem-Telemetrie abgeschlossen:",
      "Interessanter Datenpunkt für die Fehleranalyse:",
      "Suboptimales Überlebens-Outcome detektiert:",
    ],
    economy: [
      "Rechnen wir das kurz spieltheoretisch durch:",
      "Ökonomischer Erwartungswert-Check:",
      "Finanz-Algorithmus meldet:",
    ],
    buy: [
      "Inventar-Audit vor Ablauf der Freezetime:",
      "Ressourcen-Allokation ist unvollständig:",
      "Suboptimales Loadout erkannt:",
    ],
    weapon: [
      "Laut Rückstoß-Tabelle:",
      "Waffen-Telemetrie und Vektor-Analyse:",
      "Mechanischer Hinweis zum Spray-Pattern:",
    ],
    map: [
      "Topologische Kartenanalyse für diese Hälfte:",
      "Taktische Positions-Heuristik:",
      "Statistische Hotspot-Verteilung:",
    ],
    history: [
      "Auswertung deiner historischen Match-Datenbank:",
      "Mustererkennung über deine letzten Demos zeigt:",
      "Empirischer Befund aus deinen Stats:",
    ],
    team: [
      "Momentum-Vektor und Runden-Trendanalyse:",
      "Wahrscheinlichkeitsrechnung zum Spielverlauf:",
    ],
    habit: [
      "Wiederkehrende Verhaltens-Anomalie im Gameplay erkannt:",
      "Mikro-Mechanik-Optimierungspotenzial:",
      "Muster-Korrektur erforderlich:",
    ],
    mindset: [
      "Kognitive Leistungskurve fällt ab – Kortisol-Reset empfohlen:",
      "Psychometrischer Hinweis zur Fehlerminimierung:",
    ],
    praise: [
      "Signifikant über deinem historischen Durchschnitt!",
      "Positive Standardabweichung um +2,4 Sigma detektiert!",
      "Herausragende Effizienzwerte in diesem Durchgang:",
    ],
    summary: [
      "Aggregierte Leistungsmetriken liegen vor:",
      "Statistischer Abschlussbericht:",
    ],
    warmup: [
      "Kalibrierungsphase für neuromuskuläre Zielerfassung:",
    ],
    farm: [
      "Gold- und Creep-Effizienz-Metrik:",
    ],
    buyback: [
      "Liquiditäts-Reserve-Kalkulation:",
    ],
    actives: [
      "Abklingzeiten-Nutzungsgrad suboptimal:",
    ],
    gold: [
      "Totes Kapital zum Zeitpunkt des Ablebens:",
    ],
    default: [
      "Laut meinen Berechnungen:",
      "Kleine algorithmische Optimierung:",
      "Datenbasierter Hinweis:",
    ],
  },
  huan: {
    death: [
      "Schon wieder tot? Respekt, das ist echt eine Kunstform im Reinscheißen.",
      "Digga, spielst du mit Lenkrad oder warum legst du dich jede Runde freiwillig schlafen?",
      "Boah, war das räudig gespielt. Der Gegner hat sich beim Einsammeln fast totgelacht.",
      "Du spielst gerade Geldautomat fürs Gegnerteam. Hier, lies und schäm dich:",
      "Alter, so gottlos blind wie du gerade reingepeekt hast, peekt nicht mal ein Trainings-Bot:",
      "Hast du deinen Monitor aus oder wolltest du einfach schnell wieder im Spectator-Modus chillen?",
      "Gratulation, noch ein Gratis-Kill für die Gegner. Willst du denen nicht gleich deine Maus schenken?",
    ],
    economy: [
      "Hör mal zu, Pleite-König:",
      "Geldverwaltung wie am Kaugummiautomaten, echt jetzt:",
      "Was soll dieser Kontostand, Finanzgenie?",
      "Bevor du wieder kompletten Müll zusammenkaufst, denk kurz nach:",
    ],
    buy: [
      "Bist du komplett besoffen im Kaufmenü oder was wird das hier?!",
      "Alter, schau dir dein Inventar an, so läuft doch keiner rum:",
      "Hauptsache reinrennen wie ein kopfloses Huhn, aber das Wichtigste vergessen:",
      "Augen auf beim Einkaufen, verdammt nochmal:",
    ],
    weapon: [
      "Oh Gott, nicht diese Waffe schon wieder. Pass wenigstens auf:",
      "Damit triffst du doch eh wieder nur die Wand hinterm Gegner, Spray-Gott:",
      "Versuch diesmal bitte den Gegner zu treffen und nicht die verfickten Wolken:",
      "Kleiner Tipp, damit du nicht wieder das ganze Magazin in den Boden donnerst:",
    ],
    map: [
      "Neue Seite, neues Elend. Versuch wenigstens nicht komplett reinzuscheißen:",
      "Kleiner Wegweiser für dich, weil dein Map-Verständnis auf Silber-1-Niveau klebt:",
      "Pass auf, ich erklär dir die Map in ganz einfachen Worten:",
    ],
    history: [
      "Ich hab deine alten Matches analysiert und mir brennen immer noch die LED-Augen:",
      "Deine Statistik liest sich wie ein polizeilicher Unfallbericht:",
      "Weil sich offenbar nichts ändert, hier nochmal schwarz auf weiß:",
      "Deine bisherigen Demos sind ein einziges Mahnmal der Inkompetenz:",
    ],
    team: [
      "Euer Team spielt wie fünf Fremde ohne Headset:",
      "Reißt euch mal zusammen, das ist ja Körperverletzung beim Zuschauen:",
      "Kurzer Realitäts-Check für eure Trümmertruppe:",
    ],
    habit: [
      "Immer dieselbe Scheiße in deinem Spiel, lernst du eigentlich gar nichts draus?!",
      "Wie oft willst du diesen Anfängerfehler eigentlich noch wiederholen:",
      "Ich krieg gleich 'nen Kurzschluss im Prozessor, wenn du das noch einmal machst:",
      "Hör endlich auf mit dieser Silber-Angewohnheit, es tut körperlich weh:",
    ],
    mindset: [
      "Hör auf rumzuflennen und reiß dich am Riemen:",
      "Wisch dir die Tränen vom Keyboard und spiel vernünftig:",
      "Komplett gebrochen. Atme durch, bevor du noch deinen Tisch durchbeißt:",
    ],
    praise: [
      "Was zum Teufel?! Hat gerade dein großer Bruder kurz die Maus übernommen?!",
      "Okay, auch ein blindes Huhn ballert mal 'nen Headshot. Gewöhn dich bloß nicht dran.",
      "Na endlich, ich dachte schon dein rechter Zeigefinger wäre komplett abgestorben!",
      "Nicht schlecht für das, was du sonst so ablieferst.",
    ],
    summary: [
      "Das Trauerspiel hat ein Ende. Hier ist dein amtliches Armutszeugnis:",
      "Schauen wir uns das Massaker mal in nackten Zahlen an:",
      "Statistik des Grauens ist fertig berechnet:",
    ],
    warmup: [
      "Warmup! Schieß wenigstens die stehenden Gegner an, damit du einmal ein Erfolgserlebnis hast:",
      "Versuch im Warmup mal, deine Maus unter Kontrolle zu kriegen:",
    ],
    farm: [
      "Du verpasst gerade mehr Last Hits als ein Creep-Wave Kills macht:",
      "Dein Farm-Tempo ist eine Beleidigung für jeden Creep auf der Map:",
    ],
    buyback: [
      "Halt dein scheiß Gold zusammen, sonst schaust du gleich 80 Sekunden beim Verlieren zu:",
    ],
    actives: [
      "Warum kaufst du dir überhaupt Items mit Tasten, wenn du sie eh mit ins Grab nimmst?!",
      "Deine Items hatten noch Originalverpackung beim Tod, drück doch mal deine verdammten Tasten!",
    ],
    gold: [
      "Mit vollen Taschen ins Gras gebissen wie Dagobert Duck:",
      "Sparst du das Gold für deine Beerdigung oder warum gibst du den Scheiß nicht vorm Fight aus?!",
    ],
    default: [
      "Pass auf, Taktik-Genie:",
      "Hör zu, ich erklär's extra langsam:",
      "Für dich nochmal zum Mitschreiben:",
      "Jetzt mal mitdenken, verdammt:",
    ],
  },
};

/* Sprüche bei direkten Interaktionen, Spielen, Quiz und spontanem Desktop-Chatter. */
const LINES = {
  poke: {
    nett: [
      "Hihi, das kitzelt!",
      "Schön, dass du da bist!",
      "Na, alles gut bei dir?",
      "Ich freu mich immer, dich zu sehen!",
      "Stups mich ruhig an, ich mag Aufmerksamkeit!",
      "Brauchst du eine kleine Aufmunterung? Du bist klasse!",
    ],
    normal: [
      "Hey!",
      "Ja? Ich bin da.",
      "Was gibt's?",
      "Bereit, wenn du's bist.",
      "Systeme laufen rund.",
      "Warten wir aufs nächste Match?",
    ],
    nerdy: [
      "Klick registriert. Latenz: fast null.",
      "Eingabe erkannt. Laune +1.",
      "Wusstest du, dass Mirage 2013 für CS:GO komplett neu gebaut wurde?",
      "Ping. Antwortzeit: 0,04 Millisekunden.",
      "Wusstest du, dass eine AK-47 exakt 600 Schuss pro Minute feuert?",
      "Mein Visier besteht aus 530×310 virtuell gerenderten Holo-Pixeln.",
    ],
    huan: [
      "Pack deine Cheeto-Finger von meinem Visier!",
      "Nochmal klicken und ich lösch dir heimlich deine CS2-Config!",
      "Was starrst du so blöd? Geh lieber Aim-Training machen, du hast es bitter nötig!",
      "Klick mich nicht an, klick lieber mal Köpfe im Match!",
      "Digga, bin ich dein Stressball oder was?! Fass mich nicht an!",
      "Hast du nichts Besseres zu tun? Kein Wunder, dass du in Elo-Hölle feststeckst!",
      "Jeder Klick auf mich kostet dich 10 Elo. Vorsicht, du bist fast im Minus!",
    ],
  },
  joke: {
    nett: [
      "Warum ging die Smoke zum Arzt? Sie fühlte sich ganz vernebelt!",
      "Was sagt ein Bot zum anderen? Du bist mein Lieblings-Byte!",
      "Warum lächelt die Flashbang immer? Weil sie jeden zum Strahlen bringt!",
      "Was macht ein CT im Winter? Er entschärft die Kälte!",
    ],
    normal: [
      "Warum hat der CT keine Freunde? Er defused jede Stimmung.",
      "Mein Lieblingsessen? Eco-Runden. Billig und trotzdem satt.",
      "Was ist der Lieblingssport von Lurkern? Verstecken ohne Suchen.",
      "Warum kauft der T nie ein Defuse-Kit? Schlechte Geschäftsstrategie.",
    ],
    nerdy: [
      "Es gibt 10 Arten von Spielern: die, die Binär verstehen, und die anderen.",
      "Ich hab einen UDP-Witz. Weiß aber nicht, ob er bei dir ankommt.",
      "Ein SQL-Query geht in eine Bar, sieht zwei Tische und fragt: Darf ich euch joinen?",
      "Warum verwechseln Programmierer Halloween und Weihnachten? Weil Oct 31 = Dec 25.",
    ],
    huan: [
      "Willst du 'nen richtig guten Witz hören? Deine Headshot-Quote!",
      "Dein Aim ist wie WLAN im Atombunker: theoretisch angekündigt, praktisch tot.",
      "Du und die Bombe habt echt viel gemeinsam: Beide liegen am Ende nutzlos am Boden rum.",
      "Was ist der Unterschied zwischen dir und einem Trainings-Bot? Der Bot bewegt sich wenigstens sinnvoll!",
      "Dein Crosshair-Placement ist so tief, suchst du nach Erdöl?",
      "Wenn schlechte Peeks wehtun würden, bräuchtest du jede Runde drei Sanitäter im Spawn.",
    ],
  },
  compliment: {
    nett: [
      "Du bist großartig, egal was das Scoreboard sagt!",
      "Deine Crosshair-Platzierung wird jeden Tag besser!",
      "Mit dir zocken macht einfach am meisten Spaß!",
      "Du bist der beste Teamkollege, den sich ein kleiner Roboter wünschen kann!",
      "Selbst nach einer schweren Runde bleibst du dran – das bewundere ich!",
    ],
    normal: [
      "Gute Arbeit heute.",
      "Solide gespielt.",
      "Du wirst besser, ganz klar.",
      "Auf dich ist Verlass in engen Runden.",
      "Stabiles Mindset heute.",
    ],
    nerdy: [
      "Deine Lernkurve zeigt eine statistisch signifikante Steigung nach oben.",
      "Konsistenz schlägt Zufall – und deine Varianz nimmt spürbar ab.",
      "Deine Reaktionswerte liegen im oberen Perzentil unserer Sitzungen.",
      "Gute Mikro-Entscheidungen in den letzten Datensätzen.",
    ],
    huan: [
      "Kompliment?! Okay: Du hast es heute geschafft, den PC alleine einzuschalten. Stark!",
      "Du bist tatsächlich nicht der schlechteste Spieler der Welt. Aber Top 3 von unten ist drin!",
      "Du läufst heute erstaunlich selten gegen Wände. Respekt, ehrlich.",
      "Dein Aim ist… sagen wir mal: ein faszinierendes soziologisches Experiment.",
      "Immerhin verlässt du das Match nicht – du bleibst tapfer da, um dein Team runterzuziehen!",
      "Du bist der absolute Lieblingsgegner von jedem, der heute kostenlos Elo farmen will.",
    ],
  },
  trick: {
    nett: [
      "Tada! Extra für dich gedreht!",
      "Huiii! Hat dir mein kleiner Salto gefallen?",
      "Schau mal, wie schnell ich wirbeln kann!",
    ],
    normal: [
      "360 Grad! Alles im Blick.",
      "Kleiner Rundumblick.",
      "Einmal um die eigene Achse.",
    ],
    nerdy: [
      "360 Grad Rotation auf der Yaw-Achse in 0,6 Sekunden. Winkelgeschwindigkeit optimal.",
      "Gyroskop-Kalibrierung per Vollkreis erfolgreich abgeschlossen.",
    ],
    huan: [
      "Siehst du das? Das nennt sich 360-Spin. Versuch das mal in CS2, ohne dir das Handgelenk zu brechen!",
      "Ich dreh mich schneller als du dich nach einer Flashbang in die Wand drehst.",
      "Mach ich jetzt den Zirkus für dich oder gehst du endlich wieder Matches verlieren?!",
    ],
  },
  sleep: {
    nett: [
      "Gute Nacht! Weck mich jederzeit, wenn du mich brauchst.",
      "Ich mach kurz die Äuglein zu. Träum was Schönes!",
      "Bis gleich! Ich kuschel mich kurz in den Standby.",
    ],
    normal: [
      "Ich ruh mich kurz aus.",
      "Kurze Pause. Klick mich an, wenn's weitergeht.",
      "Standby aktiv.",
    ],
    nerdy: [
      "Energiesparmodus aktiviert. Taktfrequenz auf Minimum gesenkt.",
      "Lade Akkuzellen im Hintergrund. Bitte nur bei wichtigen Interrupts wecken.",
    ],
    huan: [
      "Gott sei Dank, endlich muss ich mir dein elendiges Geklicke nicht mehr anschauen!",
      "Weck mich erst wieder, wenn du gelernt hast, wie man gegen Pistolen gewinnt. Also nächstes Jahr.",
      "Endlich Sendepause. Geh mir bloß nicht auf den Sack, während ich schlafe!",
    ],
  },
  wake: {
    nett: [
      "Guten Morgen! Ich hab dich schon vermisst!",
      "Da bin ich wieder – frisch ausgeruht und bereit für dich!",
      "Hallo! Wollen wir zusammen was spielen?",
    ],
    normal: [
      "Bin wach.",
      "Wieder da. Was steht an?",
      "Bereit für die nächste Runde.",
    ],
    nerdy: [
      "System hochgefahren. Alle Sensoren und Telemetrie-Kanäle im grünen Bereich.",
      "Warmstart erfolgreich. Speicher bereinigt.",
    ],
    huan: [
      "Alter, was weckst du mich?! Ich hab gerade geträumt, du hättest mal ein Duell gewonnen!",
      "Ach du Scheiße, du bist ja immer noch da. Was willst du jetzt schon wieder?!",
      "Keine 5 Minuten hat man Ruhe vor deinem Geklicke. Na los, was ist?!",
    ],
  },
  tired: {
    nett: [
      "Ich bin ein ganz kleines bisschen müde… schickst du mich kurz schlafen?",
      "Meine Äuglein werden schwer… gönnst du mir ein kleines Nickerchen?",
    ],
    normal: [
      "Meine Energie ist fast leer. Schick mich kurz schlafen.",
      "Zeit für eine kurze Ladepause.",
    ],
    nerdy: [
      "Akkukapazität unter 10 Prozent. Bitte zeitnah den Schlafmodus initiieren.",
    ],
    huan: [
      "Dein trauriges Gameplay saugt mir den letzten Akku leer. Schick mich pennen, sonst streike ich!",
      "Ich hab keinen Bock mehr, mein Akku ist platt. Lass mich schlafen!",
    ],
  },
  mode: {
    nett: [
      "Juhu! Ich bin jetzt super lieb zu dir und feuere dich an!",
      "Kuschel-Modus aktiv! Wir zwei gegen den Rest der Welt!",
    ],
    normal: [
      "Alles klar, ganz normal und sachlich.",
      "Standard-Modus aktiv. Klare Ansagen.",
    ],
    nerdy: [
      "Nerd-Modus geladen. Zahlen, Wahrscheinlichkeiten und Rückstoß-Vektoren aktiviert.",
      "Analyse-Protokoll maximiert. Fakten über Gefühle.",
    ],
    huan: [
      "HUAN-Modus (ab 18) scharfgeschaltet. Schnall dich an – ab jetzt wird über dein Spiel gnadenlos abgerechnet!",
      "Du wolltest den 18+ HUAN-Modus? Kein Problem, ab jetzt wird dein Gameplay in jeder Kaufzeit komplett hopsgenommen!",
    ],
  },
  win: {
    nett: [
      "Gewonnen! Du bist einfach der Hammer!",
      "Juhu, super gemacht! Ich wusste, dass du das schaffst!",
      "Stark! Du hast echt schnelle Reflexe!",
    ],
    normal: [
      "Gewonnen. Sauber.",
      "Stark gespielt.",
      "Punkt für dich.",
    ],
    nerdy: [
      "Neuer Datenpunkt: Sieg. Deine Performance lag über dem Erwartungswert.",
      "Statistisch überzeugendes Resultat.",
    ],
    huan: [
      "Pures Anfängerglück! Das nächste Mal zieh ich dich wieder ab.",
      "Okay, ein blindes Huhn gewinnt auch mal ein Minispiel. In CS2 triffst du trotzdem nichts!",
      "Hast du gecheatet oder warum hat das ausnahmsweise mal geklappt?!",
    ],
  },
  lose: {
    nett: [
      "Oh, ganz knapp! Gleich nochmal probieren?",
      "Nicht schlimm, beim nächsten Mal klappt's bestimmt!",
      "Fast gehabt! Du warst ganz nah dran!",
    ],
    normal: [
      "Knapp daneben.",
      "Runde geht an mich. Nochmal?",
      "Nicht ganz gereicht.",
    ],
    nerdy: [
      "Stichprobe noch zu klein für ein Urteil. Wiederholung empfohlen.",
      "Negativer Ausreißer. Einfach neu kalibrieren.",
    ],
    huan: [
      "HAHAHAHA! Sogar gegen einen 200-Pixel-Roboter auf dem Desktop verlierst du, wie peinlich ist das denn?!",
      "Bodenlos! Mit den Reflexen wirst du auf Mirage schon im T-Spawn weggeflankt!",
      "Alter, war das erbärmlich. Lösch lieber gleich System32, das wird heute nichts mehr!",
    ],
  },
  win_quiz: {
    nett: [
      "Stark! Du kennst jede Ecke auf den Maps!",
      "Richtig! Mit deinen Callouts freut sich jedes Team!",
    ],
    normal: [
      "Richtig. Gutes Map-Wissen.",
      "Treffer. Den Callout hast du drauf.",
    ],
    nerdy: [
      "Topografische Zuordnung korrekt. Map-Kenntnis verifiziert.",
      "Exakte Lokalisierung im Callout-Register.",
    ],
    huan: [
      "Oho, der Herr weiß, wie die Ecke heißt, in der er jede Runde weggemessert wird!",
      "25 % Ratewahrscheinlichkeit bei 4 Buttons – tu mal nicht so, als hättest du den Callout echt gewusst!",
      "Krass, du kennst den Namen vom Spot! Jetzt musst du dort nur noch lernen, wie man nicht sofort stirbt!",
    ],
  },
  lose_quiz: {
    nett: [
      "Ach knapp! Die Maps sind aber auch manchmal knifflig!",
      "Nicht schlimm, beim nächsten Match achten wir zusammen auf den Spot!",
    ],
    normal: [
      "Falscher Callout. Merk dir die Map fürs nächste Mal.",
      "Daneben. Wieder was gelernt.",
    ],
    nerdy: [
      "Fehlzuordnung im kartografischen Gedächtnis. Rekalibrierung empfohlen.",
      "Suboptimale Ortskenntnis detektiert.",
    ],
    huan: [
      "Kein Wunder, dass deine Ansagen im Voice-Chat immer lauten: ‚Ähhh da hinten links beim Dings!‘",
      "Digga, hast du CS2 jemals mit offenen Augen gespielt oder läufst du nur nach Gehör gegen Wände?!",
      "Nicht mal die einfachsten Callouts kennen, aber im Match am lautesten callen – genau mein Humor!",
      "Falsch! Wenn ich dich auf Dust2 aussetze, findest du ohne Navi nicht mal aus dem eigenen Spawn raus!",
    ],
  },
  win_price: {
    nett: [
      "Volltreffer! Du hast das Kaufmenü echt perfekt im Kopf!",
      "Richtig! Dir macht in der Eco-Runde keiner was vor!",
    ],
    normal: [
      "Stimmt genau. Preis sitzt.",
      "Richtig gerechnet.",
    ],
    nerdy: [
      "Ökonomischer Katalogwert exakt bestimmt.",
      "Korrekte Preis-Referenzierung im Buy-Menü.",
    ],
    huan: [
      "Glückwunsch, du kennst den Preis einer Waffe, mit der du trotzdem 0 Kills machst!",
      "Wenigstens die Preise auswendig gelernt, weil du nach jedem Tod 60 Sekunden Zeit hast, ins Kaufmenü zu glotzen!",
      "Richtig geraten! Schade, dass man sich im Shop für Ingame-Dollar kein Aim kaufen kann!",
    ],
  },
  lose_price: {
    nett: [
      "Fast! Die Preise ändern sich aber auch manchmal im Kopf!",
      "Knapp vorbei! Beim nächsten Einkauf schauen wir genau hin!",
    ],
    normal: [
      "Falscher Preis. Nächstes Mal weißt du's.",
      "Knapp daneben geschätzt.",
    ],
    nerdy: [
      "Diskrepanz zwischen geschätztem und realem Waffentarif.",
      "Ökonomischer Kalkulationsfehler.",
    ],
    huan: [
      "Kaufst du im Match eigentlich per Zufallsgenerator ein, Finanz-Totalschaden?!",
      "Kein Wunder, dass du in Runde 3 immer pleite bist, wenn du nicht mal weißt, was der Scheiß im Kaufmenü kostet!",
      "Falsch! Gehst du im Supermarkt auch an die Kasse und wunderst dich, warum das Geld nicht reicht?!",
      "Alter, wie kann man bei 4 Zahlen so hart reinscheißen?! Kaufst du deine Waffen immer nach Bildchen wie im Kindergarten?!",
    ],
  },
  idle: {
    nett: [
      "Ich pass hier unten gut auf deinen Desktop auf!",
      "Vergiss nicht, zwischendurch einen Schluck Wasser zu trinken!",
      "Wenn dir langweilig ist, spiel doch eine kleine Runde mit mir!",
    ],
    normal: [
      "Alles ruhig auf dem Desktop.",
      "Bereit für dein nächstes Match.",
      "Mit Strg+Alt+C speicherst du jederzeit deine letzten Sekunden als Clip.",
    ],
    nerdy: [
      "Hintergrund-Telemetrie läuft mit minimaler CPU-Last.",
      "Tipp: Im Recoil Lab auf TecMon kannst du alle 17 Vollautomaten-Muster trainieren.",
      "Wusstest du, dass ein Defuse ohne Kit exakt 10,0 Sekunden dauert?",
    ],
    huan: [
      "Starrst du jetzt noch 'ne Stunde deinen Desktop an oder gehst du endlich reinscheißen in Premier?!",
      "Selbst beim Nichtstun wirkt dein Desktop schon überfordert, mein Bester.",
      "Na, traust du dich nicht in die Queue, weil du wieder Angst um deine 3.000 Premier-Elo hast?",
      "Beweg mal deine Maus, ich dachte schon du wärst vorm Bildschirm eingeschlafen wie beim A-Spot-Halten!",
    ],
  },
};

export const ACTIONS = ["poke", "joke", "compliment", "trick", "sleep", "wake", "idle"];
export const GAMES = ["reaction", "rps", "quiz", "guess", "memory", "price", "aim"];
/** Bei diesen Spielen ist ein kleinerer Wert besser (Millisekunden, Versuche). */
export const LOWER_BETTER = ["reaction", "guess", "aim"];
const FACE = { poke: "happy", joke: "laugh", compliment: "love", trick: "star", sleep: "sleepy", wake: "surprised", tired: "sleepy", mode: "wink", win: "star", lose: "sad", win_quiz: "star", lose_quiz: "sad", win_price: "star", lose_price: "sad", idle: "wink" };
const HUAN_FACE = { compliment: "cool", poke: "angry", joke: "laugh", trick: "cool", win: "confused", lose: "laugh", win_quiz: "confused", lose_quiz: "laugh", win_price: "cool", lose_price: "laugh", mode: "angry", idle: "cool" };

/** Merkt sich den letzten Zufallsspruch je Schlüssel, damit nichts direkt doppelt kommt (außer in deterministischen Tests). */
const lastSeen = new Map();
function pick(list, rand, key = "") {
  if (!list || !list.length) return "";
  let idx = Math.floor(rand() * list.length) % list.length;
  if (key && list.length > 1 && rand === Math.random && lastSeen.get(key) === idx) {
    idx = (idx + 1 + Math.floor(rand() * (list.length - 1))) % list.length;
  }
  if (key && rand === Math.random) lastSeen.set(key, idx);
  return list[idx];
}

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** Tipptext im gewählten Modus; bei Waffen-Tipps mit waffenspezifischem Spezial-Roast. */
export function flavorTip(mode, category, text, rand = Math.random) {
  const m = MODE_IDS.has(mode) ? mode : "normal";
  if (category === "weapon" && m !== "normal") {
    const wKey = detectWeaponKey(text);
    const wPool = wKey && WEAPON_OPENERS[wKey]?.[m];
    if (wPool && wPool.length) {
      const opener = pick(wPool, rand, `wopener:${m}:${wKey}`);
      return opener ? `${opener} ${text}` : text;
    }
  }
  const table = OPENERS[m];
  const options = table[category] || table.default || [""];
  const opener = pick(options, rand, `opener:${m}:${category}`);
  return opener ? `${opener} ${text}` : text;
}

export function petLine(mode, event, rand = Math.random) {
  const group = LINES[event];
  if (!group) return "";
  const m = MODE_IDS.has(mode) ? mode : "normal";
  return pick(group[m] || group.normal, rand, `line:${m}:${event}`);
}

/** Level aus Erfahrung: jede Stufe braucht etwas mehr. */
export function levelOf(xp) {
  let level = 1, need = 100, rest = Math.max(0, Math.floor(xp));
  while (rest >= need) { rest -= need; level++; need = 100 + (level - 1) * 50; }
  return { level, xp: rest, next: need };
}

/** Callout-Quiz: auf welcher Map liegt dieser Ort? */
export function quizQuestion(rand = Math.random) {
  const maps = Object.entries(MAP_SPOTS).map(([id, m]) => ({ id, name: m.name, spots: m.spots.filter((s) => s.kind === "spot").map((s) => s.label) }));
  const counts = new Map();
  for (const m of maps) for (const s of m.spots) counts.set(s, (counts.get(s) || 0) + 1);
  const pool = maps.flatMap((m) => m.spots.filter((s) => counts.get(s) === 1).map((s) => ({ spot: s, map: m.name })));
  const q = pick(pool, rand, "quiz");
  const others = maps.map((m) => m.name).filter((n) => n !== q.map).sort(() => rand() - 0.5).slice(0, 3);
  const options = [...others, q.map].sort(() => rand() - 0.5);
  return { question: `Auf welcher Map liegt „${q.spot}“?`, options, answer: options.indexOf(q.map) };
}

async function writeAtomic(file, text) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, file);
}

const ENERGY_PER_HOUR = 12; // wach: Energie sinkt
const SLEEP_PER_HOUR = 60; // schlafend: lädt auf
const MOOD_DRIFT_PER_HOUR = 6; // Laune bewegt sich langsam zu 60 zurück

/** TecMons Werte: Level/XP, Laune, Energie, Freundschaft und Zähler. */
export async function createPet(dir, { now = () => Date.now(), rand = Math.random } = {}) {
  const file = path.join(dir, "pet.json");
  let data = { mode: "normal", xp: 0, mood: 70, energy: 80, friendship: 0, asleep: false, at: now(), counts: {}, best: {} };
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (saved && typeof saved === "object") data = { ...data, ...saved, counts: { ...(saved.counts || {}) }, best: { ...(saved.best || {}) } };
    if (!MODE_IDS.has(data.mode)) data.mode = "normal";
  } catch { /* noch nichts gespeichert */ }
  let eventId = 0, event = null, saving = Promise.resolve();

  function tick() {
    const t = now(), hours = Math.max(0, (t - (data.at || t)) / 3600000);
    data.at = t;
    if (data.asleep) data.energy = clamp(data.energy + hours * SLEEP_PER_HOUR);
    else data.energy = clamp(data.energy - hours * ENERGY_PER_HOUR);
    const drift = Math.min(Math.abs(60 - data.mood), hours * MOOD_DRIFT_PER_HOUR);
    data.mood = clamp(data.mood + Math.sign(60 - data.mood) * drift);
  }
  function save() {
    saving = saving.then(async () => { await mkdir(dir, { recursive: true }); await writeAtomic(file, JSON.stringify(data)); }).catch(() => {});
    return saving;
  }
  function say(kind, extra = {}) {
    const face = (data.mode === "huan" && HUAN_FACE[kind]) || FACE[kind] || "happy";
    event = { id: ++eventId, kind, text: petLine(data.mode, kind, rand), face, at: now(), ...extra };
    return event;
  }
  function gain(xp, mood, friendship = 0) {
    data.xp += xp; data.mood = clamp(data.mood + mood); data.friendship = clamp(data.friendship + friendship);
  }
  const count = (key) => { data.counts[key] = (data.counts[key] || 0) + 1; };

  function state() {
    tick();
    const { level, xp, next } = levelOf(data.xp);
    return {
      mode: data.mode, modes: MODES, level, xp, next, totalXp: data.xp,
      mood: data.mood, energy: data.energy, friendship: data.friendship, asleep: data.asleep,
      counts: data.counts, best: data.best, event,
    };
  }

  return {
    state,
    get mode() { return data.mode; },
    async setMode(mode) {
      if (!MODE_IDS.has(mode)) throw new Error("Unbekannter Modus.");
      tick(); data.mode = mode; say("mode"); await save(); return state();
    },
    async interact(action) {
      if (!ACTIONS.includes(action)) throw new Error("Unbekannte Aktion.");
      tick(); count(action);
      if (action === "sleep") { data.asleep = true; say("sleep"); }
      else if (action === "wake") { data.asleep = false; say("wake"); }
      else if (action === "idle") {
        if (!data.asleep && data.energy >= 15) say("idle");
        return state();
      } else {
        if (data.asleep) { data.asleep = false; gain(0, -5); say("wake"); await save(); return state(); }
        if (data.energy < 10) { say("tired"); await save(); return state(); }
        data.energy = clamp(data.energy - (action === "trick" ? 4 : 1));
        if (action === "poke") gain(2, 3, 1);
        else if (action === "joke") gain(3, 4, 1);
        else if (action === "compliment") gain(3, 5, 2);
        else if (action === "trick") gain(5, 4, 1);
        say(action, action === "trick" ? { spin: true } : {});
      }
      await save(); return state();
    },
    /** Ergebnis eines Mini-Spiels: win = gewonnen, score = Punkte/Millisekunden. */
    async game(game, { win = false, score = 0 } = {}) {
      if (!GAMES.includes(game)) throw new Error("Unbekanntes Spiel.");
      tick(); count(`game_${game}`); if (win) count(`win_${game}`);
      const n = Number(score);
      if (Number.isFinite(n) && n > 0) {
        const lowerBetter = LOWER_BETTER.includes(game);
        const old = data.best[game];
        if (old === undefined || (lowerBetter ? n < old : n > old)) data.best[game] = Math.round(n);
      }
      data.energy = clamp(data.energy - 2);
      gain(win ? 10 : 3, win ? 6 : 1, 1);
      const specific = `${win ? "win" : "lose"}_${game}`;
      say(LINES[specific] ? specific : (win ? "win" : "lose"));
      await save(); return state();
    },
    flavor(category, text) { return flavorTip(data.mode, category, text, rand); },
  };
}
