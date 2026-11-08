import path from "node:path";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

export const BRANDING_URL =
  "https://github.com/KOALAaufPILLEN/tecmon-companion/releases/download/v0.6.0/TecMon-Branding-v1.json";
export const BRANDING_SHA256 = "aebe71cd08594e66cd2b6afea6da70859857f2ce83201295f152bcaf8c9ab155";
export const BRANDING_FILES = Object.freeze({
  "logo.webp": "7e5598ef67d2d73994387e5dcda3e794fe1b353eb1ce78e887cb8f0de74725b1",
  "font.ttf": "e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65",
  "OFL.txt": "186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f",
});
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function verifyBrandingPack(bytes) {
  if (bytes.length > 1024 * 1024 || sha256(bytes) !== BRANDING_SHA256)
    throw new Error("Branding-Prüfsumme stimmt nicht. Geänderte Visuals werden nicht verwendet.");
  const pack = JSON.parse(bytes.toString("utf8"));
  if (
    pack.format !== "tecmon-branding" ||
    pack.version !== 1 ||
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
  const target = path.join(directory, "TecMon-Branding-v1.json");
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
