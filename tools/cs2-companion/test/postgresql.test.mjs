import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { checkPostgres, installPostgres, postgresEnvironment } from "../postgresql.mjs";

test("finds supported installation and checks readiness on loopback with the selected port", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecmon-pg-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "16"));
  await mkdir(path.join(root, "18"));
  const calls = [];
  const result = await checkPostgres({
    roots: [root],
    searchPath: "",
    exists: (exe) => exe.startsWith(root),
    port: 5433,
    run: async (exe, args) => {
      calls.push({ exe, args });
      return {
        stdout: exe.includes(`${path.sep}18${path.sep}`)
          ? "psql (PostgreSQL) 18.6\n"
          : "psql (PostgreSQL) 16.4\n",
      };
    },
  });
  assert.equal(result.major, 18);
  assert.equal(result.supported, true);
  assert.equal(result.ready, true);
  assert.deepEqual(calls.at(-1).args, ["-q", "-h", "127.0.0.1", "-p", "5433", "-t", "2"]);
});
test("an installed but stopped server is not reinstalled", async () => {
  const pg = await checkPostgres({
    roots: [],
    searchPath: "fixture-bin",
    exists: () => true,
    run: async (exe) => {
      if (exe.endsWith("pg_isready.exe")) throw new Error("not ready");
      return { stdout: "psql (PostgreSQL) 17.4" };
    },
  });
  assert.equal(pg.ready, false);
  assert.equal(pg.supported, true);
  const result = await installPostgres({
    check: async () => pg,
    launch: () => {
      throw new Error("must not launch");
    },
  });
  assert.equal(result.skipped, true);
});
test("missing database launches only the fixed interactive WinGet package without accepting agreements", async () => {
  let call;
  const result = await installPostgres({
    platform: "win32",
    check: async () => ({ supported: false }),
    launch: (exe, args, options) => {
      call = { exe, args, options };
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
  });
  assert.equal(result.skipped, false);
  assert.equal(call.exe, "winget.exe");
  assert.deepEqual(call.args, [
    "install",
    "--id",
    "PostgreSQL.PostgreSQL.18",
    "--exact",
    "--source",
    "winget",
    "--interactive",
    "--no-upgrade",
  ]);
  assert.equal(call.options.shell, false);
  assert.equal(call.options.stdio, "inherit");
});
test("adds psql only to child environment and rejects invalid ports", async () => {
  const base = { PATH: "existing", OTHER: "unchanged" };
  const env = postgresEnvironment({ supported: true, bin: "postgres-bin" }, base);
  assert.equal(base.PATH, "existing");
  assert.equal(env.PATH, `postgres-bin${path.delimiter}existing`);
  assert.equal(env.OTHER, "unchanged");
  assert.equal(postgresEnvironment({ supported: false }, base), base);
  await assert.rejects(checkPostgres({ port: 0 }), /Port/);
  await assert.rejects(checkPostgres({ port: "5432;anything" }), /Port/);
});
