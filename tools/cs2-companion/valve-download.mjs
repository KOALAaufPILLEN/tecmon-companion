/**
 * Eigener Demo-Download per Sharecode, ohne CS-Demo-Manager-Programm.
 *
 * Wie `csdm dl-valve` in CS Demo Manager 3.20.1 (MIT, Copyright AkiVer):
 * boiler-writter (MIT, AkiVer) fragt über das laufende, angemeldete Steam des
 * Nutzers beim CS2-Game-Coordinator die Match-Infos ab und schreibt sie als
 * Protobuf-Datei. Daraus kommt der Valve-Link der Demo; die .dem.bz2 wird
 * gestreamt und direkt lokal entpackt.
 */
import path from "node:path";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile, rm, rename, open } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Bunzip2 } from "./bunzip2.mjs";
import { shareCode } from "./share-code.mjs";

/** Unveränderliches npm-Paket von boiler-writter, Prüfsumme aus der npm-Registry. */
export const BOILER = {
  version: "1.7.0",
  url: "https://registry.npmjs.org/@akiver/boiler-writter/-/boiler-writter-1.7.0.tgz",
  integrity:
    "sha512-ponBoa6Rd/ZNFQNOdpOLjcbh01d0Gywo4vPCekKCSnlvv6p+wubXpPCPEJhVHjHV2WR45930YlPnfkcjuUme/A==",
};
const BOILER_FILES = ["boiler-writter.exe", "steam_api64.dll", "steam_appid.txt"];
export const REPLAY_URL = /^http:\/\/replay\d{1,4}\.valve\.net\/730\/\d{1,24}_\d{1,24}\.dem\.bz2$/;
const MAX_DEMO = 2 * 1024 * 1024 * 1024;

const ALPHABET = "ABCDEFGHJKLMNOPQRSTUVWXYZabcdefhijkmnopqrstuvwxyz23456789";
/** Sharecode → Match-ID, Outcome-ID, TV-Port (als Text, nie über Number runden). */
export function decodeShareCode(value) {
  const code = shareCode(value);
  let big = 0n;
  for (const c of [...code.slice(5).replaceAll("-", "")].reverse())
    big = big * 57n + BigInt(ALPHABET.indexOf(c));
  const bytes = new Uint8Array(18);
  for (let i = 17; i >= 0; i--) {
    bytes[i] = Number(big & 0xffn);
    big >>= 8n;
  }
  const le64 = (from) => {
    let v = 0n;
    for (let i = from + 7; i >= from; i--) v = (v << 8n) | BigInt(bytes[i]);
    return v.toString();
  };
  return { matchId: le64(0), outcomeId: le64(8), tvPort: String(bytes[16] | (bytes[17] << 8)) };
}

/* ---------- Minimaler Protobuf-Leser, nur für die benötigten Felder ---------- */
function* fields(buf) {
  let pos = 0;
  const varint = () => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      if (pos >= buf.length || shift > 63n) throw new Error("Ungültige Match-Infos.");
      const byte = buf[pos++];
      result |= BigInt(byte & 0x7f) << shift;
      if (!(byte & 0x80)) return result;
      shift += 7n;
    }
  };
  while (pos < buf.length) {
    const key = Number(varint());
    const field = key >>> 3;
    const type = key & 7;
    if (type === 0) yield { field, type, value: varint() };
    else if (type === 1) pos += 8;
    else if (type === 5) pos += 4;
    else if (type === 2) {
      const length = Number(varint());
      if (pos + length > buf.length) throw new Error("Ungültige Match-Infos.");
      yield { field, type, bytes: buf.subarray(pos, pos + length) };
      pos += length;
    } else throw new Error("Ungültige Match-Infos.");
  }
}

/**
 * CMsgGCCStrike15_v2_MatchList.matches (4) → CDataGCCStrike15_v2_MatchInfo;
 * darin roundstatsall (5, sonst roundstats_legacy 4) → .map (3) = Demo-Link
 * der letzten Runde. Gibt je Match den Link oder null zurück.
 */
export function demoLinks(buf) {
  const links = [];
  for (const m of fields(buf)) {
    if (m.field !== 4 || m.type !== 2) continue;
    let link = null;
    for (const r of fields(m.bytes)) {
      if ((r.field !== 5 && r.field !== 4) || r.type !== 2) continue;
      for (const f of fields(r.bytes))
        if (f.field === 3 && f.type === 2) {
          const text = Buffer.from(f.bytes).toString("utf8");
          if (REPLAY_URL.test(text)) link = text;
        }
    }
    links.push(link);
  }
  return links;
}

