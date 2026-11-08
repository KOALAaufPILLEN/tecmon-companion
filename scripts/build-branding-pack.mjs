import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.resolve(process.argv[2] || path.join(root, "dist"));
const revision = "89f5431ff0db41bd2fe3f7ba21a723a01622428b";
const entries = {
  "logo.webp": {
    local: path.join(root, "tools/cs2-companion/public/logo.webp"),
    hash: "7e5598ef67d2d73994387e5dcda3e794fe1b353eb1ce78e887cb8f0de74725b1",
  },
  "font.ttf": {
    remote: "BarlowCondensed-Bold.ttf",
    hash: "e476562ec9c1e16cf16475895b511f08c804f438cc9a9f80a44ea50a0eeb5b65",
  },
  "OFL.txt": {
    remote: "OFL.txt",
    hash: "186d750eb496a4c17a76385f82be6aea2ac1cf2de074a811d63786cf374ea73f",
  },
};
const files = {};
for (const [name, entry] of Object.entries(entries)) {
  let bytes;
  if (entry.local) bytes = await readFile(entry.local);
  else {
    const response = await fetch(
      `https://raw.githubusercontent.com/google/fonts/${revision}/ofl/barlowcondensed/${entry.remote}`,
    );
    if (!response.ok) throw new Error(`Font download: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash("sha256").update(bytes).digest("hex") !== entry.hash)
    throw new Error(`Source checksum mismatch: ${name}`);
  files[name] = bytes.toString("base64");
}
await mkdir(output, { recursive: true });
const bytes = Buffer.from(JSON.stringify({ format: "tecmon-branding", version: 1, files }));
await writeFile(path.join(output, "TecMon-Branding-v1.json"), bytes);
console.log(
  JSON.stringify({ size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }),
);
