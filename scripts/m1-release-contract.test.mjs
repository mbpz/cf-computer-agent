import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const verifierPath = new URL("./verify-m1-migrations.mjs", import.meta.url).pathname;
const runbookPath = new URL("../docs/operations/m1-release.md", import.meta.url);
const packagePath = new URL("../package.json", import.meta.url);
const wranglerPath = new URL("../wrangler.jsonc", import.meta.url);
const expectedMigrations = [
  ["0001_phase1_control_plane.sql", "3218f4f3d7a285eb3ee9a4f3a07efa6136c350cc3956564759dbed18f180a929"],
  ["0002_github_auth.sql", "b7dd6aac5cfa4f38aac8b242a3d06d787ec202ec64d09ae4ae3d8ec68d384fc1"],
  ["0003_m1_knowledge_loop.sql", "17d8ee1f49a0c87d40851a47f70d492617ed0972daeff54becad21a88af57f1d"],
];

function runVerifier(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [verifierPath, ...args], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, output }));
  });
}

function ledger(names) {
  return [{
    results: names.map((name, index) => ({
      id: index + 1,
      name,
      applied_at: `2026-08-${String(19 + index).padStart(2, "0")}T00:00:00.000Z`,
    })),
    success: true,
    meta: { rows_read: names.length, rows_written: 0 },
  }];
}

async function withLedger(value, callback) {
  const directory = await mkdtemp(join(tmpdir(), "m1-ledger-contract-"));
  const path = join(directory, "ledger.json");
  try {
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
    return await callback(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("pins the reviewed bytes of all three forward migrations", async () => {
  for (const [name, expectedHash] of expectedMigrations) {
    const bytes = await readFile(new URL(`../migrations/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expectedHash, name);
  }
  const result = await runVerifier(["--files"]);
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /^\[pass\] migration-files count=3$/mu);
});

test("accepts only the exact pre-0003 and post-0003 Wrangler ledger states", async () => {
  const names = expectedMigrations.map(([name]) => name);
  await withLedger(ledger(names.slice(0, 2)), async (path) => {
    const result = await runVerifier(["--ledger-before", path]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /^\[pass\] migration-ledger phase=before names=0001_phase1_control_plane.sql,0002_github_auth.sql$/mu);
  });
  await withLedger(ledger(names), async (path) => {
    const result = await runVerifier(["--ledger-after", path]);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /^\[pass\] migration-ledger phase=after names=0001_phase1_control_plane.sql,0002_github_auth.sql,0003_m1_knowledge_loop.sql$/mu);
  });
});

test("fails closed on missing, renamed, extra, reordered, or malformed ledger rows", async () => {
  const names = expectedMigrations.map(([name]) => name);
  const invalidLedgers = [
    ledger(names.slice(0, 1)),
    ledger([names[0], "0002_changed.sql"]),
    ledger([...names, "0004_unreviewed.sql"]),
    ledger([names[1], names[0]]),
    [{ results: [{ id: 1, name: names[0] }], success: true }],
    [{ results: ledger(names).at(0).results, success: false }],
    { results: [] },
  ];
  for (const value of invalidLedgers) {
    await withLedger(value, async (path) => {
      const before = await runVerifier(["--ledger-before", path]);
      const after = await runVerifier(["--ledger-after", path]);
      assert.equal(before.code, 1, before.output);
      assert.equal(after.code, 1, after.output);
      assert.match(`${before.output}\n${after.output}`, /\[fail\] migration-ledger/u);
      assert.doesNotMatch(`${before.output}\n${after.output}`, /applied_at|rows_read|rows_written/u);
    });
  }
});

test("runbook hard-codes provenance and queries the actual D1 migration ledger", async () => {
  const [runbook, packageJson, wrangler] = await Promise.all([
    readFile(runbookPath, "utf8"),
    readFile(packagePath, "utf8").then(JSON.parse),
    readFile(wranglerPath, "utf8").then(JSON.parse),
  ]);
  for (const [name, hash] of expectedMigrations) {
    assert.match(runbook, new RegExp(`${name.replaceAll(".", "\\.")}[^\\n]*${hash}`, "u"));
  }
  assert.match(runbook, /rtk npm run verify:m1:migrations -- --files/u);
  assert.match(runbook, /rtk npx wrangler d1 execute memory-garden-control-plane --remote --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id" --json > "\$M1_LEDGER_FILE"/u);
  assert.match(runbook, /rtk npm run verify:m1:migrations -- --ledger-before "\$M1_LEDGER_FILE"/u);
  assert.match(runbook, /rtk npm run verify:m1:migrations -- --ledger-after "\$M1_LEDGER_FILE"/u);
  assert.doesNotMatch(runbook, /d1 migrations list/u);
  assert.equal(wrangler.d1_databases[0].database_name, "memory-garden-control-plane");
  assert.equal(wrangler.d1_databases[0].migrations_dir, "migrations");
  assert.equal(wrangler.d1_databases[0].migrations_table, undefined);
  assert.equal(packageJson.scripts["verify:m1:migrations"], "node scripts/verify-m1-migrations.mjs");
  assert.match(packageJson.scripts["test:m1"], /npm run test:ops:m1/u);
  assert.match(packageJson.scripts["test:smoke"], /automation-probe\.test\.mjs/u);
});
