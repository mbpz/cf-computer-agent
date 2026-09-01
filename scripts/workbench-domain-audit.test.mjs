import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

function withRepositoryProbe(relativePath, transform, assertion) {
  const probeRoot = mkdtempSync(resolve(tmpdir(), "workbench-domain-audit-"));
  try {
    cpSync(resolve(repositoryRoot, "frontend"), resolve(probeRoot, "frontend"), { recursive: true });
    cpSync(resolve(repositoryRoot, "shared"), resolve(probeRoot, "shared"), { recursive: true });
    mkdirSync(resolve(probeRoot, "src"), { recursive: true });
    cpSync(resolve(repositoryRoot, "src/routes"), resolve(probeRoot, "src/routes"), { recursive: true });
    const probePath = resolve(probeRoot, relativePath);
    const original = readFileSync(probePath, "utf8");
    const transformed = transform(original);
    assert.notEqual(transformed, original, `${relativePath}: adversarial transform must change the fixture`);
    writeFileSync(probePath, transformed);
    return assertion(probeRoot);
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
}
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
  safetyRuntime.mutations["workbench-admin-roles"]["PATCH /api/admin/roles/:id"] = {
    ...safetyRuntime.mutations["workbench-admin-roles"]["PATCH /api/admin/roles/:id"],
    strategy: "conditional_write",
    safety: { path: "src/tasks/repository.ts", symbol: "TasksRepository.compareAndSetStatus", tokens: ["expectedStatus"] },
  };
  assert.throws(
    () => validateWorkbenchDomainAudit([roles], { repositoryRoot, runtimeEvidence: safetyRuntime }),
    /runtime evidence contradiction|mutation strategy evidence contradiction/u,
  );
});

test("source-bound replay strategies prove duplicate decisions and notification reads", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const expected = {
    "POST /api/admin/duplicates/:submissionId/decision": {
      capability: "workbench-admin-duplicates",
      strategy: "conditional_write",
      source: { path: "src/duplicates/repository.ts", symbol: "DuplicateCandidatesRepository.decide" },
      testPath: "test/worker/submissions.test.ts",
    },
    "POST /api/notifications/:id/read": {
      capability: "workbench-notifications",
      strategy: "conditional_write",
      source: { path: "src/notifications/repository.ts", symbol: "NotificationsRepository.markRead" },
      testPath: "test/worker/notifications.test.ts",
    },
    "POST /api/notifications/read": {
      capability: "workbench-notifications",
      strategy: "conditional_write",
      source: { path: "src/notifications/repository.ts", symbol: "NotificationsRepository.markManyRead" },
      testPath: "test/worker/notifications.test.ts",
    },
  };

  for (const [operation, policy] of Object.entries(expected)) {
    const record = audit.find((item) => item.id === policy.capability);
    const fact = record?.mutationEvidence[operation];
    assert.ok(fact, `${operation}: mutation fact is required`);
    assert.equal(fact.strategy, policy.strategy, `${operation}: proven strategy must not fall back to gap`);
    assert.deepEqual(
      { path: fact.safety.path, symbol: fact.safety.symbol },
      policy.source,
      `${operation}: strategy must bind the exact source symbol`,
    );
    assert.ok(fact.tests.some((binding) => binding.path === policy.testPath), `${operation}: exact regression test binding is required`);
  }
});

test("a proven declaration cannot silently lose its structured strategy binding", () => {
  withRepositoryProbe("shared/workbench-maturity-capabilities.ts", (source) => source.replace(
    'operation: "POST /api/admin/duplicates/:submissionId/decision"',
    'operation: "POST /api/admin/duplicates/:submissionId/unrelated"',
  ), (probeRoot) => {
    assert.throws(
      () => runtimeEvidenceSnapshot({ repositoryRoot: probeRoot }),
      /proven mutation declaration requires structured strategy binding.*duplicates.*decision/u,
    );
  });
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

test("role detail route methods and pagination are isolated to the exact regex branch", () => {
  const evidence = runtimeEvidenceSnapshot({ repositoryRoot });
  assert.deepEqual(evidence.apis["/api/admin/roles/:id"].methods, ["DELETE", "PATCH"]);
  assert.equal(evidence.apis["/api/admin/roles/:id"].pagination, "not_applicable");
  assert.deepEqual(evidence.apis["/api/admin/roles/:id/members"].methods, ["DELETE", "POST"]);
});

test("validation rejects collection methods borrowed by the role detail branch", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const roles = audit.find((item) => item.id === "workbench-admin-roles");
  assert.ok(roles);
  const contaminated = runtimeEvidenceSnapshot({ repositoryRoot });
  contaminated.apis["/api/admin/roles/:id"] = {
    ...contaminated.apis["/api/admin/roles/:id"],
    methods: ["DELETE", "GET", "PATCH", "POST"],
  };
  assert.throws(
    () => validateWorkbenchDomainAudit([roles], { repositoryRoot, runtimeEvidence: contaminated }),
    /runtime evidence contradiction/u,
  );
});

test("current frontend ownership discovers the required visible mutation minimum", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const expected = {
    "workbench-agent": ["PATCH /api/knowledge/chat/conversations/:id/scope", "POST /api/knowledge/chat", "POST /api/knowledge/chat/conversations/:id/cancel"],
    "workbench-tasks": ["DELETE /api/tasks/:id", "DELETE /api/tasks/:id/links/:linkId", "PATCH /api/tasks/:id", "POST /api/tasks", "POST /api/tasks/:id/links", "POST /api/tasks/:id/progress", "POST /api/tasks/:id/status", "PUT /api/tasks/:id/tags"],
    "workbench-admin-duplicates": ["POST /api/admin/duplicates/:submissionId/decision"],
    "workbench-admin-members": ["PATCH /api/admin/members/:id/status"],
    "workbench-admin-roles": ["DELETE /api/admin/roles/:id/members", "PATCH /api/admin/roles/:id", "POST /api/admin/roles", "POST /api/admin/roles/:id/members"],
  };
  for (const [id, operations] of Object.entries(expected)) {
    assert.deepEqual(audit.find((record) => record.id === id)?.mutationFactIds, operations, `${id}: visible mutation inventory incomplete`);
  }
});