/* ---------- boiler-writter einmalig laden und prüfen ---------- */
function tarEntries(tar) {
  const entries = new Map();
  for (let pos = 0; pos + 512 <= tar.length; ) {
    const header = tar.subarray(pos, pos + 512);
    if (header.every((b) => b === 0)) break;
    const str = (a, b) => Buffer.from(header.subarray(a, b)).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const name = (str(345, 500) ? str(345, 500) + "/" : "") + str(0, 100);
    const type = String.fromCharCode(header[156] || 48);
    if (type === "0") entries.set(name, tar.subarray(pos + 512, pos + 512 + size));
    pos += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

export async function ensureBoiler(cacheDir, request = fetch) {
  const folder = path.join(cacheDir, `boiler-writter-${BOILER.version}`);
  const exe = path.join(folder, "boiler-writter.exe");
  const marker = path.join(folder, "integrity.txt");
  if (existsSync(exe) && (await readFile(marker, "utf8").catch(() => "")) === BOILER.integrity) return exe;
  const response = await request(BOILER.url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok) throw new Error("boiler-writter konnte nicht geladen werden.");
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 40 * 1024 * 1024) throw new Error("boiler-writter-Paket zu groß.");
    chunks.push(chunk);
  }
  const archive = Buffer.concat(chunks);
  const digest = "sha512-" + createHash("sha512").update(archive).digest("base64");
  if (digest !== BOILER.integrity) throw new Error("Prüfsumme von boiler-writter stimmt nicht. Download abgebrochen.");
  const entries = tarEntries(gunzipSync(archive));
  const temporary = `${folder}.${randomUUID()}.tmp`;
  await mkdir(temporary, { recursive: true });
  try {
    for (const name of BOILER_FILES) {
      const bytes = entries.get(`package/dist/bin/win32-x64/${name}`);
      if (!bytes) throw new Error("boiler-writter-Paket unvollständig.");
      await writeFile(path.join(temporary, name), bytes);
    }
    const license = entries.get("package/LICENSE");
    if (license) await writeFile(path.join(temporary, "LICENSE"), license);
    await writeFile(path.join(temporary, "integrity.txt"), BOILER.integrity);
    await rm(folder, { recursive: true, force: true });
    await rename(temporary, folder);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return exe;
}

const BOILER_ERRORS = {
  2: "boiler-writter: ungültige Angaben.",
  3: "Steam antwortet nicht. Steam neu starten.",
  4: "Steam ist schon mit dem CS2-Coordinator verbunden. CS2 schließen und erneut versuchen.",
  5: "Steam muss neu gestartet werden.",
  6: "Steam läuft nicht oder ist nicht angemeldet.",
  7: "In Steam ist kein Konto angemeldet.",
  8: "Keine Match-Infos gefunden. Der Valve-Link ist vermutlich abgelaufen.",
  9: "Match-Infos konnten nicht gespeichert werden.",
};

function runBoilerProcess(exe, args) {
  return new Promise((resolve) => {
    execFile(exe, args, { cwd: path.dirname(exe), windowsHide: true, timeout: 120000 }, (error) =>
      resolve(error ? (typeof error.code === "number" ? error.code : 1) : 0),
    );
  });
}

function tasklist(image) {
  return new Promise((resolve) => {
    execFile("tasklist", ["/fi", `imagename eq ${image}`, "/fo", "csv", "/nh"], { windowsHide: true }, (error, stdout) =>
      resolve(!error && stdout.toLowerCase().includes(`"${image}"`)),
    );
  });
}

/** Demo zu einem Sharecode in `directory` laden und entpacken. Gibt den .dem-Pfad zurück. */
export async function downloadValveDemo({ code, directory, cacheDir, log = () => {}, system = {} }) {
  const isRunning = system.isRunning || tasklist;
  const runBoiler = system.runBoiler || runBoilerProcess;
  const request = system.request || fetch;
  const info = decodeShareCode(code);
  if (!(await isRunning("steam.exe"))) throw new Error("Steam läuft nicht. Steam starten und anmelden.");
  if (await isRunning("cs2.exe")) throw new Error("Bitte CS2 schließen; Steam kann sonst keine Match-Infos abfragen.");
  await mkdir(directory, { recursive: true });
  const boiler = await ensureBoiler(cacheDir, system.request);
  const infoFile = path.join(directory, "matches.info");
  log("Match-Infos über dein Steam abfragen …");
  const exit = await runBoiler(boiler, [infoFile, info.matchId, info.outcomeId, info.tvPort]);
  if (exit !== 0) throw new Error(BOILER_ERRORS[exit] || `boiler-writter wurde mit Code ${exit} beendet.`);
  const [link] = demoLinks(await readFile(infoFile));
  await rm(infoFile, { force: true });
  if (!link) throw new Error("Für dieses Match gibt es keinen Demo-Link mehr. Valve löscht Demos nach einigen Wochen.");
  log("Demo von Valve laden und entpacken …");
  const response = await request(link, { redirect: "error", signal: AbortSignal.timeout(30 * 60 * 1000) });
  if (response.status === 404) throw new Error("Die Demo liegt nicht mehr bei Valve.");
  if (!response.ok || !response.body) throw new Error(`Valves Replay-Server antwortet mit Fehler ${response.status}.`);
  const demo = path.join(directory, `match730_${info.matchId}.dem`);
  const partial = `${demo}.${randomUUID()}.part`;
  const out = createWriteStream(partial);
  const write = (bytes) =>
    new Promise((resolve, reject) => out.write(Buffer.from(bytes), (e) => (e ? reject(e) : resolve())));
  const decoder = new Bunzip2();
  let written = 0;
  const pending = [];
  const sink = (bytes) => {
    written += bytes.length;
    if (written > MAX_DEMO) throw new Error("Demo zu groß.");
    pending.push(Buffer.from(bytes));
  };
  const flush = async () => {
    while (pending.length) await write(pending.shift());
  };
  try {
    for await (const chunk of response.body) {
      decoder.push(chunk);
      decoder.drain(sink);
      await flush();
    }
    decoder.end();
    decoder.drain(sink);
    await flush();
    await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
    const file = await open(partial, "r");
    try {
      const header = Buffer.alloc(8);
      const { bytesRead } = await file.read(header, 0, 8, 0);
      if (bytesRead !== 8 || !header.equals(Buffer.from("PBDEMS2\0"))) throw new Error("Der Download enthält keine CS2-Demo.");
    } finally {
      await file.close();
    }
    await rename(partial, demo);
  } catch (error) {
    out.destroy();
    await rm(partial, { force: true });
    throw error;
  }
  return demo;
}
