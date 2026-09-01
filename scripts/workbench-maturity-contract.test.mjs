import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { API } from "typescript/unstable/sync";
import { NodeFlags } from "typescript/unstable/ast";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isFunctionDeclaration,
  isIdentifier,
  isIfStatement,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isRegularExpressionLiteral,
  isReturnStatement,
  isSatisfiesExpression,
  isStringLiteral,
  isVariableDeclaration,
  isVariableDeclarationList,
} from "typescript/unstable/ast/is";

const repositoryRoot = resolve(import.meta.dirname, "..");
const routeCapabilitiesPath = resolve(repositoryRoot, "shared/workspace-route-capabilities.ts");
const appRoutesPath = resolve(repositoryRoot, "frontend/app-routes.ts");
const maturityCapabilitiesPath = resolve(repositoryRoot, "shared/workbench-maturity-capabilities.ts");
const maturityChecklistPath = resolve(repositoryRoot, "docs/product/workbench-product-maturity-checklist.md");
const maturityGapMatrixPath = resolve(repositoryRoot, "docs/product/workbench-product-maturity-gap-matrix.md");
const domainAuditPath = resolve(repositoryRoot, "docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md");
const deliveryLedgerPath = resolve(repositoryRoot, "docs/product/delivery-status-ledger.md");
const roadmapPath = resolve(repositoryRoot, "ROADMAP.md");
const classifications = new Set(["usable", "partial", "unusable", "pseudo_entry", "unreachable"]);
const dimensions = new Set(["entry", "journey", "api", "persistence", "isolation", "query_or_idempotency", "states", "accessibility", "evidence"]);
const dimensionStates = new Set(["proven", "gap", "not_applicable"]);
const roles = new Set(["anonymous", "contributor", "admin"]);
const ALL_CAPABILITY_IDS = [
  "workbench-home", "workbench-submit", "workbench-knowledge", "workbench-search", "workbench-agent",
  "workbench-my-submissions", "workbench-tasks", "workbench-boards", "workbench-settings", "workbench-admin",
  "workbench-admin-submissions", "workbench-admin-duplicates", "workbench-admin-assets", "workbench-admin-members",
  "workbench-admin-roles", "workbench-admin-menus", "workbench-admin-spaces", "workbench-admin-audit",
  "workbench-admin-analytics", "workbench-notifications", "workbench-messages", "workbench-knowledge-reader",
  "workbench-message-thread", "workbench-admin-submission-detail",
];
const LIST_CAPABILITY_IDS = [
  "workbench-home", "workbench-knowledge", "workbench-search", "workbench-my-submissions", "workbench-tasks",
  "workbench-boards", "workbench-admin-submissions", "workbench-admin-duplicates", "workbench-admin-assets",
  "workbench-admin-members", "workbench-admin-roles", "workbench-admin-menus", "workbench-admin-spaces",
  "workbench-admin-audit", "workbench-admin-analytics", "workbench-notifications", "workbench-messages",
  "workbench-message-thread",
];
const MUTATION_CAPABILITY_IDS = [
  "workbench-submit", "workbench-search", "workbench-agent", "workbench-tasks", "workbench-boards",
  "workbench-admin-submissions", "workbench-admin-duplicates", "workbench-admin-assets", "workbench-admin-members",
  "workbench-admin-roles", "workbench-admin-menus", "workbench-admin-spaces", "workbench-notifications",
  "workbench-messages", "workbench-knowledge-reader", "workbench-message-thread", "workbench-admin-submission-detail",
];
const PRIVATE_CAPABILITY_IDS = [
  "workbench-home", "workbench-submit", "workbench-knowledge", "workbench-search", "workbench-agent",
  "workbench-my-submissions", "workbench-tasks", "workbench-boards", "workbench-notifications",
  "workbench-messages", "workbench-knowledge-reader", "workbench-message-thread",
];
const R0_ATOM_POLICIES = new Map([
  ["R0-001", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { entry: "proven" }, evidenceClasses: ["manifest", "route"] }],
  ["R0-002", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { journey: "gap" }, evidenceClasses: ["manifest", "route", "domain"] }],
  ["R0-003", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { entry: "proven", isolation: "gap" }, evidenceClasses: ["manifest", "route"] }],
  ["R0-004", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { states: "gap" }, evidenceClasses: ["manifest", "route"] }],
  ["R0-005", { capabilityIds: LIST_CAPABILITY_IDS, requiredDimensions: { api: "gap", query_or_idempotency: "gap" }, evidenceClasses: ["manifest", "domain"] }],
  ["R0-006", { capabilityIds: MUTATION_CAPABILITY_IDS, requiredDimensions: { query_or_idempotency: "gap" }, evidenceClasses: ["manifest", "domain"] }],
  ["R0-007", { capabilityIds: PRIVATE_CAPABILITY_IDS, requiredDimensions: { isolation: "gap" }, evidenceClasses: ["manifest", "route", "domain"] }],
  ["R0-008", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { api: "gap", persistence: "gap", isolation: "gap" }, evidenceClasses: ["manifest", "domain"] }],
  ["R0-009", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { evidence: "gap" }, evidenceClasses: ["manifest", "route", "domain", "delivery"] }],
  ["R0-010", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { evidence: "gap" }, evidenceClasses: ["manifest", "domain"] }],
  ["R0-011", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { evidence: "gap" }, evidenceClasses: ["manifest", "delivery"] }],
  ["R0-012", { capabilityIds: ALL_CAPABILITY_IDS, requiredDimensions: { evidence: "gap" }, evidenceClasses: ["manifest", "delivery"] }],
]);
const R0_EVIDENCE_CLASS_PATHS = new Map([
  ["manifest", new Set([
    "shared/workbench-maturity-capabilities.ts", "shared/workspace-route-capabilities.ts", "frontend/app-routes.ts",
    "scripts/workbench-maturity-contract.test.mjs",
  ])],
  ["route", new Set([
    "shared/workspace-route-capabilities.ts", "frontend/app-routes.ts", "test/helpers/workbench-maturity-route-fixtures.ts",
    "test/helpers/authenticated-app-harness.tsx", "test/unit/frontend-workbench-maturity-routes.test.tsx",
  ])],
  ["domain", new Set([
    "shared/workbench-maturity-capabilities.ts", "scripts/workbench-domain-audit.mjs",
    "scripts/workbench-domain-audit.test.mjs", "docs/operations/evidence/2026-08-31-workbench-r0-domain-audit.md",
  ])],
  ["delivery", new Set([
    "docs/product/workbench-product-maturity-checklist.md", "docs/product/delivery-status-ledger.md",
    "docs/product/workbench-product-maturity-gap-matrix.md", "ROADMAP.md",
    "scripts/workbench-maturity-contract.test.mjs", "scripts/delivery-status-contract.test.mjs",
  ])],
]);
const menuRecordKeys = new Set([
  "id", "routeId", "pathname", "requiredRole", "journey", "classification", "dimensions",
  "frontendEvidence", "backendEvidence", "testEvidence", "ledgerIds", "gaps",
]);
const parameterizedRecordKeys = new Set([...menuRecordKeys, "parentRouteId", "routePattern"]);

