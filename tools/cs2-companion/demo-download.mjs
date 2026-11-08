import path from "node:path";
import { mkdir, readdir, realpath, open } from "node:fs/promises";
import { shareCode } from "./share-code.mjs";

/** The caller supplies a fresh, private directory; CSDM resolves/streams/extracts locally. */
export async function downloadDemo({ code, directory, exe, run, entry }) {
  code = shareCode(code);
  await mkdir(directory, { recursive: true });
  await run(exe, ["dl-valve", code, "--output", directory], entry);
  const files = await readdir(directory, { withFileTypes: true });
  const candidates = files.filter((f) => f.isFile() && !f.isSymbolicLink() && /\.dem$/i.test(f.name));
  if (candidates.length !== 1)
    throw new Error("Keine eindeutige Demo heruntergeladen. Steam anmelden und CS2 schließen; der Valve-Link kann bereits abgelaufen sein. Siehe Download-Protokoll.");
  const demo = await realpath(path.join(directory, candidates[0].name));
  const relative = path.relative(await realpath(directory), demo);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Ungültiger Demo-Pfad.");
  const file = await open(demo, "r");
  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await file.read(header, 0, 8, 0);
    if (bytesRead !== 8 || !header.equals(Buffer.from("PBDEMS2\0")))
      throw new Error("Der Download enthält keine entpackte CS2-Demo.");
  } finally { await file.close(); }
  return demo;
}
