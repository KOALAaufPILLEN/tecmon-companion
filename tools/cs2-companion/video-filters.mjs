/**
 * Voreingestellte Bildfilter für Highlight-Videos: 36 bestehende (video-filter-v1), 14 Pro/Intense Looks (video-filter-v2).
 * Die Webseite schickt nur die Kennung; die FFmpeg-Kette steht ausschließlich hier im Code.
 * Unbekannte Kennungen werden beim Prüfen des Auftrags verworfen (kein Filter).
 * Die Liste muss zu VIDEO_FILTERS in lib/videoFilters.ts der Webseite passen.
 *
 * Jeder Eintrag ist eine einfache Filterkette (ohne Labels) oder eine Funktion, die aus
 * Eingangs- und Ausgangslabel einen Teilgraphen baut (für Filter mit Verzweigung).
 */
const glow = (sigma, opacity) => (input, output, id) =>
  `[${input}]split[${id}a][${id}b];[${id}b]gblur=sigma=${sigma}[${id}c];[${id}a][${id}c]blend=all_mode=screen:all_opacity=${opacity}[${output}]`;

export const FILTER_V2_CAPABILITY = "video-filter-v2";
export const FILTER_V2_IDS = Object.freeze([
  "arena-pro", "cinema-pro", "tecmon-prime", "frostfire", "silverprint", "halation",
  "tecmon-ultra", "neon-storm", "inferno", "arctic", "toxic-lime", "blockbuster", "crimson-noir", "bloom-ultra",
]);

// Gentle toe/shoulder: open dark detail, compress bright effects before grading.
const filmCurve = "curves=all='0/0.012 0.08/0.075 0.25/0.235 0.5/0.52 0.75/0.79 0.92/0.93 1/0.98'";
const intenseCurve = "curves=all='0/0.005 0.08/0.04 0.25/0.19 0.5/0.53 0.75/0.85 0.93/0.96 1/0.99'";
const highlightBloom = (grade, threshold, opacity, radius) => (input, output, id, width) => {
  const sigma = Math.max(0.6, radius * width / 1920).toFixed(3);
  const lift = `max(0,(val-${threshold})*255/${255-threshold})`;
  return `[${input}]${grade},format=gbrp,split[${id}base][${id}light];` +
    `[${id}light]lutrgb=r='${lift}':g='${lift}':b='${lift}',gblur=sigma=${sigma}[${id}bloom];` +
    `[${id}base][${id}bloom]blend=all_mode=screen:all_opacity=${opacity}[${output}]`;
};
const halation = highlightBloom(`${filmCurve},colorbalance=rs=0.025:bs=0.015:rh=0.05:gh=0.015:bh=-0.025:pl=1,vibrance=intensity=0.1`,190,0.16,3.2);


