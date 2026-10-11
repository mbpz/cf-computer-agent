#!/usr/bin/env node
/**
 * LOCAL ONLY — remove the rows created by the acceptance kit from the local D1.
 *
 * Deletes run in the foreign-key-safe order learned the hard way in the multi-member
 * isolation sweep (which first failed with SQLITE_CONSTRAINT_FOREIGNKEY):
 *
 *   private_note_shares -> private_notes -> knowledge_favorite_operation_receipts ->
 *   knowledge_favorites -> (knowledge_items.current_revision_id = NULL) -> chunks ->
 *   revisions -> knowledge_items -> source_versions -> sources -> submissions ->
 *   probe menus -> role_members -> auth_sessions -> members
 *
 * The seed-owned id sets are captured with one read first (so the order of the deletes
 * cannot invalidate the subqueries), then the deletes use literal id lists. Everything is
 * scoped to the synthetic `acceptance-…` ids and the seeded member ids, so unrelated local
 * data is untouched. Uses `npx wrangler d1 execute … --local` only: no remote D1, no
 * deploy, no secrets. Prints a residual-count check (all zero) and exits non-zero on any
 * residual.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE = "memory-garden-control-plane";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SEED_IDS_SQL = "('acceptance-admin', 'acceptance-contributor-1', 'acceptance-contributor-2')";
const PROBE_MENU_LIKE = "'acceptance-probe%'";

function sqlString(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

// `IN (NULL)` matches nothing, so an empty id list is a safe no-op.
function inList(ids) {
  return ids.length === 0 ? "(NULL)" : `(${ids.map(sqlString).join(", ")})`;
}

function d1Execute(sql) {
  return execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DATABASE, "--local", "--command", sql, "--json"],
    { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function d1Rows(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const container = Array.isArray(parsed) ? parsed : [parsed];
  const rows = [];
  for (const entry of container) {
    if (entry && Array.isArray(entry.results)) rows.push(...entry.results);
  }
  return rows;
}

function captureIds() {
  const itemPredicate = `id LIKE 'acceptance-%' OR id IN (SELECT knowledge_item_id FROM revisions WHERE published_by IN ${SEED_IDS_SQL})`;
  const capture = [
    `SELECT 'note' AS kind, id AS id FROM private_notes WHERE owner_member_id IN ${SEED_IDS_SQL}`,
    `SELECT 'item' AS kind, id AS id FROM knowledge_items WHERE ${itemPredicate}`,
    `SELECT 'revision' AS kind, id AS id FROM revisions WHERE published_by IN ${SEED_IDS_SQL} OR knowledge_item_id IN (SELECT id FROM knowledge_items WHERE ${itemPredicate})`,
    `SELECT 'source' AS kind, id AS id FROM sources WHERE owner_id IN ${SEED_IDS_SQL} OR id LIKE 'acceptance-%'`,
    `SELECT 'submission' AS kind, id AS id FROM submissions WHERE submitter_id IN ${SEED_IDS_SQL} OR id LIKE 'acceptance-%'`,
  ].join(";\n");

  const byKind = { note: [], item: [], revision: [], source: [], submission: [] };
  for (const row of d1Rows(d1Execute(capture))) {
    if (byKind[row.kind]) byKind[row.kind].push(row.id);
  }
  return byKind;
}

function main() {
  const ids = captureIds();
  const notes = inList(ids.note);
  const items = inList(ids.item);
  const revisions = inList(ids.revision);
  const sources = inList(ids.source);
  const submissions = inList(ids.submission);
  const seedIds = SEED_IDS_SQL;

  // [display name, DELETE statement, residual COUNT filter]
  const steps = [
    ["private_note_shares",
      `DELETE FROM private_note_shares WHERE recipient_member_id IN ${seedIds} OR note_id IN ${notes}`,
      `recipient_member_id IN ${seedIds} OR note_id IN ${notes}`],
    ["private_notes",
      `DELETE FROM private_notes WHERE id IN ${notes}`,
      `id IN ${notes}`],
    ["knowledge_favorite_operation_receipts",
      `DELETE FROM knowledge_favorite_operation_receipts WHERE member_id IN ${seedIds}`,
      `member_id IN ${seedIds}`],
    ["knowledge_favorites",
      `DELETE FROM knowledge_favorites WHERE member_id IN ${seedIds} OR knowledge_item_id IN ${items}`,
      `member_id IN ${seedIds} OR knowledge_item_id IN ${items}`],
    ["knowledge_items.current_revision_id=NULL",
      `UPDATE knowledge_items SET current_revision_id = NULL WHERE id IN ${items}`,
      null],
    ["chunks",
      `DELETE FROM chunks WHERE revision_id IN ${revisions}`,
      `revision_id IN ${revisions}`],
    ["revisions",
      `DELETE FROM revisions WHERE id IN ${revisions}`,
      `id IN ${revisions}`],
    ["knowledge_items",
      `DELETE FROM knowledge_items WHERE id IN ${items}`,
      `id IN ${items}`],
    ["source_versions",
      `DELETE FROM source_versions WHERE source_id IN ${sources} OR submission_id IN ${submissions}`,
      `source_id IN ${sources} OR submission_id IN ${submissions}`],
    ["sources",
      `DELETE FROM sources WHERE id IN ${sources}`,
      `id IN ${sources}`],
    ["submissions",
      `DELETE FROM submissions WHERE id IN ${submissions}`,
      `id IN ${submissions}`],
    ["menus (probe)",
      `DELETE FROM menus WHERE key LIKE ${PROBE_MENU_LIKE}`,
      `key LIKE ${PROBE_MENU_LIKE}`],
    ["role_members",
      `DELETE FROM role_members WHERE member_id IN ${seedIds}`,
      `member_id IN ${seedIds}`],
    ["auth_sessions",
      `DELETE FROM auth_sessions WHERE member_id IN ${seedIds}`,
      `member_id IN ${seedIds}`],
    ["members",
      `DELETE FROM members WHERE id IN ${seedIds}`,
      `id IN ${seedIds}`],
  ];

  d1Execute(steps.map(([, statement]) => statement).join(";\n"));

  const countSelects = steps
    .filter(([, , filter]) => filter)
    .map(([name, , filter]) => `SELECT ${sqlString(name)} AS table_name, count(*) AS residual FROM ${name.split(/[\s.(]/u)[0]} WHERE ${filter}`);
  const counts = d1Rows(d1Execute(countSelects.join(";\n")));

  console.log(`Cleanup deletes applied (FK-safe order). Captured seed ids: ${ids.note.length} note(s), ${ids.item.length} item(s), ${ids.revision.length} revision(s), ${ids.source.length} source(s), ${ids.submission.length} submission(s).`);
  console.log("\nResidual counts:");
  let nonzero = 0;
  for (const row of counts) {
    const residual = Number(row.residual);
    if (residual !== 0) nonzero += 1;
    console.log(`  ${String(row.table_name).padEnd(40)} ${residual}`);
  }
  if (counts.length === 0) {
    console.log("  (no rows returned; inspect with `npx wrangler d1 execute … --local`)");
  }

  if (nonzero > 0) {
    console.error(`\nFAIL: ${nonzero} table(s) still have synthetic residual rows.`);
    process.exitCode = 1;
    return;
  }
  console.log("\nPASS: all residual counts are zero.");
}

try {
  main();
} catch (error) {
  const stderr = error && typeof error === "object" && "stderr" in error && error.stderr ? String(error.stderr) : "";
  console.error("cleanup-local-members failed.");
  if (stderr) console.error(stderr.trim());
  console.error(error instanceof Error ? error.message : String(error));
  console.error("Ensure `wrangler dev` is not running against the same local D1.");
  process.exitCode = 1;
}