test("every visible ready route has one maturity capability record", () => {
  const { routes, parameterizedRoutes, maturity } = loadContracts();
  const visible = routes.filter((route) => route.availability === "ready");
  const menuMaturity = maturity.filter((item) => item.routePattern === undefined);
  const parameterizedMaturity = maturity.filter((item) => item.routePattern !== undefined);

  assert.deepEqual(
    menuMaturity.map((item) => item.routeId).sort(),
    visible.map((route) => route.id).sort(),
  );
  assert.deepEqual(
    parameterizedMaturity.map((item) => ({ routeId: item.routeId, routePattern: item.routePattern })).sort(byRouteId),
    parameterizedRoutes.map((route) => ({ routeId: route.routeId, routePattern: route.routePattern })).sort(byRouteId),
  );
});

test("maturity records are structural, complete, and evidence-backed", () => {
  const { routes, parameterizedRoutes, maturity } = loadContracts();
  const routesById = new Map(routes.map((route) => [route.id, route]));
  const parameterizedById = new Map(parameterizedRoutes.map((route) => [route.routeId, route]));
  assert.equal(new Set(maturity.map((item) => item.id)).size, maturity.length, "maturity record ids must be unique");
  assert.equal(new Set(maturity.map((item) => item.routeId)).size, maturity.length, "maturity route ids must be unique");

  for (const record of maturity) {
    assert.ok(record.id.length > 0, "maturity record id is required");
    if (record.routePattern === undefined) {
      assert.ok(routesById.has(record.routeId), `${record.id} has an unknown routeId`);
      assert.equal(record.pathname, routesById.get(record.routeId).path, `${record.id} pathname must match its route`);
      assert.equal(record.parentRouteId, undefined, `${record.id} menu route must not declare a parentRouteId`);
    } else {
      const sourceRoute = parameterizedById.get(record.routeId);
      assert.ok(sourceRoute, `${record.id} has an unknown parameterized routeId`);
      assert.equal(record.routePattern, sourceRoute.routePattern, `${record.id} routePattern must match frontend/app-routes.ts`);
      assert.ok(record.parentRouteId && routesById.has(record.parentRouteId), `${record.id} parameterized route requires a menu parentRouteId`);
      const parentPath = routesById.get(record.parentRouteId).path;
      assert.equal(record.pathname, `${parentPath === "/" ? "" : parentPath}/:id`, `${record.id} pathname must be the parent route template`);
    }
    assert.ok(roles.has(record.requiredRole), `${record.id} has unsupported requiredRole`);
    assert.ok(record.journey.length > 0, `${record.id} journey is required`);
    assert.ok(classifications.has(record.classification), `${record.id} has unsupported classification`);
    assert.deepEqual([...record.dimensions.keys()].sort(), [...dimensions].sort(), `${record.id} must declare every dimension`);

    const evidence = [...record.frontendEvidence, ...record.backendEvidence, ...record.testEvidence];
    for (const [dimension, status] of record.dimensions) {
      assert.ok(dimensionStates.has(status), `${record.id} ${dimension} has unsupported dimension state`);
      if (status === "proven") assert.ok(evidence.length > 0, `${record.id} ${dimension} requires evidence`);
    }
    if ([...record.dimensions.values()].includes("gap")) {
      assert.ok(record.gaps.length > 0, `${record.id} requires gap text for a gap dimension`);
    }
    for (const [name, values] of Object.entries({
      frontendEvidence: record.frontendEvidence,
      backendEvidence: record.backendEvidence,
      testEvidence: record.testEvidence,
      ledgerIds: record.ledgerIds,
    })) {
      assert.ok(values.length > 0, `${record.id} ${name} is required`);
      assert.ok(values.every((value) => value.length > 0), `${record.id} ${name} must contain non-empty strings`);
    }
    assert.ok(record.gaps.every((gap) => gap.length > 0), `${record.id} gaps must contain non-empty strings`);
  }
});

