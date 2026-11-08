import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, utimes } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { once } from "node:events";
import { createCompanion } from "../server.mjs";

test("neueste Videos auflisten und nur geprüfte Pfade öffnen", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-videos-test-"));
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  for (const [i, id] of ids.entries()) {
    await mkdir(path.join(dir, id, "rendered"), { recursive: true });
    const file = path.join(dir, id, "rendered", `clip${i}.mp4`);
    await writeFile(file, "video");
    await utimes(file, 1000 + i, 1000 + i);
  }
  await mkdir(path.join(dir, "Browser-Demos"));
  await writeFile(path.join(dir, "Browser-Demos", "fremd.mp4"), "nicht anzeigen");
  const opened = [];
  const { server, token } = await createCompanion({
    dataDir: dir,
    detectTools: async () => ({ csdm: "", cs2: "" }),
    openPath: (target, select) => opened.push([target, select]),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const post = (route, body) => fetch(base + route, { method: "POST", headers, body: JSON.stringify(body) });

  assert.equal((await fetch(base + "/api/videos")).status, 401);
  const { videos } = await (await fetch(base + "/api/videos", { headers })).json();
  assert.deepEqual(
    videos.map((v) => v.key),
    [`${ids[1]}/rendered/clip1.mp4`, `${ids[0]}/rendered/clip0.mp4`],
    "neueste zuerst, fremde Ordner ignoriert",
  );

  assert.equal((await post("/api/videos/open", { key: videos[0].key })).status, 200);
  assert.equal((await post("/api/videos/folder", { key: videos[0].key })).status, 200);
  assert.equal((await post("/api/videos/folder", {})).status, 200);
  assert.deepEqual(
    opened.map(([target, select]) => [path.relative(dir, target), select]),
    [
      [path.join(ids[1], "rendered", "clip1.mp4"), false],
      [path.join(ids[1], "rendered", "clip1.mp4"), true],
      ["", false],
    ],
  );
  for (const key of [
    `${ids[0]}/../../etc/passwd.mp4`,
    "Browser-Demos/fremd.mp4",
    `${ids[0]}/rendered/fehlt.mp4`,
    `${ids[0]}/rendered/clip0.exe`,
    42,
  ])
    assert.equal((await post("/api/videos/open", { key })).status, 400, String(key));
  assert.equal(opened.length, 3);
});
