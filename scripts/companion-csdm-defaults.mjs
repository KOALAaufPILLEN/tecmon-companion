// Extract only the default-settings constant from the pinned MIT-licensed CS Demo Manager source.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const source = path.resolve(process.argv[2]);
const cache = new Map();
function load(relative) {
  const file = path.resolve(source, "src", relative + ".ts");
  if (!file.startsWith(path.join(source, "src") + path.sep))
    throw new Error("Invalid settings import");
  if (cache.has(file)) return cache.get(file);
  const text = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const record = { exports: {} };
  cache.set(file, record.exports);
  new Function("require", "module", "exports", text)(
    (name) => {
      const rel = name.startsWith("csdm/")
        ? name.slice(5)
        : path.posix.join(path.posix.dirname(relative), name);
      return load(rel);
    },
    record,
    record.exports,
  );
  return record.exports;
}
fs.writeFileSync(
  process.argv[3],
  JSON.stringify(load("node/settings/default-settings").defaultSettings, null, 2),
);
