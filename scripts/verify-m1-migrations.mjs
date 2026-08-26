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
  ["0011_m4_saved_views.sql", "f0f8c000dd8e0d41f5defdd4496e52080fa58f6ac3f672baa813cef8edbce688"],
  ["0012_m5_private_notes.sql", "f9dbb34250383552ffbe0e4b80cff5d57f4694c5a1f25ad4c7000ee9d44e88b0"],
  ["0013_m6_research_reports.sql", "67c93f32c7c1615bf7dd098ac1fe9ccfa3a34aee057eb83576ecc833108e1286"],
  ["0014_m6_research_run_plan.sql", "de06a3f61af248a62e3ac69da92cef9c7693366b684f6105e65997389c69ad46"],
  ["0015_m6_research_plan_steps.sql", "9b58938e273178a8136b486360f34947fa698d758e6e2fc23231f91205c8010f"],
  ["0016_m6_research_subquestions.sql", "4fe59d01b5514943421de346edd826f29bae00dc9b757a1ba3260e6f2ba70508"],
  ["0017_m6_research_queries.sql", "67a6981a008100216b79a0070b5819d63e9578bf00f52c88f33f2287427a32b6"],
  ["0018_m6_research_quota.sql", "6401a2b1500016f1a3316ea0c96d8d777aa562125401a593961d425aa70bc64d"],
  ["0019_m5_chat_conversations.sql", "4930029c6987c648674edc6f977d1792e8ed967468afe0057a92d185c33fad5b"],
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