test("AST extraction fails closed on syntax diagnostics and mutable indirection", () => {
  withMaturityFixture(maturityFixture({ trailing: "]" }), (snapshot, path) => {
    assert.throws(
      () => maturityRecords(sourceFile(snapshot, path)),
      /must parse without syntactic diagnostics/u,
    );
  });
  withMaturityFixture(maturityFixture({ declaration: "let" }), (snapshot, path) => {
    assert.throws(
      () => maturityRecords(sourceFile(snapshot, path)),
      /must resolve through a const declaration/u,
    );
  });
});

test("R0 checklist atoms carry four-dimensional evidence without promoting release or acceptance", () => {
  const { maturity } = loadContracts();
  const checklist = readFileSync(maturityChecklistPath, "utf8");
  const ledgerIds = deliveryLedgerIds(readFileSync(deliveryLedgerPath, "utf8"));
  const atoms = r0ChecklistAtoms(checklist);

  assert.deepEqual(
    atoms.map((atom) => atom.id),
    Array.from({ length: 12 }, (_, index) => `R0-${String(index + 1).padStart(3, "0")}`),
    "R0 checklist must contain exactly the twelve canonical atoms in order",
  );
  assert.deepEqual(
    Object.fromEntries(["x", "-", " "].map((marker) => [marker, atoms.filter((atom) => atom.marker === marker).length])),
    { x: 7, "-": 5, " ": 0 },
    "R0 markers must represent local completion independently from release and acceptance",
  );

  for (const atom of atoms) {
    assertR0AtomEvidence(atom, ledgerIds, maturity);
  }
});

test("R0 checklist markers derive only from local implementation and verification", () => {
  const checklist = readFileSync(maturityChecklistPath, "utf8");
  const ledgerIds = deliveryLedgerIds(readFileSync(deliveryLedgerPath, "utf8"));
  const { maturity } = loadContracts();
  const atoms = r0ChecklistAtoms(checklist);
  const locallyDone = atoms.filter((atom) =>
    atom.dimensions.implementation.status === "done" && atom.dimensions.verification.status === "done"
  );
  const locallyPartial = atoms.filter((atom) =>
    [atom.dimensions.implementation.status, atom.dimensions.verification.status].includes("partial")
  );
  const locallyPending = atoms.filter((atom) =>
    [atom.dimensions.implementation.status, atom.dimensions.verification.status].includes("pending")
  );

  assert.ok(locallyDone.length > 0, "fixture requires locally done atoms");
  assert.ok(locallyPartial.length > 0, "fixture requires locally partial atoms");
  for (const atom of locallyDone) assert.equal(atom.marker, "x", `${atom.id} local done must use [x]`);
  for (const atom of locallyPartial) assert.equal(atom.marker, "-", `${atom.id} local partial must use [-]`);
  for (const atom of locallyPending) assert.equal(atom.marker, " ", `${atom.id} local pending must use [ ]`);

  assert.throws(
    () => assertR0AtomEvidence({ ...locallyPartial[0], marker: "x" }, ledgerIds, maturity),
    /cannot be checked without done implementation and verification/u,
  );
  const pending = {
    ...locallyDone[0],
    marker: " ",
    dimensions: {
      ...locallyDone[0].dimensions,
      implementation: { status: "pending", detail: "Synthetic pending implementation." },
    },
  };
  assert.doesNotThrow(() => assertR0AtomEvidence(pending, ledgerIds, maturity));
  assert.throws(
    () => assertR0AtomEvidence({ ...pending, marker: "x" }, ledgerIds, maturity),
    /cannot be checked without done implementation and verification/u,
  );
});

test("R0 atoms bind exact capabilities, ledger rows, dimensions, and evidence classes", () => {
  const checklist = readFileSync(maturityChecklistPath, "utf8");
  const atoms = r0ChecklistAtoms(checklist);
  const { maturity } = loadContracts();
  const ledgerIds = deliveryLedgerIds(readFileSync(deliveryLedgerPath, "utf8"));

  assert.equal(R0_ATOM_POLICIES.size, atoms.length, "every R0 atom requires an independent evidence policy");
  for (const atom of atoms) assertR0AtomEvidence(atom, ledgerIds, maturity);
});

test("R0 evidence binding rejects unrelated paths and global manifest substitution", () => {
  const atoms = r0ChecklistAtoms(readFileSync(maturityChecklistPath, "utf8"));
  const { maturity } = loadContracts();
  const ledgerIds = deliveryLedgerIds(readFileSync(deliveryLedgerPath, "utf8"));
  const source = atoms.find((atom) => atom.id === "R0-001");
  assert.ok(source, "R0-001 fixture is required");

  assert.throws(
    () => assertR0AtomEvidence({
      ...source,
      dimensions: {
        ...source.dimensions,
        implementation: { ...source.dimensions.implementation, detail: "`README.md`" },
      },
    }, ledgerIds, maturity),
    /unsupported implementation evidence/u,
  );
  assert.throws(
    () => assertR0AtomEvidence({
      ...source,
      dimensions: { ...source.dimensions, ledger: { status: "manifest", detail: "bare global union" } },
    }, ledgerIds, maturity),
    /ledger mapping must match its capabilities/u,
  );
});

