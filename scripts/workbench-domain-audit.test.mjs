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
    assert.ok(Array.isArray(record.mutationFactIds), `${record.id}: source-derived mutation inventory missing`);
    if (record.ownerPredicate !== null) {
      assert.match(record.ownerPredicate, /authenticated (?:member\.memberId|scope\.memberId|actorMemberId)/u);
      assert.ok(record.backendEvidence.some((path) => path.startsWith("src/")), `${record.id}: runtime owner evidence required`);
    }
  }
});

test("validation rejects fabricated API reusing a real route token and imaginary owner using unrelated symbols", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const record = audit.find((item) => item.id === "workbench-home");
  assert.ok(record);

  assert.throws(
    () => validateWorkbenchDomainAudit([{ ...record, persistencePaths: ["migrations/does-not-exist.sql"] }], { repositoryRoot }),
    /missing evidence path/u,
  );
  assert.throws(
    () => {
      const fabricated = runtimeEvidenceSnapshot({ repositoryRoot });
      fabricated.apis["/api/fabricated"] = { ...fabricated.apis["/api/knowledge/recent"], path: "/api/fabricated" };
      validateWorkbenchDomainAudit([{ ...record, apiPaths: ["/api/fabricated"] }], { repositoryRoot, runtimeEvidence: fabricated });
    },
    /runtime evidence contradiction|unknown API evidence/u,
  );
  assert.throws(
    () => {
      const fabricated = runtimeEvidenceSnapshot({ repositoryRoot });
      fabricated.owners["imaginary.memberId reaches imaginary_table.member_id"] = {
        predicate: "imaginary.memberId reaches imaginary_table.member_id",
        bindings: [
          { path: "src/routes/tasks.ts", symbol: "routeTasksApi", tokens: ["member.memberId"] },
          { path: "src/tasks/repository.ts", symbol: "TasksRepository.compareAndSetStatus", tokens: ["member_id = ?"] },
        ],
      };
      validateWorkbenchDomainAudit([{ ...record, ownerPredicate: "imaginary.memberId reaches imaginary_table.member_id" }], { repositoryRoot, runtimeEvidence: fabricated });
    },
    /runtime evidence contradiction|owner evidence contradiction/u,
  );
});

test("validation rejects roles.update conditional safety borrowed from unrelated task status", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const roles = audit.find((item) => item.id === "workbench-admin-roles");
  assert.ok(roles);

  const safetyRuntime = runtimeEvidenceSnapshot();
  safetyRuntime.mutations["PATCH /api/admin/roles/:id"] = {
    ...safetyRuntime.mutations["PATCH /api/admin/roles/:id"],
    strategy: "conditional_write",
    safety: { path: "src/tasks/repository.ts", symbol: "TasksRepository.compareAndSetStatus", tokens: ["expectedStatus"] },
  };
  assert.throws(
    () => validateWorkbenchDomainAudit([roles], { repositoryRoot, runtimeEvidence: safetyRuntime }),
    /runtime evidence contradiction|mutation strategy evidence contradiction/u,
  );
});

test("validation rejects removing source-visible roles.update from the capability", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const roles = audit.find((item) => item.id === "workbench-admin-roles");
  assert.ok(roles);
  assert.ok(roles.mutationFactIds.includes("PATCH /api/admin/roles/:id"));
  assert.throws(
    () => validateWorkbenchDomainAudit([{ ...roles, mutationFactIds: roles.mutationFactIds.filter((id) => id !== "PATCH /api/admin/roles/:id") }], { repositoryRoot }),
    /visible mutation inventory contradiction/u,
  );
});

test("validation rejects unsupported pagination", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const home = audit.find((item) => item.id === "workbench-home");
  assert.ok(home);
  const paginationRuntime = runtimeEvidenceSnapshot();
  paginationRuntime.apis["/api/knowledge/recent"] = {
    ...paginationRuntime.apis["/api/knowledge/recent"],
    pagination: "numbered",
  };
  assert.throws(
    () => validateWorkbenchDomainAudit([home], { repositoryRoot, runtimeEvidence: paginationRuntime }),
    /runtime evidence contradiction|pagination evidence contradiction/u,
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
