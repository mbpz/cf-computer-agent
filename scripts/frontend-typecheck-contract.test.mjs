import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const compiler = resolve(root, "node_modules/.bin/tsc");
const run = (...args) => spawnSync(compiler, args, { cwd: root, encoding: "utf8", timeout: 30_000 });
const shown = run("--project", "tsconfig.frontend.json", "--showConfig");
assert.equal(shown.status, 0, shown.stdout + shown.stderr);
const config = JSON.parse(shown.stdout);

test("front-end type gate includes every first-party TS and TSX source, including disconnected components", () => {
  function walk(path) {
    return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
      const next = join(path, entry.name);
      return entry.isDirectory() ? entry.name === "dist" ? [] : walk(next) : /\.tsx?$/u.test(entry.name) ? [next] : [];
    });
  }
  const included = new Set(config.files.map(file => resolve(root, file)));
  for (const file of walk(resolve(root, "frontend"))) assert.ok(included.has(file), `Not typechecked: ${file}`);
  assert.ok(included.has(resolve(root, "frontend/components/shell/context-rail.tsx")));
});

test("default typecheck and check retain Worker checks and require the full strict browser gate", () => {
  const scripts = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).scripts;
  assert.equal(scripts.typecheck, "npm run typecheck:worker && npm run typecheck:frontend");
  assert.equal(scripts["typecheck:worker"], "tsc --noEmit");
  assert.equal(scripts["typecheck:frontend"], "tsc --project tsconfig.frontend.json");
  assert.ok(scripts.check.includes("npm run typecheck &&"));
  assert.ok(scripts["test:smoke"].includes("scripts/frontend-typecheck-contract.test.mjs"));
  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.noEmit, true);
  assert.ok(config.compilerOptions.lib.includes("dom"));
  assert.ok(config.compilerOptions.lib.includes("dom.iterable"));
  assert.ok(config.compilerOptions.types.includes("vite/client"));
});

test("browser gate rejects a concrete nullability defect without emitting JS", () => {
  const directory = mkdtempSync(join(tmpdir(), "frontend-type-gate-"));
  try {
    writeFileSync(join(directory, "probe.tsx"), "const node: HTMLElement = null; export { node };\n");
    writeFileSync(join(directory, "tsconfig.json"), JSON.stringify({
      extends: resolve(root, "tsconfig.frontend.json"),
      compilerOptions: { types: [] },
      include: ["probe.tsx"],
      exclude: [],
    }));
    const result = run("--project", join(directory, "tsconfig.json"));
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /TS2322/u);
    assert.match(result.stdout, /null/u);
    assert.deepEqual(readdirSync(directory).sort(), ["probe.tsx", "tsconfig.json"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