test("every manifest and domain gap has one stable future owner", () => {
  const { maturity } = loadContracts();
  const rows = gapMatrixRows(readFileSync(maturityGapMatrixPath, "utf8"));
  const expectedSources = expectedGapSources(
    maturity,
    readFileSync(domainAuditPath, "utf8"),
  );
  const checklistAtoms = futureChecklistAtomIds(readFileSync(maturityChecklistPath, "utf8"));

  assert.equal(new Set(rows.map((row) => row.gapId)).size, rows.length, "gap IDs must be unique");
  assert.deepEqual(
    rows.map((row) => `${row.capability}|${row.source}`).sort(),
    [...expectedSources.keys()].sort(),
    "every manifest/domain source gap must appear exactly once",
  );

  for (const row of rows) assertGapRow(row, checklistAtoms, expectedSources);
});

test("gap execution order is priority-first and never depends on a later phase", () => {
  const rows = gapMatrixRows(readFileSync(maturityGapMatrixPath, "utf8"));
  const checklistAtoms = futureChecklistAtomIds(readFileSync(maturityChecklistPath, "utf8"));
  const priorities = rows.map((row) => Number(row.priority.slice(1)));

  assert.ok(rows.some((row) => row.priority === "P0"), "matrix requires user-blocking or authorization P0 work");
  assert.deepEqual(priorities, [...priorities].sort((left, right) => left - right), "P0 must precede polish priorities");
  for (const row of rows) {
    const ownerPhase = atomPhase(row.owner);
    for (const prerequisite of row.prerequisites) {
      assert.ok(checklistAtoms.has(prerequisite), `${row.gapId} has unknown prerequisite ${prerequisite}`);
      assert.ok(atomPhase(prerequisite) <= ownerPhase, `${row.gapId} depends on later phase ${prerequisite}`);
      assert.notEqual(prerequisite, row.owner, `${row.gapId} cannot depend on its owner atom`);
    }
  }
});

test("R1-R8 checklist and roadmap mappings reconcile to the owned gaps", () => {
  const rows = gapMatrixRows(readFileSync(maturityGapMatrixPath, "utf8"));
  const checklistStages = stageMappingRows(readFileSync(maturityChecklistPath, "utf8"), "task5-stage-map");
  const roadmapStages = stageMappingRows(readFileSync(roadmapPath, "utf8"), "maturity-stage-map");
  const expectedCounts = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => {
      const phase = `R${index + 1}`;
      return [phase, rows.filter((row) => row.owner.startsWith(`${phase}-`)).length];
    }),
  );

  assert.deepEqual(checklistStages.map((stage) => stage.phase), Object.keys(expectedCounts));
  assert.deepEqual(roadmapStages.map((stage) => stage.phase), Object.keys(expectedCounts));
  for (const stage of checklistStages) {
    assert.equal(stage.ownedGaps, expectedCounts[stage.phase], `${stage.phase} checklist gap count drifted`);
    assert.ok(stage.entry.length > 0, `${stage.phase} checklist entry criteria are required`);
    assert.ok(stage.exit.length > 0, `${stage.phase} checklist exit criteria are required`);
    assert.match(stage.nextPlan, /^docs\/superpowers\/plans\/\d{4}-\d{2}-\d{2}-workbench-maturity-r[1-8]-[a-z0-9-]+\.md$/u);
    const roadmap = roadmapStages.find((candidate) => candidate.phase === stage.phase);
    assert.deepEqual(roadmap, stage, `${stage.phase} roadmap mapping must match the checklist`);
  }
});

test("R0-012 closes only with executable gap-accounting evidence", () => {
  const atoms = r0ChecklistAtoms(readFileSync(maturityChecklistPath, "utf8"));
  const atom = atoms.find((candidate) => candidate.id === "R0-012");
  assert.ok(atom, "R0-012 is required");
  assert.equal(atom.marker, "x");
  assert.equal(atom.dimensions.implementation.status, "done");
  assert.equal(atom.dimensions.verification.status, "done");
  assert.match(atom.dimensions.implementation.detail, /`docs\/product\/workbench-product-maturity-gap-matrix\.md`/u);
  assert.match(atom.dimensions.implementation.detail, /`ROADMAP\.md`/u);
  assert.match(atom.dimensions.verification.detail, /`scripts\/workbench-maturity-contract\.test\.mjs`/u);
});