test("every declared operation has one generated fact for its owning capability", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  for (const record of audit) {
    const declarations = record.mutations.map((declaration) => {
      const match = /^(GET|POST|PUT|PATCH|DELETE) (\/api\/[A-Za-z0-9_/:.-]+(?:#[a-z0-9-]+)?) — (?:proven|gap): /u.exec(declaration);
      assert.ok(match, `${record.id}: mutation declaration must carry one exact operation identity: ${declaration}`);
      return match[1] + " " + match[2];
    });
    assert.deepEqual(
      record.mutationFactIds,
      [...declarations].sort(),
      `${record.id}: every declaration must resolve to one generated fact and vice versa`,
    );
  }
});

test("message-thread send and knowledge-reader visit are independently accounted", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const thread = audit.find((record) => record.id === "workbench-message-thread");
  const reader = audit.find((record) => record.id === "workbench-knowledge-reader");
  assert.ok(thread);
  assert.ok(reader);

  assert.deepEqual(thread.mutationFactIds, ["POST /api/discussions/messages"]);
  assert.equal(thread.mutationEvidence["POST /api/discussions/messages"].strategy, "idempotency_key");

  const visit = reader.mutationEvidence["GET /api/knowledge/:id#record-visit"];
  assert.ok(visit, "reader visit recording requires a generated operation fact distinct from ordinary GET");
  assert.equal(visit.apiPath, "/api/knowledge/:id");
  assert.equal(visit.strategy, "gap");
  assert.deepEqual(
    { path: visit.source.path, symbol: visit.source.symbol },
    { path: "src/routes/library.ts", symbol: "routeLibraryApi" },
  );
  assert.ok(visit.tests.some((binding) => binding.path === "test/worker/recent-visits.test.ts"));
});

test("a missing declared frontend controller root fails closed", () => {
  withRepositoryProbe("frontend/app.tsx", (source) => source.replace(
    "export function DiscussionThreadRoute(",
    "export function RenamedDiscussionThreadRoute(",
  ), (probeRoot) => {
    assert.throws(
      () => runtimeEvidenceSnapshot({ repositoryRoot: probeRoot }),
      /workbench-message-thread: missing frontend operation root.*DiscussionThreadRoute/u,
    );
  });
});

test("an orphan structured strategy binding fails closed", () => {
  withRepositoryProbe("shared/workbench-maturity-capabilities.ts", (source) => source.replace(
    "] as const satisfies readonly WorkbenchMutationStrategyBinding[]);",
    `  {
    capabilityId: "workbench-message-thread",
    operation: "POST /api/discussions/orphan-message",
    strategy: "idempotency_key",
    source: { path: "src/discussions/service.ts", symbol: "DiscussionsService.sendMessage", tokens: ["findMessageByAuthorClientKey"] },
    tests: [{ path: "test/worker/discussions.test.ts", tokens: ["sends idempotently"] }],
  },
] as const satisfies readonly WorkbenchMutationStrategyBinding[]);`,
  ), (probeRoot) => {
    assert.throws(
      () => runtimeEvidenceSnapshot({ repositoryRoot: probeRoot }),
      /structured strategy binding has no generated fact.*orphan-message/u,
    );
  });
});

test("removing role detail API ownership and its mutation cannot bypass source discovery", async () => {
  const audit = await loadWorkbenchDomainAudit({ repositoryRoot });
  const roles = audit.find((item) => item.id === "workbench-admin-roles");
  assert.ok(roles);
  assert.throws(
    () => validateWorkbenchDomainAudit([{
      ...roles,
      apiPaths: roles.apiPaths.filter((path) => path !== "/api/admin/roles/:id"),
      mutationFactIds: roles.mutationFactIds.filter((id) => id !== "PATCH /api/admin/roles/:id"),
    }], { repositoryRoot }),
    /source-visible API ownership contradiction|visible mutation inventory contradiction/u,
  );
});

test("frontend scanner fails closed when request options method is not statically resolved", () => {
  withRepositoryProbe("frontend/lib/agent-data.ts", (source) => source.replace(
    /(  const data = await apiFetch<[^\n]+>\("\/api\/knowledge\/chat", )(\{[\s\S]*?^  \}\);)/mu,
    (_, callPrefix, inlineOptions) => `  const requestOptions = ${inlineOptions.slice(0, -2)};\n${callPrefix}requestOptions);`,
  ), (probeRoot) => {
    assert.throws(
      () => runtimeEvidenceSnapshot({ repositoryRoot: probeRoot }),
      /unsupported frontend mutation invocation.*requestOptions/u,
    );
  });
});

test("frontend scanner preserves no-options GET and inline mutation methods", () => {
  withRepositoryProbe("frontend/lib/agent-data.ts", (source) => source.replace(
    "  const data = await apiFetch<{ answer?: unknown;",
    "  void apiFetch(\"/api/knowledge/recent\");\n  const data = await apiFetch<{ answer?: unknown;",
  ), (probeRoot) => {
    const evidence = runtimeEvidenceSnapshot({ repositoryRoot: probeRoot });
    assert.ok(evidence.mutations["workbench-agent"]["POST /api/knowledge/chat"]);
    assert.equal(evidence.mutations["workbench-agent"]["GET /api/knowledge/recent"], undefined);
  });
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
