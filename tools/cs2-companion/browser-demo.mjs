import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
export const DEMO_CHUNK = 4 * 1024 * 1024;
export const DEMO_MAX = 2 * 1024 * 1024 * 1024;

/** Only files explicitly sent by an approved browser; never accept local paths. */
export function browserDemos(directory) {
  const uploads = new Map();
  return {
    async start(owner, size) {
      if (!Number.isSafeInteger(size) || size < 8 || size > DEMO_MAX)
        throw new Error("Demo muss zwischen 8 Bytes und 2 GB groß sein.");
      for (const [id, item] of uploads)
        if (!item.busy && Date.now() - item.time > 30 * 60 * 1000) {
          uploads.delete(id);
          await rm(item.directory, { recursive: true, force: true });
        }
      if (uploads.size >= 4)
        throw new Error("Zu viele Demo-Übertragungen. Laufende Übertragung zuerst abschließen.");
      const id = randomUUID(),
        folder = path.join(directory, id);
      await mkdir(folder, { recursive: true });
      const file = path.join(folder, "match.part");
      const handle = await open(file, "wx");
      await handle.close();
      uploads.set(id, {
        owner,
        size,
        directory: folder,
        file,
        received: 0,
        time: Date.now(),
        busy: false,
        ready: false,
      });
      return { id, chunkSize: DEMO_CHUNK, received: 0 };
    },
    async chunk(owner, id, offset, request) {
      const item = uploads.get(id);
      if (!item || item.owner !== owner) throw new Error("Demo-Übertragung nicht vorhanden.");
      if (item.busy || item.ready || offset !== item.received)
        throw new Error("Demo-Übertragung hat einen anderen Fortschritt. Erneut starten.");
      item.busy = true;
      try {
        const parts = [];
        let size = 0;
        for await (const part of request) {
          size += part.length;
          if (size > DEMO_CHUNK || size + offset > item.size)
            throw new Error("Demo-Stück zu groß.");
          parts.push(part);
        }
        if (!size) throw new Error("Leeres Demo-Stück.");
        const bytes = Buffer.concat(parts);
        if (offset === 0 && (size < 8 || !bytes.subarray(0, 8).equals(Buffer.from("PBDEMS2\0"))))
          throw new Error("Bitte eine entpackte CS2-Demo übertragen.");
        const file = await open(item.file, "r+");
        try {
          let written = 0;
          while (written < bytes.length) {
            const result = await file.write(
              bytes,
              written,
              bytes.length - written,
              offset + written,
            );
            if (!result.bytesWritten) throw new Error("Demo konnte nicht gespeichert werden.");
            written += result.bytesWritten;
          }
        } finally {
          await file.close();
        }
        item.received += size;
        item.time = Date.now();
        if (item.received === item.size) {
          const target = path.join(item.directory, "match.dem");
          await rename(item.file, target);
          item.file = target;
          item.ready = true;
        }
        return { id, received: item.received, ready: item.ready };
      } finally {
        item.busy = false;
      }
    },
    consume(owner, id) {
      const item = uploads.get(id);
      if (!item || item.owner !== owner || !item.ready)
        throw new Error("Demo-Übertragung ist noch nicht fertig.");
      uploads.delete(id);
      return item.file;
    },
    async cancel(owner, id) {
      const item = uploads.get(id);
      if (!item || item.owner !== owner || item.busy)
        throw new Error("Demo-Übertragung nicht verfügbar.");
      uploads.delete(id);
      await rm(item.directory, { recursive: true, force: true });
    },
  };
}