function expectedGapSources(maturity, domainAudit) {
  const sources = new Map();
  for (const record of maturity) {
    record.gaps.forEach((symptom, index) => {
      const fingerprint = createHash("sha256").update(symptom).digest("hex").slice(0, 12);
      const key = `${record.id}|manifest:${index}@${fingerprint}`;
      assert.ok(!sources.has(key), `duplicate manifest gap source ${key}`);
      sources.set(key, { capability: record.id, symptom, kind: "manifest" });
    });
  }
  for (const line of domainAudit.split(/\r?\n/u)) {
    if (!line.startsWith("| workbench-")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    assert.equal(cells.length, 9, "domain audit rows must retain nine columns");
    for (const fact of cells[5].split(/;\s+(?=(?:GET|POST|PUT|PATCH|DELETE)\s)/u)) {
      if (!fact.endsWith("— gap")) continue;
      const operation = fact.slice(0, -" — gap".length);
      const key = `${cells[0]}|domain:${operation}`;
      assert.ok(!sources.has(key), `duplicate domain gap source ${key}`);
      sources.set(key, {
        capability: cells[0],
        symptom: `${operation} lacks a proven mutation-safety strategy.`,
        kind: "domain",
      });
    }
  }
  return sources;
}

function gapMatrixRows(markdown) {
  const section = markerSection(markdown, "gap-matrix");
  const lines = section.split(/\r?\n/u).filter((line) => line.startsWith("| "));
  assert.ok(lines.length >= 3, "gap matrix table is required");
  const headers = markdownCells(lines[0]);
  assert.deepEqual(headers, [
    "Gap ID", "Source", "Capability", "Symptom", "Dimension", "Owner atom", "Prerequisites",
    "Affected files", "Focused test", "Acceptance journey", "Priority",
  ]);
  return lines.slice(2).map((line) => {
    const cells = markdownCells(line);
    assert.equal(cells.length, headers.length, `gap row must contain ${headers.length} fields`);
    return {
      gapId: cells[0],
      source: cells[1],
      capability: cells[2],
      symptom: cells[3],
      dimension: cells[4],
      owner: cells[5],
      prerequisites: cells[6] === "-" ? [] : cells[6].split("<br>").map((value) => value.trim()),
      affectedFiles: cells[7].split("<br>").map((value) => value.trim()),
      focusedTest: cells[8],
      acceptanceJourney: cells[9],
      priority: cells[10],
    };
  });
}

function assertGapRow(row, checklistAtoms, expectedSources) {
  const source = expectedSources.get(`${row.capability}|${row.source}`);
  assert.ok(source, `${row.gapId} has unknown source ${row.capability}|${row.source}`);
  assert.match(
    row.gapId,
    /^workbench-[a-z0-9-]+:(?:entry|journey|api|persistence|isolation|query_or_idempotency|states|accessibility|evidence):[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    `${row.gapId} must use the stable capability:dimension:slug format`,
  );
  const separator = row.gapId.indexOf(":");
  assert.equal(row.gapId.slice(0, separator), row.capability, `${row.gapId} capability prefix drifted`);
  assert.equal(row.gapId.split(":")[1], row.dimension, `${row.gapId} dimension prefix drifted`);
  assert.ok(dimensions.has(row.dimension), `${row.gapId} has unsupported dimension ${row.dimension}`);
  assert.ok(row.symptom.length >= 12, `${row.gapId} requires an observed symptom`);
  assert.ok(checklistAtoms.has(row.owner), `${row.gapId} has unknown owner ${row.owner}`);
  assert.equal(new Set(row.prerequisites).size, row.prerequisites.length, `${row.gapId} repeats a prerequisite`);
  assert.ok(row.affectedFiles.length > 0 && row.affectedFiles.every((path) => existsSync(resolve(repositoryRoot, path))), `${row.gapId} affected files must exist`);
  assert.ok(existsSync(resolve(repositoryRoot, row.focusedTest)), `${row.gapId} focused test must exist`);
  assert.ok(row.acceptanceJourney.length >= 12, `${row.gapId} requires an acceptance journey`);
  assert.match(row.priority, /^P[0-2]$/u, `${row.gapId} priority must be P0, P1, or P2`);
  assert.equal(row.priority, expectedPriority(row.capability, row.source), `${row.gapId} priority contradicts the independent risk policy`);
  if (source.kind === "domain") assert.equal(row.dimension, "query_or_idempotency", `${row.gapId} domain mutation gap has wrong dimension`);
}

function expectedPriority(capability, source) {
  if (source.startsWith("manifest:")) {
    if (capability === "workbench-submit") return "P2";
    if (new Set([
      "workbench-tasks", "workbench-boards", "workbench-admin-roles", "workbench-notifications",
      "workbench-messages", "workbench-knowledge-reader", "workbench-message-thread",
    ]).has(capability)) return "P0";
    return "P1";
  }
  if (new Set([
    "workbench-tasks", "workbench-admin-members", "workbench-admin-roles", "workbench-admin-menus", "workbench-messages",
  ]).has(capability)) return "P0";
  if (capability === "workbench-knowledge-reader" && !source.includes("favorite")) return "P0";
  return "P1";
}

function futureChecklistAtomIds(markdown) {
  return new Set([...markdown.matchAll(/^- \[[ x-]\] `(R[1-8]-\d{3})` /gmu)].map((match) => match[1]));
}

function atomPhase(atomId) {
  const match = /^R([1-8])-\d{3}$/u.exec(atomId);
  assert.ok(match, `invalid future atom ${atomId}`);
  return Number(match[1]);
}

function stageMappingRows(markdown, marker) {
  const section = markerSection(markdown, marker);
  const lines = section.split(/\r?\n/u).filter((line) => line.startsWith("| "));
  assert.ok(lines.length === 10, `${marker} must contain one header, divider, and R1-R8 rows`);
  assert.deepEqual(markdownCells(lines[0]), ["Phase", "Owned gaps", "Entry criteria", "Exit criteria", "Next detailed plan"]);
  return lines.slice(2).map((line) => {
    const cells = markdownCells(line);
    assert.equal(cells.length, 5, `${marker} stage rows require five fields`);
    return { phase: cells[0], ownedGaps: Number(cells[1]), entry: cells[2], exit: cells[3], nextPlan: cells[4] };
  });
}

function markerSection(markdown, marker) {
  const start = `<!-- ${marker}:start -->`;
  const end = `<!-- ${marker}:end -->`;
  assert.equal(markdown.split(start).length, 2, `${marker} start marker is required exactly once`);
  assert.equal(markdown.split(end).length, 2, `${marker} end marker is required exactly once`);
  return markdown.slice(markdown.indexOf(start) + start.length, markdown.indexOf(end));
}

function markdownCells(line) {
  return line.split("|").slice(1, -1).map((cell) => cell.trim().replaceAll("`", ""));
}

function loadContracts() {
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [routeCapabilitiesPath, maturityCapabilitiesPath] });
  try {
    return {
      routes: routeRecords(sourceFile(snapshot, routeCapabilitiesPath), "WORKSPACE_ROUTE_CAPABILITIES"),
      parameterizedRoutes: parameterizedRouteRecords(sourceFile(snapshot, appRoutesPath)),
      maturity: maturityRecords(sourceFile(snapshot, maturityCapabilitiesPath)),
    };
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function r0ChecklistAtoms(markdown) {
  const section = /^## R0\b[\s\S]*?(?=^## R1\b)/mu.exec(markdown)?.[0];
  assert.ok(section, "R0 checklist section is required");
  const lines = section.split(/\r?\n/u);
  const atoms = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^- \[([ x-])\] `(R0-\d{3})` (.+)$/u.exec(lines[index]);
    if (!match) continue;
    const dimensions = {};
    for (const name of ["implementation", "verification", "release", "acceptance", "capabilities", "ledger", "required", "evidence"]) {
      const line = lines[++index] ?? "";
      const evidence = /^  - `(implementation|verification|release|acceptance|capabilities|ledger|required|evidence)`: `([^`]+)` — (.+)$/u.exec(line);
      assert.ok(evidence, `${match[2]} requires structured ${name} evidence`);
      assert.equal(evidence[1], name, `${match[2]} evidence dimensions must remain ordered`);
      dimensions[name] = { status: evidence[2], detail: evidence[3] };
    }
    atoms.push({ marker: match[1], id: match[2], description: match[3], dimensions });
  }
  return atoms;
}

function assertR0AtomEvidence(atom, ledgerIds, maturity) {
  const policy = R0_ATOM_POLICIES.get(atom.id);
  assert.ok(policy, `${atom.id} requires an atom-specific evidence policy`);
  const statuses = Object.fromEntries(
    ["implementation", "verification", "release", "acceptance"]
      .map((name) => [name, atom.dimensions[name].status]),
  );
  for (const [name, status] of Object.entries(statuses)) {
    assert.ok(["done", "partial", "pending"].includes(status), `${atom.id} has invalid ${name} status`);
  }

  for (const name of ["implementation", "verification"]) {
    if (statuses[name] === "pending") continue;
    const paths = evidencePaths(atom.dimensions[name].detail);
    assert.ok(paths.length > 0, `${atom.id} ${name} requires repository evidence paths`);
    for (const path of paths) {
      assert.ok(existsSync(resolve(repositoryRoot, path)), `${atom.id} ${name} evidence is missing: ${path}`);
    }
  }

  assert.equal(statuses.release, "pending", `${atom.id} R0 must not promote production release`);
  assert.equal(statuses.acceptance, "pending", `${atom.id} R0 must not promote signed-browser acceptance`);
  for (const name of ["release", "acceptance"]) {
    assert.match(
      atom.dimensions[name].detail,
      /`docs\/product\/delivery-status-ledger\.md`/u,
      `${atom.id} ${name} requires delivery-ledger authority`,
    );
  }

  const localDone = statuses.implementation === "done" && statuses.verification === "done";
  if (atom.marker === "x") {
    assert.ok(localDone, `${atom.id} cannot be checked without done implementation and verification`);
  } else if (atom.marker === "-") {
    assert.ok(
      [statuses.implementation, statuses.verification].includes("partial"),
      `${atom.id} partial marker requires partial local implementation or verification`,
    );
  } else {
    assert.ok(
      [statuses.implementation, statuses.verification].includes("pending"),
      `${atom.id} unchecked marker requires pending local implementation or verification`,
    );
  }

  const capabilityIds = commaList(atom.dimensions.capabilities.status);
  assert.deepEqual(capabilityIds, policy.capabilityIds, `${atom.id} capability mapping must match its audit scope`);
  const recordsById = new Map(maturity.map((record) => [record.id, record]));
  const mappedRecords = capabilityIds.map((id) => {
    const record = recordsById.get(id);
    assert.ok(record, `${atom.id} maps unknown capability ${id}`);
    return record;
  });
  const expectedLedgerIds = [...new Set(mappedRecords.flatMap((record) => record.ledgerIds))].sort();
  const declaredLedgerIds = commaList(atom.dimensions.ledger.status).sort();
  assert.deepEqual(
    declaredLedgerIds,
    expectedLedgerIds,
    `${atom.id} ledger mapping must match its capabilities`,
  );
  for (const id of declaredLedgerIds) assert.ok(ledgerIds.has(id), `${atom.id} ledger ID ${id} requires a delivery row`);

  const requiredDimensions = assignmentRecord(atom.dimensions.required.status);
  assert.deepEqual(requiredDimensions, policy.requiredDimensions, `${atom.id} required dimensions must match its audit policy`);
  for (const record of mappedRecords) {
    for (const [dimension, expected] of Object.entries(requiredDimensions)) {
      assert.equal(record.dimensions.get(dimension), expected, `${atom.id} ${record.id} ${dimension} must be ${expected}`);
    }
  }

  const evidenceClasses = commaList(atom.dimensions.evidence.status);
  assert.deepEqual(evidenceClasses, policy.evidenceClasses, `${atom.id} evidence classes must match its audit policy`);
  const localPaths = ["implementation", "verification"].flatMap((name) => evidencePaths(atom.dimensions[name].detail));
  const allowedPaths = new Set(evidenceClasses.flatMap((name) => {
    const paths = R0_EVIDENCE_CLASS_PATHS.get(name);
    assert.ok(paths, `${atom.id} has unknown evidence class ${name}`);
    return [...paths];
  }));
  for (const path of localPaths) {
    assert.ok(allowedPaths.has(path), `${atom.id} unsupported implementation evidence: ${path}`);
  }
  if (![statuses.implementation, statuses.verification].includes("pending")) {
    for (const name of evidenceClasses) {
      assert.ok(
        localPaths.some((path) => R0_EVIDENCE_CLASS_PATHS.get(name).has(path)),
        `${atom.id} requires ${name} evidence`,
      );
    }
  }
}

function evidencePaths(detail) {
  return [...detail.matchAll(/`([^`]+(?:\.[a-z0-9]+|\/[^`]+))`/giu)]
    .map((match) => match[1])
    .filter((path) => !path.includes(" "));
}

function deliveryLedgerIds(markdown) {
  return new Set([...markdown.matchAll(/^\| ([A-Z][A-Z0-9]*-[A-Z0-9]+) \|/gmu)].map((match) => match[1]));
}

function commaList(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function assignmentRecord(value) {
  return Object.fromEntries(commaList(value).map((item) => {
    const match = /^([a-z_]+)=(proven|gap|not_applicable)$/u.exec(item);
    assert.ok(match, `invalid required dimension assignment: ${item}`);
    return [match[1], match[2]];
  }));
}

function sourceFile(snapshot, path) {
  const project = snapshot.getDefaultProjectForFile(path);
  const source = project?.program.getSourceFile(path);
  assert.ok(source, `${path} is required`);
  const diagnostics = project.program.getSyntacticDiagnostics(path);
  assert.equal(diagnostics.length, 0, `${path} must parse without syntactic diagnostics`);
  return source;
}

function routeRecords(source, declarationName) {
  return arrayRecords(source, declarationName).map((entry, index) => {
    const properties = objectProperties(entry, `route ${index}`);
    return {
      id: requiredString(properties, "id", `route ${index}`),
      path: requiredString(properties, "path", `route ${index}`),
      availability: requiredString(properties, "availability", `route ${index}`),
    };
  });
}

function maturityRecords(source) {
  return arrayRecords(source, "WORKBENCH_MATURITY_CAPABILITIES").map((entry, index) => {
    const context = `maturity record ${index}`;
    const properties = objectProperties(entry, context);
    const isParameterized = properties.has("routePattern");
    assert.deepEqual(
      new Set(properties.keys()),
      isParameterized ? parameterizedRecordKeys : menuRecordKeys,
      `${context} must use the supported record fields`,
    );
    return {
      id: requiredString(properties, "id", context),
      routeId: requiredString(properties, "routeId", context),
      pathname: requiredString(properties, "pathname", context),
      requiredRole: requiredString(properties, "requiredRole", context),
      journey: requiredString(properties, "journey", context),
      classification: requiredString(properties, "classification", context),
      dimensions: stringRecord(source, properties.get("dimensions"), `${context} dimensions`),
      frontendEvidence: stringArray(source, properties.get("frontendEvidence"), `${context} frontendEvidence`),
      backendEvidence: stringArray(source, properties.get("backendEvidence"), `${context} backendEvidence`),
      testEvidence: stringArray(source, properties.get("testEvidence"), `${context} testEvidence`),
      ledgerIds: stringArray(source, properties.get("ledgerIds"), `${context} ledgerIds`),
      gaps: stringArray(source, properties.get("gaps"), `${context} gaps`),
      parentRouteId: optionalString(properties, "parentRouteId", context),
      routePattern: optionalString(properties, "routePattern", context),
    };
  });
}

function parameterizedRouteRecords(source) {
  const declarations = [];
  const visit = (node) => {
    if (isFunctionDeclaration(node) && node.name?.text === "pageKindForPath") declarations.push(node);
    node.forEachChild(visit);
  };
  visit(source);
  assert.equal(declarations.length, 1, "frontend/app-routes.ts must declare pageKindForPath exactly once");
  assert.ok(declarations[0].body, "pageKindForPath body is required");
  return declarations[0].body.statements.filter(isIfStatement).map((statement, index) => parameterizedRouteRecord(statement, index));
}

function parameterizedRouteRecord(statement, index) {
  const context = `parameterized route ${index}`;
  assert.ok(isCallExpression(statement.expression), `${context} condition must call RegExp.test`);
  const condition = statement.expression;
  assert.ok(isPropertyAccessExpression(condition.expression), `${context} condition must access RegExp.test`);
  assert.equal(condition.expression.name.text, "test", `${context} condition must call RegExp.test`);
  assert.ok(isRegularExpressionLiteral(condition.expression.expression), `${context} matcher must be a regex literal`);
  assert.equal(condition.arguments.length, 1, `${context} matcher must receive pathname once`);
  assert.ok(isIdentifier(condition.arguments[0]) && condition.arguments[0].text === "pathname", `${context} matcher must receive pathname`);
  assert.ok(isReturnStatement(statement.thenStatement) && isStringLiteral(statement.thenStatement.expression), `${context} must return a string route identity`);
  return { routeId: statement.thenStatement.expression.text, routePattern: condition.expression.expression.getText() };
}

function arrayRecords(source, declarationName) {
  const declaration = variableDeclaration(source, declarationName);
  const initializer = unwrapExpression(declaration.initializer);
  assert.ok(isCallExpression(initializer), `${declarationName} must use Object.freeze`);
  assert.equal(initializer.expression.getText(source), "Object.freeze", `${declarationName} must use Object.freeze`);
  assert.equal(initializer.arguments.length, 1, `${declarationName} must freeze one array`);
  const array = unwrapExpression(initializer.arguments[0]);
  assert.ok(isArrayLiteralExpression(array), `${declarationName} must freeze an array`);
  return array.elements;
}

function variableDeclaration(source, name) {
  const declarations = [];
  const visit = (node) => {
    if (isVariableDeclaration(node) && isIdentifier(node.name) && node.name.text === name) declarations.push(node);
    node.forEachChild(visit);
  };
  visit(source);
  assert.equal(declarations.length, 1, `${name} declaration is required exactly once`);
  assert.ok(declarations[0].initializer, `${name} initializer is required`);
  return declarations[0];
}

function objectProperties(node, context) {
  assert.ok(isObjectLiteralExpression(node), `${context} must be an object literal`);
  const properties = new Map();
  for (const property of node.properties) {
    assert.ok(isPropertyAssignment(property), `${context} must use property assignments`);
    assert.ok(property.name && (isIdentifier(property.name) || isStringLiteral(property.name)), `${context} property name is invalid`);
    assert.ok(!properties.has(property.name.text), `${context} has duplicate ${property.name.text}`);
    properties.set(property.name.text, property.initializer);
  }
  return properties;
}

function requiredString(properties, name, context) {
  const value = properties.get(name);
  assert.ok(isStringLiteral(value), `${context} ${name} must be a string literal`);
  return value.text;
}

function optionalString(properties, name, context) {
  if (!properties.has(name)) return undefined;
  return requiredString(properties, name, context);
}

function stringArray(source, node, context) {
  const array = staticExpression(source, node, context);
  assert.ok(isArrayLiteralExpression(array), `${context} must be an array literal`);
  return array.elements.map((element, index) => {
    assert.ok(isStringLiteral(element), `${context} ${index} must be a string literal`);
    return element.text;
  });
}

function stringRecord(source, node, context) {
  const properties = objectProperties(staticExpression(source, node, context), context);
  const record = new Map();
  for (const [key, value] of properties) record.set(key, requiredString(new Map([[key, value]]), key, context));
  return record;
}

function staticExpression(source, expression, context) {
  expression = unwrapExpression(expression);
  if (isIdentifier(expression)) {
    const declaration = variableDeclaration(source, expression.text);
    assert.ok(
      isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & NodeFlags.Const) !== 0,
      `${context} ${expression.text} must resolve through a const declaration`,
    );
    assert.ok(declaration.initializer, `${context} ${expression.text} initializer is required`);
    expression = unwrapExpression(declaration.initializer);
  }
  assert.ok(!isIdentifier(expression), `${context} must not use an identifier chain`);
  return expression;
}

function unwrapExpression(expression) {
  while (isAsExpression(expression) || isSatisfiesExpression(expression) || isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }
  return expression;
}

function withMaturityFixture(source, action) {
  const directory = mkdtempSync(resolve(tmpdir(), "workbench-maturity-contract-"));
  const path = resolve(directory, "workbench-maturity-capabilities.ts");
  writeFileSync(path, source);
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [path] });
  try {
    action(snapshot, path);
  } finally {
    snapshot.dispose();
    api.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function maturityFixture({ declaration = "const", trailing = "" } = {}) {
  return `
    ${declaration} INITIAL_DIMENSIONS = {
      entry: "proven", journey: "gap", api: "gap", persistence: "gap", isolation: "gap",
      query_or_idempotency: "gap", states: "gap", accessibility: "gap", evidence: "gap",
    };
    ${declaration} INITIAL_GAPS = ["fixture gap"];
    export const WORKBENCH_MATURITY_CAPABILITIES = Object.freeze([{
      id: "fixture", routeId: "fixture", pathname: "/fixture", requiredRole: "contributor",
      journey: "Fixture journey", classification: "partial", dimensions: INITIAL_DIMENSIONS,
      frontendEvidence: ["frontend.tsx"], backendEvidence: ["backend.ts"], testEvidence: ["test.ts"],
      ledgerIds: ["FIX-001"], gaps: INITIAL_GAPS,
    }]);
    ${trailing}
  `;
}

function byRouteId(left, right) {
  return left.routeId.localeCompare(right.routeId);
}
