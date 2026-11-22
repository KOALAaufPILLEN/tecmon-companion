// TEMPORÄR: Firefox-Übersetzungsmodelle (tr/pl) suchen, Prüfsummen ausgeben und mit der Bergamot-Engine testen.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ensureEngine } from "../tools/cs2-companion/chat-translate.mjs";

const root = await (await fetch("https://firefox.settings.services.mozilla.com/v1/")).json();
const base = root.capabilities.attachments.base_url;
const recs = (await (await fetch("https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records")).json()).data;
console.log("records", recs.length, "base", base);
const langs = ["tr", "pl"];
const pairs = [];
for (const l of langs) pairs.push([l, "en"], ["en", l]);
const out = {};
const dir = path.resolve("probe-models");
for (const [from, to] of pairs) {
  const mine = recs.filter((r) => r.fromLang === from && r.toLang === to);
  for (const r of mine) console.log("REC", from, to, r.fileType, r.version, r.name, r.attachment?.size, JSON.stringify(r.filter_expression || ""), r.architecture || "");
  const versions = [...new Set(mine.filter((r) => !r.filter_expression).map((r) => r.version))].filter((v) => !/[ab]/.test(v));
  versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const v = versions.at(-1);
  if (!v) { console.log("KEIN", from, to); continue; }
  const key = from + to;
  out[key] = {};
  await mkdir(path.join(dir, key), { recursive: true });
  for (const r of mine.filter((x) => x.version === v && !x.filter_expression)) {
    const url = base + r.attachment.location;
    const raw = Buffer.from(await (await fetch(url)).arrayBuffer());
    let bytes = raw;
    try { bytes = gunzipSync(raw); } catch { /* nicht gzip */ }
    const name = r.name.replace(/\.gz$/, "");
    await writeFile(path.join(dir, key, name), bytes);
    out[key][r.fileType] = { url, gz: bytes !== raw, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), name, rawSize: raw.length, rawHash: r.attachment.hash, version: v };
  }
}
console.log("MODELS " + JSON.stringify(out));
const folder = await ensureEngine(path.resolve("probe-engine"));
const lib = await import(pathToFileURL(path.join(folder, "translator.js")).href);
const registry = Object.entries(out).map(([key, parts]) => ({ from: key.slice(0, 2), to: key.slice(2), files: Object.fromEntries(Object.entries(parts).map(([t, p]) => [t, { name: path.join(dir, key, p.name) }])) }));
class B extends lib.TranslatorBacking {
  async loadModelRegistery() { return registry; }
  async fetch(name) { const b = await readFile(name); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); }
}
const t = new lib.BatchTranslator({}, new B({ downloadTimeout: 0 }));
for (const [from, to, text] of [["tr", "en", "AFERİN SANA"], ["tr", "en", "3 kişi ile mi oynayacağız"], ["en", "tr", "Nice shot, let's go B"], ["pl", "en", "Dobra robota, idziemy na B"], ["en", "pl", "Nice shot, let's go B"]]) {
  try { const r = await t.translate({ from, to, text, html: false, qualityScores: false }); console.log("OK", from, to, text, "=>", r?.target?.text); }
  catch (e) { console.log("FAIL", from, to, e?.message || e); }
}
process.exit(0);
