import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { once } from "node:events";
import {
  csdmInvocation,
  managedEnvironment,
  availablePort,
  runTool,
  setupManagedInstallation,
} from "../managed-installation.mjs";

test("CSDM uses its own profile and CLI entry point without a command shell", () => {
  const config = { postgresBin: "postgres-bin", profileDir: "tecmon-profile", csdmPort: 25474 };
  const env = managedEnvironment(config, { Path: "old-path", KEEP: "yes" });
  assert.equal(env.Path, undefined);
  assert.equal(env.PATH, `postgres-bin${path.delimiter}old-path`);
  assert.equal(env.USERPROFILE, "tecmon-profile");
  assert.equal(env.KEEP, "yes");
  const command = csdmInvocation(
    path.resolve("tools", "cs-demo-manager.exe"),
    ["analyze", "demo with spaces.dem"],
    config,
  );
  assert.equal(command.env.ELECTRON_RUN_AS_NODE, "1");
  assert.deepEqual(command.args, [
    path.resolve("tools", "resources", "app.asar", "cli.js"),
    "analyze",
    "demo with spaces.dem",
  ]);
  assert.deepEqual(csdmInvocation("csdm.exe", ["help"], null).args, ["help"]);
});
test("process invocation preserves special characters and UTF8 stdin", async () => {
  const value = "quotes \" & apostrophe' ä spaces";
  const result = await runTool(
    process.execPath,
    [
      "-e",
      "let t='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>t+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify([process.argv[1],t])))",
      value,
    ],
    { input: value },
  );
  assert.deepEqual(JSON.parse(result), [value, value]);
  await runTool(process.execPath, ["-e", "process.exit(0)"], { detachedStreams: true });
});
test("selects an available loopback port and rejects invalid ranges", async (t) => {
  const held = net.createServer();
  held.listen(0, "127.0.0.1");
  await once(held, "listening");
  t.after(() => new Promise((resolve) => held.close(resolve)));
  const port = held.address().port;
  if (port < 65400) assert.notEqual(await availablePort(port), port);
  await assert.rejects(availablePort(0), /Port/);
});
test("setup requires consent and a valid freely chosen password before touching files", async () => {
  await assert.rejects(setupManagedInstallation("unused", {}), /Lizenz/);
  await assert.rejects(
    setupManagedInstallation("unused", { acceptLicenses: true, password: "short" }),
    /Passwort/,
  );
  await assert.rejects(
    setupManagedInstallation("unused", { acceptLicenses: true, password: "long\npassword" }),
    /Passwort/,
  );
});