export const VIDEO_FILTERS = Object.freeze({
  // Intense Looks: deliberately stronger, opt-in variants. Existing looks are unchanged.
  "tecmon-ultra": `${intenseCurve},colorbalance=rs=0.12:gs=-0.1:bs=0.2:rm=0.04:gm=-0.025:bm=0.06:rh=0.12:gh=0.06:bh=-0.085:pl=1,vibrance=intensity=0.48,eq=saturation=1.15`,
  "neon-storm": `${intenseCurve},colorbalance=rs=0.13:gs=-0.1:bs=0.22:rm=-0.055:gm=0.025:bm=0.075:rh=-0.035:gh=0.055:bh=0.09:pl=1,eq=saturation=1.48`,
  inferno: `${intenseCurve},colorbalance=rs=0.13:gs=-0.025:bs=-0.085:rm=0.08:gm=0.01:bm=-0.055:rh=0.14:gh=0.055:bh=-0.1:pl=1,eq=saturation=1.3`,
  arctic: `${intenseCurve},colorbalance=rs=-0.14:gs=0.025:bs=0.18:rm=-0.055:gm=0.02:bm=0.09:rh=-0.04:gh=0.035:bh=0.08:pl=1,eq=saturation=1.2`,
  "toxic-lime": `${intenseCurve},colorbalance=rs=-0.07:gs=0.13:bs=-0.1:rm=-0.025:gm=0.065:bm=-0.04:rh=0.055:gh=0.09:bh=-0.1:pl=1,eq=saturation=1.3`,
  blockbuster: `${intenseCurve},colorbalance=rs=-0.13:gs=0.055:bs=0.13:rm=-0.025:gm=0.01:bm=0.025:rh=0.14:gh=0.045:bh=-0.09:pl=1,vibrance=intensity=0.35,eq=saturation=1.14`,
  "crimson-noir": `${intenseCurve},eq=saturation=0.6,colorbalance=rs=0.16:gs=-0.065:bs=-0.03:rm=0.075:gm=-0.025:bm=-0.015:rh=0.09:gh=0.015:bh=-0.035:pl=1,eq=contrast=1.08`,
  "bloom-ultra": highlightBloom(`${intenseCurve},colorbalance=rs=0.07:gs=-0.035:bs=0.1:rh=0.07:gh=0.025:bh=-0.03:pl=1,vibrance=intensity=0.4,eq=saturation=1.22`,165,0.3,5),
  // Pro Looks (video-filter-v2). No crop, grain, shake or invented HDR metadata.
  "arena-pro": "curves=all='0/0 0.06/0.065 0.25/0.24 0.5/0.515 0.8/0.815 1/1',vibrance=intensity=0.22,unsharp=5:5:0.35:3:3:0",
  "cinema-pro": `${filmCurve},colorbalance=rs=-0.045:gs=0.012:bs=0.045:rh=0.055:gh=0.018:bh=-0.035:pl=1,vibrance=intensity=0.14`,
  "tecmon-prime": `${filmCurve},colorbalance=rs=0.055:gs=-0.04:bs=0.09:rm=0.015:bm=0.02:rh=0.065:gh=0.035:bh=-0.045:pl=1,vibrance=intensity=0.2`,
  frostfire: `${filmCurve},colorbalance=rs=-0.075:gs=0.005:bs=0.11:rm=-0.02:bm=0.025:rh=0.09:gh=0.025:bh=-0.055:pl=1,eq=saturation=1.08`,
  silverprint: `${filmCurve},eq=saturation=0.68,colorbalance=rs=0.02:gs=-0.005:bs=0.045:rh=0.02:bh=-0.015:pl=1,unsharp=5:5:0.25:3:3:0`,
  halation,
  // Kräftig und klar: gegen das leicht ausgewaschene CS2-Bild.
  klar: "eq=contrast=1.06:saturation=1.2:gamma=0.98,unsharp=5:5:0.6",
  kraeftig: "eq=contrast=1.12:saturation=1.45,unsharp=5:5:0.5",
  hdr: "eq=contrast=1.16:saturation=1.3:gamma=0.94,unsharp=7:7:0.8,vignette=PI/6",
  // Look-Filter
  kino: "colorbalance=rs=-0.08:gs=-0.02:bs=0.1:rh=0.1:gh=0.02:bh=-0.08,eq=contrast=1.1:saturation=1.1,vignette=PI/5",
  neon: "colorbalance=rs=0.1:bs=0.18:rh=0.05:bh=0.12,eq=contrast=1.12:saturation=1.35",
  cyberpunk:
    "curves=r='0/0 0.5/0.58 1/1':g='0/0 0.5/0.45 1/0.95':b='0/0.06 0.5/0.6 1/1',eq=saturation=1.3:contrast=1.08",
  tecmon: "colorbalance=rs=0.06:gs=-0.03:bs=0.12:rh=0.08:gh=0.04:bh=-0.04,eq=contrast=1.1:saturation=1.25",
  eis: "colorbalance=rs=-0.1:bs=0.12:rm=-0.06:bm=0.08,eq=saturation=0.95:contrast=1.06",
  sonne: "colorbalance=rs=0.1:gs=0.03:bs=-0.1:rm=0.08:bm=-0.06,eq=saturation=1.15:contrast=1.04",
  dramatisch: "curves=preset=strong_contrast,eq=saturation=1.1,vignette=PI/4",
  pastell: "eq=saturation=0.75:contrast=0.9:brightness=0.04,colorbalance=rs=0.03:bs=0.05",
  traum: glow(14, 0.35),
  leuchten: glow(6, 0.45),
  // Schwarzweiß und Retro
  noir: "hue=s=0,eq=contrast=1.35:brightness=-0.02,vignette=PI/4",
  sepia: "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=contrast=0.96,vignette=PI/4",
  vintage:
    "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=saturation=1.6:contrast=0.95,noise=alls=10:allf=t,vignette=PI/4",
  vhs: "rgbashift=rh=-3:bh=3,eq=saturation=1.25:contrast=1.05,gblur=sigma=0.7,noise=alls=12:allf=t",
  filmkorn: "noise=alls=14:allf=t+u,eq=contrast=1.05",
  chroma: "rgbashift=rh=-6:bh=6:gv=1,eq=saturation=1.15",
  pixel: "scale=iw/6:-2:flags=area,scale=iw*6:-2:flags=neighbor",
  // Spezial
  matrix: "colorchannelmixer=rr=0.55:gg=1.12:bb=0.55,eq=contrast=1.15",
  nachtsicht: "hue=s=0,colorchannelmixer=rr=0.25:gg=1.2:bb=0.25,eq=contrast=1.2,noise=alls=18:allf=t,vignette=PI/3",
  abend: "colorbalance=rs=-0.05:bs=0.15:rh=0.12:gh=-0.02:bh=0.06,eq=contrast=1.08:saturation=1.15:gamma=0.96",
  scharf: "unsharp=7:7:1.4,eq=contrast=1.08:saturation=1.1",
  // Ab 0.25.0 zusätzlich
  lebendig: "vibrance=intensity=0.4,eq=contrast=1.05",
  hell: "eq=brightness=0.05:gamma=1.1:saturation=1.1",
  bleach: "eq=saturation=0.5:contrast=1.3,curves=preset=increase_contrast",
  lila: "colorbalance=rs=0.08:gs=-0.08:bs=0.16:rm=0.06:gm=-0.06:bm=0.1,eq=saturation=1.2:contrast=1.06",
  blutrot: "colorbalance=rs=0.16:gs=-0.04:bs=-0.04:rm=0.1:gm=-0.04:bm=-0.04,eq=contrast=1.12:saturation=1.1",
  gold: "colorbalance=rs=0.12:gs=0.06:bs=-0.12:rh=0.1:gh=0.06:bh=-0.1,eq=saturation=1.12:contrast=1.04",
  lomo: "curves=preset=cross_process,vignette=PI/4",
  // Formate fest vorgeben, sonst handelt FFmpeg für beide Zweige Graustufen aus.
  comic: (input, output, id) =>
    `[${input}]format=yuv444p,split[${id}a][${id}b];` +
    `[${id}b]edgedetect=low=0.05:high=0.15,negate,format=rgb24[${id}e];` +
    `[${id}a]eq=saturation=1.5,format=rgb24,lutrgb=r='bitand(val,192)+32':g='bitand(val,192)+32':b='bitand(val,192)+32'[${id}c];` +
    `[${id}c][${id}e]blend=all_mode=multiply[${output}]`,
  thermal: "pseudocolor=p=heat",
  negativ: "negate",
  scanlines: "drawgrid=w=iw:h=4:t=1:c=black@0.35,eq=contrast=1.08:saturation=1.15",
  poster: "lutrgb=r='bitand(val,224)':g='bitand(val,224)':b='bitand(val,224)'",
});

