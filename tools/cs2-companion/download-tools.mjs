import path from "node:path";
import { createWriteStream, createReadStream } from "node:fs";
import { access, readFile, mkdir, readdir, cp, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Public installer fetches these unmodified packages from their original publisher. */
export async function ensureVideoTools(root, run, progress) {
  const manifest = JSON.parse(await readFile(path.join(root, "dependency-manifest.json"), "utf8"));
  for (const [name, expected] of [["hlae", path.join("hlae", "hlae.exe")], ["ffmpeg", path.join("ffmpeg", "bin", "ffmpeg.exe")]]) {
    try { await access(path.join(root, "tools", expected)); continue; } catch { /* First install. */ }
    const item = manifest[name];
    if (!item || !item.url.startsWith("https://github.com/") || !/^[a-f0-9]{64}$/i.test(item.sha256)) throw new Error("Ungültiges Tool-Manifest.");
    progress(`${name.toUpperCase()} vom Originalanbieter herunterladen und SHA256 prüfen …`);
    const temporary = path.join(root, "tool-downloads", randomUUID());
    await mkdir(temporary, { recursive: true });
    const zip = path.join(temporary, "package.zip");
    const unpacked = path.join(temporary, "unpacked");
    try {
      const response = await fetch(item.url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
      if (!response.ok || !response.body) throw new Error(`${name}: Download fehlgeschlagen (${response.status}).`);
      let bytes = 0;
      const limit = new Transform({ transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(bytes > 300 * 1024 * 1024 ? new Error("Tool-Download zu groß.") : null, chunk);
      }});
      await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(zip, { flags: "wx" }));
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(zip)) hash.update(chunk);
      if (hash.digest("hex").toLowerCase() !== item.sha256.toLowerCase()) throw new Error(`${name}: SHA256 stimmt nicht überein. Download wird nicht verwendet.`);
      await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-File", path.join(root, "unpack-tools.ps1"), "-Archive", zip, "-Destination", unpacked], { timeout: 120000 });
      const target = path.join(root, "tools", name);
      if (name === "hlae") await cp(unpacked, target, { recursive: true });
      else {
        const folders = (await readdir(unpacked, { withFileTypes: true })).filter((f) => f.isDirectory());
        if (folders.length !== 1) throw new Error("Unerwartetes FFmpeg-Paket.");
        await cp(path.join(unpacked, folders[0].name), target, { recursive: true });
      }
      await access(path.join(root, "tools", expected));
    } finally { await unlink(zip).catch(() => {}); }
  }
}
