import { randomBytes, randomInt, randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";

const ORIGINS = new Set([
  "https://tecmon.online",
  "https://app.tecmon.app",
  "https://tecmon-app.vercel.app",
]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
export async function createBrowserBridge(directory) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, "bridge-devices.json");
  let devices = [];
  try {
    const saved = JSON.parse(await readFile(file, "utf8"));
    if (saved.version !== 1 || !Array.isArray(saved.devices))
      throw new Error("Ungültige Verbindungsliste.");
    devices = saved.devices
      .filter(
        (d) => ORIGINS.has(d.origin) && /^[a-f0-9]{64}$/.test(d.hash) && typeof d.id === "string",
      )
      .slice(0, 16);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const pending = new Map();
  let saving = Promise.resolve();
  const save = () => {
    const body = JSON.stringify({ version: 1, devices });
    saving = saving
      .catch(() => {})
      .then(async () => {
        const temporary = file + "." + randomUUID() + ".tmp";
        await writeFile(temporary, body, { mode: 0o600 });
        await rename(temporary, file);
      });
    return saving;
  };
  const clean = () => {
    for (const [id, item] of pending) if (item.expires <= Date.now()) pending.delete(id);
  };
  return {
    allowed: (origin) => ORIGINS.has(origin),
    state() {
      clean();
      return {
        pending: [...pending.values()]
          .filter((p) => !p.token)
          .map(({ id, code, origin }) => ({ id, code, origin })),
        devices: devices.map(({ id, origin, createdAt }) => ({ id, origin, createdAt })),
      };
    },
    pair(origin) {
      clean();
      if (
        !ORIGINS.has(origin) ||
        pending.size >= 8 ||
        [...pending.values()].filter((p) => p.origin === origin).length >= 2
      )
        throw new Error(
          "Verbindungsanfrage läuft bereits. Bitte im Companion prüfen oder fünf Minuten warten.",
        );
      const item = {
        id: randomUUID(),
        request: randomBytes(32).toString("hex"),
        code: String(randomInt(100000, 1000000)),
        origin,
        expires: Date.now() + 300000,
      };
      pending.set(item.id, item);
      return { request: item.request, code: item.code };
    },
    poll(origin, request) {
      clean();
      const item = [...pending.values()].find((p) => p.origin === origin && p.request === request);
      if (!item) throw new Error("Verbindungsanfrage abgelaufen. Erneut verbinden.");
      return item.token ? { approved: true, token: item.token } : { approved: false };
    },
    async approve(id) {
      clean();
      const item = pending.get(id);
      if (!item || item.token || item.approving)
        throw new Error("Verbindungsanfrage nicht mehr verfügbar.");
      if (devices.length >= 16) throw new Error("Zuerst eine alte Verbindung widerrufen.");
      item.approving = true;
      const token = randomBytes(32).toString("hex");
      const device = {
        id: randomUUID(),
        origin: item.origin,
        hash: hash(token),
        createdAt: Date.now(),
      };
      devices.push(device);
      try {
        await save();
        item.token = token;
      } catch (error) {
        devices = devices.filter((d) => d.id !== device.id);
        item.approving = false;
        throw error;
      }
    },
    async revoke(id) {
      devices = devices.filter((d) => d.id !== id);
      pending.clear();
      await save();
    },
    authorize(origin, token) {
      if (!ORIGINS.has(origin) || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token))
        return null;
      return devices.find((d) => d.origin === origin && d.hash === hash(token))?.id || null;
    },
  };
}
