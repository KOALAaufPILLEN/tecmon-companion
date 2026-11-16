import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { createDemoFetch } from "../demo-fetch.mjs";

const VALID = "http://replay181.valve.net/730/003836361253752668484_0772446612.dem.bz2";

async function serve(t, handler) {
  const server = http.createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test("leitet nur Valve-Replay-Links weiter und streamt die Demo unverändert", async (t) => {
  const seen = [];
  const body = Buffer.from("BZh91AY&SY fixture");
  const fetcher = async (url, init) => {
    seen.push([url, init.redirect]);
    return new Response(body, { headers: { "content-length": String(body.length) } });
  };
  const demo = createDemoFetch({ fetch: fetcher });
  const base = await serve(t, (req, res) => demo.send(res, new URL(req.url, "http://x").searchParams.get("url")));
  for (const bad of ["http://127.0.0.1:31977/bridge/state", "https://replay1.valve.net/730/1_2.dem.bz2", "http://replay1.valve.net.evil.example/730/1_2.dem.bz2", "file:///C:/x.dem"]) {
    const res = await fetch(`${base}/?url=${encodeURIComponent(bad)}`);
    assert.equal(res.status, 400, bad);
  }
  assert.equal(seen.length, 0);
  const res = await fetch(`${base}/?url=${encodeURIComponent(VALID)}`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/x-bzip2");
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), body);
  assert.deepEqual(seen, [[VALID, "error"]]);
  assert.equal(demo.running, 0);
});

test("meldet gelöschte Demos und bricht zu große Antworten ab", async (t) => {
  let mode = "gone";
  const fetcher = async () => {
    if (mode === "gone") return new Response("", { status: 404 });
    if (mode === "big") return new Response("x", { headers: { "content-length": "999999999999" } });
    return new Response(new Uint8Array(64));
  };
  const demo = createDemoFetch({ fetch: fetcher, limit: 32 });
  const base = await serve(t, (req, res) => demo.send(res, VALID));
  assert.equal((await fetch(base)).status, 404);
  mode = "big";
  assert.equal((await fetch(base)).status, 502);
  mode = "stream";
  await assert.rejects(async () => {
    const res = await fetch(base);
    await res.arrayBuffer();
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(demo.running, 0);
});

test("begrenzt gleichzeitige Downloads", async (t) => {
  let release;
  const hold = new Promise((r) => (release = r));
  const fetcher = async () => {
    await hold;
    return new Response("ok");
  };
  const demo = createDemoFetch({ fetch: fetcher, max: 1 });
  const base = await serve(t, (req, res) => demo.send(res, VALID));
  const first = fetch(base);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await fetch(base)).status, 429);
  release();
  assert.equal((await first).status, 200);
});
