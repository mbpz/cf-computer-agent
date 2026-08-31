import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  loadWorkbenchDomainAudit,
  renderWorkbenchDomainAudit,
  validateWorkbenchDomainAudit,
} from "./workbench-domain-audit.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const evidencePath = resolve(repositoryRoot, "docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md");

test("every maturity capability has one conservative domain audit record", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  assert.equal(audit.length, 24);
  assert.equal(new Set(audit.map((record) => record.id)).size, 24);

  for (const record of audit) {
    for (const path of [
      ...record.frontendEvidence,
      ...record.backendEvidence,
      ...record.testEvidence,
      ...record.persistencePaths,
    ]) {
      assert.equal(existsSync(resolve(repositoryRoot, path)), true, `${record.id}: missing ${path}`);
    }
    if (record.mutations.length > 0) {
      assert.notEqual(record.mutationSafety, "not_applicable", `${record.id}: mutation safety missing`);
      assert.ok(
        record.mutations.every((mutation) => / — (?:proven|gap):/u.test(mutation)),
        `${record.id}: each mutation must distinguish proven safety from a gap`,
      );
    } else {
      assert.equal(record.mutationSafety, "not_applicable", `${record.id}: safety without a mutation`);
    }
    if (record.ownerPredicate !== null) {
      assert.match(record.ownerPredicate, /authenticated (?:member\.memberId|scope\.memberId|actorMemberId)/u);
      assert.ok(record.backendEvidence.some((path) => path.startsWith("src/")), `${record.id}: runtime owner evidence required`);
    }
  }
});

test("validation fails closed for missing, contradictory, and migration-only evidence", async () => {
  const [record] = await loadWorkbenchDomainAudit({ repositoryRoot });
  assert.ok(record);

  assert.throws(
    () => validateWorkbenchDomainAudit([{ ...record, persistencePaths: ["migrations/does-not-exist.sql"] }], { repositoryRoot }),
    /missing evidence path/u,
  );
  assert.throws(
    () => validateWorkbenchDomainAudit([{ ...record, mutations: ["POST /api/example"], mutationSafety: "not_applicable" }], { repositoryRoot }),
    /mutation safety/u,
  );
  assert.throws(
    () => validateWorkbenchDomainAudit([{ ...record, ownerPredicate: "migrations/0032_workspace_tasks.sql has member_id" }], { repositoryRoot }),
    /authenticated runtime principal/u,
  );
  assert.throws(
    () => validateWorkbenchDomainAudit([{ ...record, dimensions: { ...record.dimensions, api: "proven" }, apiPaths: [] }], { repositoryRoot }),
    /proven api dimension/u,
  );
  assert.throws(
    () => validateWorkbenchDomainAudit([{
      ...record,
      mutations: ["POST /api/example — gap: no key is present"],
      mutationSafety: "idempotency_key",
    }], { repositoryRoot }),
    /claims idempotency_key without proven mutation evidence/u,
  );
});

test("Markdown rendering is deterministic and follows maturity route order", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const first = renderWorkbenchDomainAudit(audit);
  const second = renderWorkbenchDomainAudit([...audit].reverse());
  assert.equal(first, second);
  assert.match(first, /^# Workbench R0 Domain Audit\n/u);
  assert.match(first, /\| Capability \| Route \| API \| Persistence \| Owner predicate \| Pagination \| Mutation safety \| Test evidence \| Classification \| Gaps \|/u);
  assert.ok(first.indexOf("workbench-home") < first.indexOf("workbench-submit"));
  assert.ok(first.indexOf("workbench-messages") < first.indexOf("workbench-message-thread"));
});

test("checked evidence document exactly matches the deterministic generator", () => {
  const result = spawnSync(process.execPath, ["scripts/workbench-domain-audit.mjs", "--check"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.equal(existsSync(evidencePath), true);
});
