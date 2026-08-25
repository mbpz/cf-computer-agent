import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";

const migrations = [
  ["0001_phase1_control_plane.sql", "3218f4f3d7a285eb3ee9a4f3a07efa6136c350cc3956564759dbed18f180a929"],
  ["0002_github_auth.sql", "b7dd6aac5cfa4f38aac8b242a3d06d787ec202ec64d09ae4ae3d8ec68d384fc1"],
  ["0003_m1_knowledge_loop.sql", "cfbccb43485043ad2d125f0e6b8238b1e311c18abe12ddeb6bcc8b79e4bb74a3"],
  ["0004_m1_gate_completion.sql", "ebda7d5e04fbded4a2503c28a44160325fefcaef4b354a8e25865d68f1ec81bb"],
  ["0005_m2_asset_ingestion.sql", "49a215ee9af462235989217ec365bacb1adfebb2e585df2ec31fbcdb5180667c"],
  ["0006_m2_source_reparse.sql", "fd77510c130d08650de95fa28a2434158ca0a489dd292c490dfe6460c31dcaff"],
  ["0007_m2_chunk_locations.sql", "0c000b8a2da9c96120d963c290c209dc6dc18a0f42853131d0e7e551c83d50c8"],
  ["0008_m2_parent_chunks.sql", "b9f524d90e2614571178ecb63b2d3386c06ee7936b4662c49b28ca37d9ff5205"],
  ["0009_m2_chunk_status.sql", "072d6ba8a9e0661ce5e1031b841fa8f2766f38f56eb94e41d1da22695840acff"],
  ["0010_m2_chunk_metadata.sql", "c4c593c5496adf06f24d3c7671a758331db660dd35e947ec121b5d7b7132d79b"],
];
const repositoryRoot = new URL("../", import.meta.url);
const maxLedgerBytes = 64 * 1024;

async function verifyFiles() {
  const expectedNames = migrations.map(([name]) => name);
  const actualNames = (await readdir(new URL("migrations/", repositoryRoot))).sort();
  if (actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new Error("Local migration files do not match the reviewed state");
  }
  for (const [name, expectedHash] of migrations) {
    const bytes = await readFile(new URL(`migrations/${name}`, repositoryRoot));
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== expectedHash) throw new Error("Migration checksum mismatch");
  }
  console.log(`[pass] migration-files count=${migrations.length}`);
}

async function verifyLedger(phase, path) {
  if (!path) throw new Error("Missing ledger path");
  const information = await stat(path);
  if (!information.isFile() || information.size <= 0 || information.size > maxLedgerBytes) {
    throw new Error("Invalid ledger file");
  }
  const parsed = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isRecord(parsed[0])) {
    throw new Error("Invalid Wrangler ledger result");
  }
  const result = parsed[0];
  if (result.success !== true || !Array.isArray(result.results)) {
    throw new Error("Unsuccessful Wrangler ledger result");
  }
  const expectedNames = phase === "before"
    ? [migrations.slice(0, 3).map(([name]) => name)]
    : [
      migrations.slice(0, 4).map(([name]) => name),
      migrations.slice(0, 5).map(([name]) => name),
      migrations.slice(0, 6).map(([name]) => name),
      migrations.map(([name]) => name),
    ];
  const names = result.results.map((row, index) => {
    if (!isRecord(row)
      || !hasExactKeys(row, ["applied_at", "id", "name"])
      || row.id !== index + 1
      || typeof row.name !== "string"
      || typeof row.applied_at !== "string"
      || row.applied_at.length === 0) {
      throw new Error("Invalid migration ledger row");
    }
    return row.name;
  });
  const matches = expectedNames.some((candidate) => candidate.length === names.length
    && candidate.every((name, index) => name === names[index]));
  if (!matches) {
    throw new Error("Migration ledger does not match the reviewed state");
  }
  console.log(`[pass] migration-ledger phase=${phase} names=${names.join(",")}`);
}

async function verifyLegacyPending(path) {
  if (!path) throw new Error("Missing legacy-pending result path");
  const information = await stat(path);
  if (!information.isFile() || information.size <= 0 || information.size > maxLedgerBytes) {
    throw new Error("Invalid legacy-pending result file");
  }
  const parsed = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(parsed) || parsed.length !== 1 || !isRecord(parsed[0])) {
    throw new Error("Invalid legacy-pending result");
  }
  const result = parsed[0];
  if (result.success !== true || !Array.isArray(result.results) || result.results.length !== 1
    || !isRecord(result.results[0])
    || !hasExactKeys(result.results[0], ["legacy_review_pending_without_source_versions"])
    || result.results[0].legacy_review_pending_without_source_versions !== 0) {
    throw new Error("Legacy review_pending submissions block M1 migration");
  }
  console.log("[pass] legacy-pending count=0");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

try {
  const [mode, path, ...extra] = process.argv.slice(2);
  if (extra.length > 0) throw new Error("Unexpected arguments");
  if (mode === "--files" && path === undefined) {
    await verifyFiles();
  } else if (mode === "--ledger-before" && path !== undefined) {
    await verifyLedger("before", path);
  } else if (mode === "--ledger-after" && path !== undefined) {
    await verifyLedger("after", path);
  } else if (mode === "--legacy-pending" && path !== undefined) {
    await verifyLegacyPending(path);
  } else {
    throw new Error("Invalid verifier mode");
  }
} catch {
  const mode = process.argv[2] === "--files"
    ? "migration-files"
    : process.argv[2] === "--legacy-pending" ? "legacy-pending" : "migration-ledger";
  console.error(`[fail] ${mode}`);
  process.exitCode = 1;
}