export const FILTER_IDS = Object.freeze(Object.keys(VIDEO_FILTERS));

/** Kennung prüfen: bekannte Kennung oder undefined. */
export function filterId(value) {
  return typeof value === "string" && Object.hasOwn(VIDEO_FILTERS, value) ? value : undefined;
}

/**
 * Teilgraph von [input] nach [output] mit dem Filter `id`. Breite und Höhe werden am Ende
 * wieder auf width×height gesetzt (z. B. nach dem Pixel-Filter). Ohne Filter: nur durchreichen.
 */
export function filterGraph(id, input, output, width, height) {
  const f = filterId(id) && VIDEO_FILTERS[id];
  if (!f) return `[${input}]null[${output}]`;
  const tag = "flt" + output.replace(/\W/g, "");
  if (typeof f === "function") return f(input, tag + "o", tag, width, height) + `;[${tag}o]scale=${width}:${height},setsar=1[${output}]`;
  return `[${input}]${f},scale=${width}:${height},setsar=1[${output}]`;
}

/** Hängt den Filter an einen fertigen Graphen mit Ausgang [v] an. */
export function withFilter(graph, id, width, height) {
  if (!filterId(id)) return graph;
  if (!/\[v\]$/.test(graph)) throw new Error("Filtergraph ohne Ausgang [v].");
  return graph.replace(/\[v\]$/, "[prefilter];") + filterGraph(id, "prefilter", "v", width, height);
}
