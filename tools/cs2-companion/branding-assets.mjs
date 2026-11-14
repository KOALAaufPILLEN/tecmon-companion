import path from "node:path";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

export const BRANDING_URL =
  "https://github.com/KOALAaufPILLEN/tecmon-companion/releases/download/v0.13.0/TecMon-Branding-v3.json";
export const BRANDING_SHA256 = "874da002d77cbbdf09fb48c31b42feb8e175471b57fa84a3317ad6459642b2cf";
export const BRANDING_FILES = Object.freeze({
  "logo.webp": "7e5598ef67d2d73994387e5dcda3e794fe1b353eb1ce78e887cb8f0de74725b1",
  "font.ttf": "e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65",
  "OFL.txt": "186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f",
  "cyber-hud.png": "51948da7aceac306e097b1ad0138b3a1b09633bc5d1112853dba4ff68b6121fd",
  "cyber-stinger.png": "d790ec0bd463b87228fb75a0fd5f6fd33e07152ad46a95e4011a7405f4c762b5",
});
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function verifyBrandingPack(bytes) {
  if (bytes.length > 1024 * 1024 || sha256(bytes) !== BRANDING_SHA256)
    throw new Error("Branding-Prüfsumme stimmt nicht. Geänderte Visuals werden nicht verwendet.");
  const pack = JSON.parse(bytes.toString("utf8"));
  if (
    pack.format !== "tecmon-branding" ||
    pack.version !== 3 ||
    !pack.files ||
    Object.keys(pack.files).length !== Object.keys(BRANDING_FILES).length
  )
    throw new Error("Ungültiges Branding-Paket.");
  const files = {};
  for (const [name, hash] of Object.entries(BRANDING_FILES)) {
    if (typeof pack.files[name] !== "string") throw new Error("Branding-Datei fehlt.");
    const data = Buffer.from(pack.files[name], "base64");
    if (sha256(data) !== hash) throw new Error("Branding-Datei wurde verändert.");
    files[name] = data;
  }
  return files;
}
export async function loadBrandingPack(directory, request = fetch) {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, "TecMon-Branding-v3.json");
  try {
    return verifyBrandingPack(await readFile(target));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const response = await request(BRANDING_URL, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Branding-Download fehlgeschlagen (HTTP ${response.status}).`);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Branding-Paket zu groß.");
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  const files = verifyBrandingPack(bytes);
  const temporary = target + "." + randomUUID() + ".tmp";
  await writeFile(temporary, bytes, { mode: 0o600 });
  await rename(temporary, target);
  return files;
}

/**
 * Animiertes Intro, Esport-Titelbild, Szenenwechsel und Outro (v2 ab 0.24.0, v1 ab 0.23.0). Eigenes Paket, damit das kleine
 * v3-Paket gleich bleibt. Feste URL und feste SHA256 wie bei v3: Bei Abweichung
 * wird nichts verwendet und der Auftrag bricht ab.
 */
export const MOTION_URL =
  "https://github.com/KOALAaufPILLEN/tecmon-companion/releases/download/v0.24.0/TecMon-Motion-v2.json";
export const MOTION_SHA256 = "5ce1817e13a61ba26df41a105734d79693058b01d926a3f0c0ba9ac7e7cac2ba";
export const MOTION_FILE = "TecMon-Motion-v2.json";
export const MOTION_FILES = Object.freeze({
  "intro.mp4": "c29e4a6f7c9f3e1b110ae5710bb80625b1e965f105dc8ea48536ad8ea247d72b",
  "outro.mp4": "5a2b145dc5eb093470e1be1471987622ed005ea21549e490b3bf047a334cbcfd",
  "intro-b.mp4": "0c1628cba6ce74e26d14ec63245d6d556e58c8cf2e3a927489b025165d3c23c0",
  "outro-b.mp4": "bd59ab6e01d936901fc1324ae99884679793839a8ec0eccf3e0a6fd08e87ba8d",
  "title.mp4": "f6f2b5371fb86586e2768754b48e62d81d8320c320a6ecef83cba55ea96b5a65",
  "switch.mp4": "8199031876571fb5aff434750d7602729241b8af679f7bcafd82fd6d956dc35a",
});
const MOTION_LIMIT = 16 * 1024 * 1024;
export function verifyMotionPack(bytes) {
  if (bytes.length > MOTION_LIMIT || sha256(bytes) !== MOTION_SHA256)
    throw new Error("Prüfsumme des Video-Brandings stimmt nicht. Geänderte Videos werden nicht verwendet.");
  const pack = JSON.parse(bytes.toString("utf8"));
  if (
    pack.format !== "tecmon-motion" ||
    pack.version !== 2 ||
    !pack.files ||
    Object.keys(pack.files).length !== Object.keys(MOTION_FILES).length
  )
    throw new Error("Ungültiges Video-Branding-Paket.");
  const files = {};
  for (const [name, hash] of Object.entries(MOTION_FILES)) {
    if (typeof pack.files[name] !== "string") throw new Error("Video-Branding-Datei fehlt.");
    const data = Buffer.from(pack.files[name], "base64");
    if (sha256(data) !== hash) throw new Error("Video-Branding-Datei wurde verändert (Prüfsumme).");
    files[name] = data;
  }
  return files;
}
/**
 * Lädt das Paket einmal und hält es im Branding-Ordner. Netzfehler liefern null
 * (dann bleibt das bisherige statische Intro). Falsche Prüfsummen werfen immer.
 */
export async function loadMotionPack(directory, request = fetch) {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, MOTION_FILE);
  // Älteres Paket (v1) wird nicht mehr gebraucht.
  await rm(path.join(directory, "TecMon-Motion-v1.json"), { force: true }).catch(() => {});
  try {
    return verifyMotionPack(await readFile(target));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let response;
  try {
    response = await request(MOTION_URL, { signal: AbortSignal.timeout(180000) });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MOTION_LIMIT) break;
      chunks.push(chunk);
    }
  } catch {
    return null;
  }
  if (size > MOTION_LIMIT) throw new Error("Video-Branding-Paket zu groß.");
  const bytes = Buffer.concat(chunks);
  const files = verifyMotionPack(bytes);
  const temporary = target + "." + randomUUID() + ".tmp";
  await writeFile(temporary, bytes, { mode: 0o600 });
  await rename(temporary, target);
  return files;
}
