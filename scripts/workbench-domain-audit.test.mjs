import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  loadWorkbenchDomainAudit,
  renderWorkbenchDomainAudit,
  runtimeEvidenceSnapshot,
  validateWorkbenchDomainAudit,
} from "./workbench-domain-audit.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const evidencePath = resolve(repositoryRoot, "docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md");
const EXPECTED_VISIBLE_MUTATIONS = {
  "workbench-home": [],
  "workbench-submit": ["submission.create"],
  "workbench-knowledge": [],
  "workbench-search": [],
  "workbench-agent": ["agent.ask", "agent.scope", "agent.cancel"],
  "workbench-my-submissions": [],
  "workbench-tasks": ["tasks.create", "tasks.update", "tasks.delete", "tasks.status", "tasks.progress", "tasks.tags", "tasks.link", "tasks.unlink"],
  "workbench-boards": ["tasks.status"],
  "workbench-settings": [],
  "workbench-admin": [],
  "workbench-admin-submissions": [],
  "workbench-admin-duplicates": ["duplicates.decide"],
  "workbench-admin-assets": ["assets.retry"],
  "workbench-admin-members": ["members.status"],
  "workbench-admin-roles": ["roles.create", "roles.update", "roles.assign", "roles.unassign"],
  "workbench-admin-menus": ["menus.update", "menus.delete"],
  "workbench-admin-spaces": ["spaces.create"],
  "workbench-admin-audit": [],
  "workbench-admin-analytics": [],
  "workbench-notifications": ["notifications.read", "notifications.bulk-read"],
  "workbench-messages": [],
  "workbench-knowledge-reader": ["favorites.add", "favorites.remove", "notes.save", "notes.share", "notes.revoke-share"],
  "workbench-message-thread": ["discussions.send"],
  "workbench-admin-submission-detail": ["review.publish", "review.request-revision", "review.reject", "review.comment"],
};

test("every maturity capability has one conservative domain audit record", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const declaredMutationFacts = [...new Set(Object.values(EXPECTED_VISIBLE_MUTATIONS).flat())].sort();
  assert.deepEqual(Object.keys(runtimeEvidenceSnapshot().mutations).sort(), declaredMutationFacts, "declared visible mutation facts and runtime bindings must remain one-to-one");
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
    assert.deepEqual(record.mutationFactIds, EXPECTED_VISIBLE_MUTATIONS[record.id], `${record.id}: visible mutation inventory drifted`);
    if (record.ownerPredicate !== null) {
      assert.match(record.ownerPredicate, /authenticated (?:member\.memberId|scope\.memberId|actorMemberId)/u);
      assert.ok(record.backendEvidence.some((path) => path.startsWith("src/")), `${record.id}: runtime owner evidence required`);
    }
  }
});

test("validation rejects fabricated API and imaginary owner linkage", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const record = audit.find((item) => item.id === "workbench-home");
  assert.ok(record);

  assert.throws(
    () => validateWorkbenchDomainAudit([{ ...record, persistencePaths: ["migrations/does-not-exist.sql"] }], { repositoryRoot }),
    /missing evidence path/u,
  );
  assert.throws(
    () => validateWorkbenchDomainAudit([{ ...record, apiPaths: ["/api/does-not-exist"] }], { repositoryRoot }),
    /unknown API evidence/u,
  );
  assert.throws(
    () => validateWorkbenchDomainAudit([{ ...record, ownerPredicate: "imaginary.memberId reaches imaginary_table.member_id" }], { repositoryRoot }),
    /owner evidence contradiction/u,
  );
});

test("validation rejects contradictory mutation safety and unsupported pagination", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const submit = audit.find((item) => item.id === "workbench-submit");
  const home = audit.find((item) => item.id === "workbench-home");
  assert.ok(submit && home);

  const safetyRuntime = runtimeEvidenceSnapshot();
  safetyRuntime.mutations["submission.create"] = {
    ...safetyRuntime.mutations["submission.create"],
    strategy: "conditional_write",
  };
  assert.throws(
    () => validateWorkbenchDomainAudit([submit], { repositoryRoot, runtimeEvidence: safetyRuntime }),
    /mutation strategy evidence contradiction/u,
  );

  const paginationRuntime = runtimeEvidenceSnapshot();
  paginationRuntime.apis["/api/knowledge/recent"] = {
    ...paginationRuntime.apis["/api/knowledge/recent"],
    pagination: "numbered",
  };
  assert.throws(
    () => validateWorkbenchDomainAudit([home], { repositoryRoot, runtimeEvidence: paginationRuntime }),
    /pagination evidence contradiction/u,
  );
});

test("Markdown rendering is deterministic and follows maturity route order", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const first = renderWorkbenchDomainAudit(audit);
  const second = renderWorkbenchDomainAudit([...audit].reverse());
  assert.equal(first, second);
  assert.match(first, /^# Workbench R0 Domain Audit\n/u);
  assert.match(first, /\| Capability \| Route \| API and pagination \| Persistence \| Owner predicate \| Mutation safety \| Test evidence \| Classification \| Gaps \|/u);
  assert.match(first, /\/api\/knowledge\/recent \(cursor\)/u);
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
