import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { API } from "typescript/unstable/sync";
import {
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isStringLiteral,
  isVariableDeclaration,
} from "typescript/unstable/ast/is";

const repositoryRoot = resolve(import.meta.dirname, "..");
const ledgerPath = resolve(repositoryRoot, "docs/product/delivery-status-ledger.md");
const routeCapabilitiesPath = resolve(repositoryRoot, "shared/workspace-route-capabilities.ts");
const roadmapPath = resolve(repositoryRoot, "ROADMAP.md");

const STATUS_VALUES = new Set(["done", "partial", "pending", "n/a"]);
const REQUIRED_COLUMNS = [
  "ID", "功能", "优先级", "实现", "验证", "发布", "验收", "依赖", "证据", "备注",
];
const PLACEHOLDER_VALUES = new Set(["", "-", "—", "n/a", "tbd", "todo", "待补", "待补充"]);
const ROADMAP_STAGE_IDS = ["R0", "R1", "R2", "R3", "R4", "R5", "R6"];
const LEGACY_ROADMAP_IDS = new Set(["GATE-M0", "GATE-M1", "WS-001", "WS-008"]);
const EXPLICITLY_DEFERRED_ROADMAP_IDS = new Set(["IDN-002"]);
const ROADMAP_MATURITY_DIMENSIONS = [
  ["implementation", "实现"],
  ["verification", "验证"],
  ["release", "发布"],
  ["acceptance", "验收"],
];

test("ledger table parsing preserves escaped and code-span pipes", () => {
  assert.deepEqual(
    splitTableRow("| IDN-001 | `src/routes/a|b.ts` | escaped \\| evidence |"),
    ["IDN-001", "`src/routes/a|b.ts`", "escaped \\| evidence"],
  );
});

test("workspace route registry extraction is complete despite property ordering", () => {
  const fixtureDirectory = mkdtempSync(resolve(tmpdir(), "delivery-status-contract-"));
  const fixturePath = resolve(fixtureDirectory, "workspace-route-capabilities.ts");
  writeFileSync(fixturePath, `
    export const WORKSPACE_ROUTE_CAPABILITIES = Object.freeze([
      { availability: "ready", path: "/first", id: "first", pageKind: "home", capability: null },
      { id: "second", pageKind: "coming-soon", path: "/second", availability: "coming_soon", capability: null },
    ]);
  `);
  try {
    assert.deepEqual(
      workspaceRouteCapabilities(fixturePath),
      [
        { path: "/first", availability: "ready" },
        { path: "/second", availability: "coming_soon" },
      ],
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
});

test("actual workspace route registry extraction includes every ready and coming-soon route", () => {
  assert.deepEqual(
    workspaceRouteCapabilities(),
    [
      { path: "/", availability: "ready" },
      { path: "/submit", availability: "ready" },
      { path: "/knowledge", availability: "ready" },
      { path: "/search", availability: "ready" },
      { path: "/agent", availability: "ready" },
      { path: "/my-submissions", availability: "ready" },
      { path: "/tasks", availability: "ready" },
      { path: "/settings", availability: "ready" },
      { path: "/admin", availability: "ready" },
      { path: "/admin/submissions", availability: "ready" },
      { path: "/admin/duplicates", availability: "ready" },
      { path: "/admin/assets", availability: "ready" },
      { path: "/admin/members", availability: "ready" },
      { path: "/admin/roles", availability: "ready" },
      { path: "/admin/menus", availability: "ready" },
      { path: "/admin/spaces", availability: "ready" },
      { path: "/admin/audit", availability: "ready" },
      { path: "/admin/analytics", availability: "ready" },
      { path: "/boards", availability: "coming_soon" },
      { path: "/notifications", availability: "coming_soon" },
      { path: "/messages", availability: "coming_soon" },
    ],
  );
});

test("route coverage uses exact structured route markers", () => {
  const tokens = routeTokens({ 证据: "src/app.ts", 备注: "shared route: `/admin/assets`" });

  assert.deepEqual(tokens, new Set(["/admin/assets"]));
  assert.equal(tokens.has("/admin"), false);
  assert.equal(tokens.has("/"), false);
});

test("completed dimensions require evidence and n/a dimensions require a reason", () => {
  const emptyEvidence = { ID: "IDN-001", 实现: "done", 验证: "pending", 发布: "pending", 验收: "pending", 证据: "", 备注: "" };
  assert.throws(() => assertRowContract(emptyEvidence), /IDN-001 requires evidence/u);

  const missingNaReason = { ID: "IDN-002", 实现: "n/a", 验证: "pending", 发布: "pending", 验收: "pending", 证据: "-", 备注: "-" };
  assert.throws(() => assertRowContract(missingNaReason), /IDN-002 requires a reason for n\/a/u);
});

test("partial or done release requires a scoped dated evidence marker", () => {
  const expectedError = /OPS-001 requires .*dated release evidence/u;
  const missingMarker = {
    ID: "OPS-001", 实现: "done", 验证: "done", 发布: "partial", 验收: "pending",
    证据: "migrations/0032_workspace_tasks.sql", 备注: "",
  };
  assert.throws(() => assertRowContract(missingMarker), expectedError);

  const genericDatedPath = {
    ...missingMarker,
    证据: "docs/operations/evidence/workspace-rbac-release-2026-08-28.md",
  };
  assert.throws(() => assertRowContract(genericDatedPath), expectedError);

  const legacyPathOnlyMarker = {
    ...missingMarker,
    证据: "release evidence: `docs/operations/evidence/workspace-rbac-release-2026-08-28.md`",
  };
  assert.throws(() => assertRowContract(legacyPathOnlyMarker), expectedError);

  const emptyScope = {
    ...missingMarker,
    证据: "release evidence: `docs/operations/evidence/workspace-rbac-release-2026-08-28.md` [scope: ]",
  };
  assert.throws(() => assertRowContract(emptyScope), expectedError);

  const placeholderScope = {
    ...missingMarker,
    证据: "release evidence: `docs/operations/evidence/workspace-rbac-release-2026-08-28.md` [scope: pending]",
  };
  assert.throws(() => assertRowContract(placeholderScope), expectedError);

  const undatedMarker = {
    ...missingMarker,
    证据: "release evidence: `docs/operations/evidence/m1-release-template.md` [scope: migrations 0001 through 0032 applied]",
  };
  assert.throws(() => assertRowContract(undatedMarker), expectedError);

  const scopedDatedMarker = {
    ...missingMarker,
    证据: "release evidence: `docs/operations/evidence/workspace-rbac-release-2026-08-28.md` [scope: migrations 0001 through 0032 applied]",
  };
  assert.doesNotThrow(() => assertRowContract(scopedDatedMarker));
});

test("partial or done acceptance requires a scoped dated evidence marker", () => {
  const expectedError = /IDN-001 requires .*dated acceptance evidence/u;
  const missingMarker = {
    ID: "IDN-001", 实现: "done", 验证: "done", 发布: "pending", 验收: "partial",
    证据: "test/unit/github-oauth.test.ts", 备注: "",
  };
  assert.throws(() => assertRowContract(missingMarker), expectedError);

  const legacyPathOnlyMarker = {
    ...missingMarker,
    证据: "acceptance evidence: `docs/operations/evidence/m1-release-2026-08-23.md`",
  };
  assert.throws(() => assertRowContract(legacyPathOnlyMarker), expectedError);

  const scopedDatedMarker = {
    ...missingMarker,
    证据: "acceptance evidence: `docs/operations/evidence/m1-release-2026-08-23.md` [scope: GitHub callback and authenticated session journey]",
  };
  assert.doesNotThrow(() => assertRowContract(scopedDatedMarker));
});

test("ledger dependencies must resolve to another row", () => {
  assert.throws(
    () => assertDependencyGraph([
      { ID: "KB-001", 依赖: "IDN-001" },
      { ID: "IDN-001", 依赖: "MISSING-001" },
    ]),
    /IDN-001 has unknown dependency MISSING-001/u,
  );
});

test("ledger dependencies must be acyclic", () => {
  assert.throws(
    () => assertDependencyGraph([
      { ID: "KB-004", 依赖: "ADM-002" },
      { ID: "ADM-002", 依赖: "KB-004" },
    ]),
    /ledger dependency cycle: KB-004 -> ADM-002 -> KB-004/u,
  );
});

test("delivery status ledger reconciles documentation status claims", () => {
  const { headers, rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));

  assert.deepEqual(headers, REQUIRED_COLUMNS);
  assert.equal(new Set(rows.map((row) => row.ID)).size, rows.length, "ledger IDs must be unique");
  for (const row of rows) {
    assertRowContract(row);
  }

  const ledgerIds = new Set(rows.map((row) => row.ID));
  assertDependencyGraph(rows);
  for (const route of workspaceRouteCapabilities()) {
    assert.ok(
      rows.some((row) => routeTokens(row).has(route.path)),
      `${route.path} requires ledger coverage`,
    );
  }

  for (const id of roadmapBacktickIds(readFileSync(roadmapPath, "utf8"))) {
    assert.ok(ledgerIds.has(id), `Roadmap ID ${id} requires a ledger row`);
  }
});

test("Roadmap derives its exact R0-R6 stage contract from the delivery ledger", () => {
  const { rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));
  const roadmap = readFileSync(roadmapPath, "utf8");
  const stages = parseRoadmapStages(roadmap);

  assertRoadmapStageOrder(stages);
  assertRoadmapStageSections(stages);
  assertRoadmapMaturitySummary(roadmap, rows);
  const owners = assertRoadmapOwnership(stages, rows, roadmap);
  assertRoadmapDependencyStageOrder(owners, rows);
});

test("Roadmap contract rejects stage-order, section, maturity, and dependency mutations", () => {
  assert.throws(
    () => assertRoadmapStageOrder(parseRoadmapStages(roadmapStageFixture(["R0", "R1", "R1", "R3", "R4", "R5", "R6"]))),
    /Roadmap delivery stages must be exactly R0, R1, R2, R3, R4, R5, R6/u,
  );
  assert.throws(
    () => assertRoadmapStageOrder(parseRoadmapStages(roadmapStageFixture(["R0", "R1", "R2", "R3", "R4", "R5", "R6", "R7"]))),
    /Roadmap delivery stages must be exactly R0, R1, R2, R3, R4, R5, R6/u,
  );
  assert.throws(
    () => assertRoadmapStageOrder(parseRoadmapStages(roadmapStageFixture(["R0", "R2", "R1", "R3", "R4", "R5", "R6"]))),
    /Roadmap delivery stages must be exactly R0, R1, R2, R3, R4, R5, R6/u,
  );

  const maturityFixtureRows = [{ ID: "KB-001", 实现: "done", 验证: "done", 发布: "pending", 验收: "pending" }];
  const roadmap = readFileSync(roadmapPath, "utf8");
  assert.throws(
    () => assertRoadmapMaturitySummary(
      "总账成熟度：`atoms=0`; `implementation=done:1,partial:0,pending:0,n/a:0`; `verification=done:1,partial:0,pending:0,n/a:0`; `release=done:0,partial:0,pending:1,n/a:0`; `acceptance=done:0,partial:0,pending:1,n/a:0`",
      maturityFixtureRows,
    ),
    /Roadmap maturity summary must match the delivery ledger/u,
  );
  assert.throws(
    () => assertRoadmapStageSections(parseRoadmapStages(roadmap.replace(/^范围：.*$/mu, "范围："))),
    /R0 requires a non-empty 范围 section/u,
  );
  assert.throws(
    () => assertRoadmapDependencyStageOrder(
      new Map([["ADM-009", "R3"], ["TSK-008", "R2"]]),
      [{ ID: "ADM-009", 依赖: "-" }, { ID: "TSK-008", 依赖: "ADM-009" }],
    ),
    /TSK-008 depends on ADM-009 in a later stage/u,
  );
});

function parseMarkdownTable(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const headerIndex = lines.findIndex((line) => splitTableRow(line).join("|") === REQUIRED_COLUMNS.join("|"));
  assert.notEqual(headerIndex, -1, "ledger header is required");
  assert.match(lines[headerIndex + 1] ?? "", /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/u, "ledger divider is required");

  const headers = splitTableRow(lines[headerIndex]);
  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim()) break;
    if (!line.trimStart().startsWith("|")) break;
    const cells = splitTableRow(line);
    assert.equal(cells.length, headers.length, "ledger row has the required columns");
    rows.push(Object.fromEntries(headers.map((header, index) => [header, cells[index]])));
  }
  return { headers, rows };
}

function splitTableRow(line) {
  const cells = [];
  let cell = "";
  let codeFenceLength = 0;
  const trimmed = line.trim();

  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === "\\") {
      cell += character;
      if (index + 1 < trimmed.length) cell += trimmed[++index];
      continue;
    }
    if (character === "`") {
      let fenceEnd = index;
      while (trimmed[fenceEnd] === "`") fenceEnd += 1;
      const fenceLength = fenceEnd - index;
      if (codeFenceLength === 0) codeFenceLength = fenceLength;
      else if (codeFenceLength === fenceLength) codeFenceLength = 0;
      cell += "`".repeat(fenceLength);
      index = fenceEnd - 1;
      continue;
    }
    if (character === "|" && codeFenceLength === 0) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }
  cells.push(cell.trim());
  if (trimmed.startsWith("|")) cells.shift();
  if (trimmed.endsWith("|")) cells.pop();
  return cells;
}

function assertRowContract(row) {
  for (const field of ["实现", "验证", "发布", "验收"]) {
    assert.ok(STATUS_VALUES.has(row[field]), `${row.ID} has invalid ${field}`);
  }
  if (["实现", "验证", "发布", "验收"].some((field) => row[field] === "done")) {
    assert.ok(hasWrittenValue(row.证据), `${row.ID} requires evidence`);
  }
  if (["实现", "验证", "发布", "验收"].some((field) => row[field] === "n/a")) {
    assert.ok(hasWrittenValue(row.备注), `${row.ID} requires a reason for n/a`);
  }
  if (row.发布 === "partial" || row.发布 === "done") {
    assertScopedDatedEvidence(row, "release");
  }
  if (row.验收 === "partial" || row.验收 === "done") {
    assertScopedDatedEvidence(row, "acceptance");
  }
}

function assertScopedDatedEvidence(row, kind) {
  const marker = new RegExp(
    `${kind} evidence:\\s*\`([^\`\\r\\n]+)\`\\s*\\[scope:\\s*([^\\]\\r\\n]+?)\\s*\\]`,
    "gu",
  );
  const entries = [...(row.证据 ?? "").matchAll(marker)].map((match) => ({
    path: match[1],
    scope: match[2]?.trim(),
  }));
  const datedEvidencePath = /^docs\/operations\/evidence\/[^/`\r\n]*\d{4}-\d{2}-\d{2}[^/`\r\n]*\.md$/u;
  assert.ok(
    entries.some(({ path, scope }) =>
      datedEvidencePath.test(path) &&
      existsSync(resolve(repositoryRoot, path)) &&
      hasCapabilityScope(scope)
    ),
    `${row.ID} requires scoped dated ${kind} evidence`,
  );
}

function assertDependencyGraph(rows) {
  const rowsById = new Map(rows.map((row) => [row.ID, row]));
  const dependenciesById = new Map();
  for (const row of rows) {
    const dependencies = ledgerDependencies(row);
    for (const dependency of dependencies) {
      assert.ok(rowsById.has(dependency), `${row.ID} has unknown dependency ${dependency}`);
    }
    dependenciesById.set(row.ID, dependencies);
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const visit = (id) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id);
      assert.fail(`ledger dependency cycle: ${[...stack.slice(cycleStart), id].join(" -> ")}`);
    }
    visiting.add(id);
    stack.push(id);
    for (const dependency of dependenciesById.get(id) ?? []) visit(dependency);
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const row of rows) visit(row.ID);
}

function ledgerDependencies(row) {
  const value = (row.依赖 ?? "").trim();
  if (value === "" || value === "-" || value === "—") return [];
  return value.split(",").map((dependency) => dependency.trim()).filter(Boolean);
}

function hasWrittenValue(value) {
  return !PLACEHOLDER_VALUES.has((value ?? "").trim().toLowerCase());
}

function hasCapabilityScope(value) {
  const normalized = (value ?? "").trim().toLowerCase();
  return hasWrittenValue(normalized) && !STATUS_VALUES.has(normalized);
}

function routeTokens(row) {
  return new Set(
    [row.证据, row.备注].flatMap((field) =>
      [...(field ?? "").matchAll(/shared route:\s*`(\/[^`\r\n]*)`/gu)].map((match) => match[1]),
    ),
  );
}

function workspaceRouteCapabilities(path = routeCapabilitiesPath) {
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [path] });
  try {
    const project = snapshot.getDefaultProjectForFile(path);
    const sourceFile = project?.program.getSourceFile(path);
    assert.ok(sourceFile, "workspace route capabilities source is required");
    const declaration = findWorkspaceRouteCapabilitiesDeclaration(sourceFile);
    const entries = workspaceRouteCapabilityEntries(declaration.initializer);
    const records = entries.map((entry, index) => workspaceRouteCapabilityRecord(entry, index));
    assert.equal(records.length, entries.length, "every workspace route registry entry must be extracted");
    const routes = records.filter((record) => record.availability === "ready" || record.availability === "coming_soon");
    assert.ok(routes.length > 0, "workspace route capabilities are required");
    return routes;
  } finally {
    snapshot.dispose();
    api.close();
  }
}

function findWorkspaceRouteCapabilitiesDeclaration(sourceFile) {
  let declaration;
  const visit = (node) => {
    if (isVariableDeclaration(node) && isIdentifier(node.name) && node.name.text === "WORKSPACE_ROUTE_CAPABILITIES") {
      declaration = node;
    }
    node.forEachChild(visit);
  };
  visit(sourceFile);
  assert.ok(declaration?.initializer, "WORKSPACE_ROUTE_CAPABILITIES declaration is required");
  return declaration;
}

function workspaceRouteCapabilityEntries(initializer) {
  const expression = unwrapExpression(initializer);
  assert.ok(isCallExpression(expression), "WORKSPACE_ROUTE_CAPABILITIES must use Object.freeze");
  assert.equal(expression.expression.getText(), "Object.freeze", "WORKSPACE_ROUTE_CAPABILITIES must use Object.freeze");
  assert.equal(expression.arguments.length, 1, "WORKSPACE_ROUTE_CAPABILITIES has one frozen value");
  const array = unwrapExpression(expression.arguments[0]);
  assert.ok(isArrayLiteralExpression(array), "WORKSPACE_ROUTE_CAPABILITIES must freeze an array");
  return array.elements;
}

function workspaceRouteCapabilityRecord(entry, index) {
  assert.ok(isObjectLiteralExpression(entry), `workspace route registry entry ${index} must be an object`);
  const properties = new Map();
  for (const property of entry.properties) {
    assert.ok(isPropertyAssignment(property), `workspace route registry entry ${index} must use property assignments`);
    assert.ok(property.name, `workspace route registry entry ${index} property name is required`);
    assert.ok(isIdentifier(property.name) || isStringLiteral(property.name), `workspace route registry entry ${index} property name is invalid`);
    properties.set(property.name.text, property.initializer);
  }
  const path = properties.get("path");
  const availability = properties.get("availability");
  assert.ok(isStringLiteral(path), `workspace route registry entry ${index} requires string path`);
  assert.ok(isStringLiteral(availability), `workspace route registry entry ${index} requires string availability`);
  return { path: path.text, availability: availability.text };
}

function unwrapExpression(expression) {
  while (isAsExpression(expression) || isSatisfiesExpression(expression) || isParenthesizedExpression(expression)) {
    expression = expression.expression;
  }
  return expression;
}

function roadmapBacktickIds(roadmap) {
  return [...roadmap.matchAll(/`([A-Z][A-Z0-9]*-[A-Z0-9]+)`/gu)].map((match) => match[1]);
}

function parseRoadmapStages(roadmap) {
  const headings = [...roadmap.matchAll(/^## ([^\r\n]+)$/gmu)];
  assert.ok(headings.length > 0, "Roadmap delivery stages are required");
  const stages = headings.map((match, index) => {
    const heading = match[1];
    const stageMatch = /^(R\d+) — (.+)$/u.exec(heading);
    assert.ok(stageMatch, `Roadmap top-level heading must be an R-stage: ${heading}`);
    const contentStart = match.index + match[0].length;
    const contentEnd = headings[index + 1]?.index ?? roadmap.length;
    return { id: stageMatch[1], content: roadmap.slice(contentStart, contentEnd) };
  });
  return stages;
}

function assertRoadmapStageOrder(stages) {
  assert.deepEqual(
    stages.map((stage) => stage.id),
    ROADMAP_STAGE_IDS,
    "Roadmap delivery stages must be exactly R0, R1, R2, R3, R4, R5, R6",
  );
}

function assertRoadmapStageSections(stages) {
  for (const stage of stages) {
    assert.match(stage.content, /^状态：(active|planned|blocked)$/mu, `${stage.id} requires a valid 状态 section`);
    for (const section of ["目标", "范围", "前置依赖"]) {
      assert.match(stage.content, new RegExp(`^${section}：(\\S.*)$`, "mu"), `${stage.id} requires a non-empty ${section} section`);
    }
    assert.match(
      stage.content,
      /^退出标准：\r?\n\r?\n(?:- \[ \] \S.*\r?\n?)+/mu,
      `${stage.id} requires an unchecked 退出标准 checklist`,
    );
  }
}

function assertRoadmapMaturitySummary(roadmap, rows) {
  assert.deepEqual(
    roadmapMaturitySummary(roadmap),
    ledgerMaturitySummary(rows),
    "Roadmap maturity summary must match the delivery ledger",
  );
}

function roadmapMaturitySummary(roadmap) {
  const match = /^总账成熟度：`atoms=(\d+)`; `implementation=done:(\d+),partial:(\d+),pending:(\d+),n\/a:(\d+)`; `verification=done:(\d+),partial:(\d+),pending:(\d+),n\/a:(\d+)`; `release=done:(\d+),partial:(\d+),pending:(\d+),n\/a:(\d+)`; `acceptance=done:(\d+),partial:(\d+),pending:(\d+),n\/a:(\d+)`$/mu.exec(roadmap);
  assert.ok(match, "Roadmap requires a structured 总账成熟度 summary");
  const values = match.slice(1).map(Number);
  const summary = { atoms: values.shift() };
  for (const [dimension] of ROADMAP_MATURITY_DIMENSIONS) {
    summary[dimension] = Object.fromEntries(["done", "partial", "pending", "n/a"].map((status) => [status, values.shift()]));
  }
  return summary;
}

function ledgerMaturitySummary(rows) {
  const summary = { atoms: rows.length };
  for (const [dimension, column] of ROADMAP_MATURITY_DIMENSIONS) {
    summary[dimension] = Object.fromEntries(
      ["done", "partial", "pending", "n/a"].map((status) => [status, rows.filter((row) => row[column] === status).length]),
    );
  }
  return summary;
}

function assertRoadmapOwnership(stages, rows, roadmap) {
  const ledgerIds = new Set(rows.map((row) => row.ID));
  const owners = new Map();
  for (const stage of stages) {
    const scopeLine = new RegExp("^范围：(\\S.*)$", "mu").exec(stage.content)?.[1] ?? "";
    const ids = roadmapBacktickIds(scopeLine);
    assert.ok(ids.length > 0, `${stage.id} requires a non-empty 范围 section`);
    for (const id of ids) {
      assert.ok(ledgerIds.has(id), `${stage.id} scope ID ${id} requires a ledger row`);
      assert.ok(!LEGACY_ROADMAP_IDS.has(id), `${stage.id} must not own legacy ledger ID ${id}`);
      assert.ok(!EXPLICITLY_DEFERRED_ROADMAP_IDS.has(id), `${stage.id} must not own explicitly deferred ID ${id}`);
      assert.ok(!owners.has(id), `${id} must have exactly one R-stage owner`);
      owners.set(id, stage.id);
    }
  }
  for (const row of rows) {
    if (LEGACY_ROADMAP_IDS.has(row.ID)) {
      assert.ok(!owners.has(row.ID), `legacy ledger ID ${row.ID} must not have an R-stage owner`);
      continue;
    }
    if (EXPLICITLY_DEFERRED_ROADMAP_IDS.has(row.ID)) {
      assert.ok(!owners.has(row.ID), `explicitly deferred ID ${row.ID} must not have an R-stage owner`);
      assert.match(roadmap, new RegExp("^明确排除：.*`" + row.ID + "`.*可选.*不在.*R0–R6", "mu"), `${row.ID} requires an explicit optional-roadmap rationale`);
      continue;
    }
    assert.ok(owners.has(row.ID), `${row.ID} requires exactly one R-stage owner`);
  }
  return owners;
}

function assertRoadmapDependencyStageOrder(owners, rows) {
  const stageIndex = new Map(ROADMAP_STAGE_IDS.map((stage, index) => [stage, index]));
  for (const row of rows) {
    const owner = owners.get(row.ID);
    if (!owner) continue;
    for (const dependency of ledgerDependencies(row)) {
      if (LEGACY_ROADMAP_IDS.has(dependency)) continue;
      const dependencyOwner = owners.get(dependency);
      assert.ok(dependencyOwner, `${row.ID} dependency ${dependency} requires an R-stage owner`);
      assert.ok(
        stageIndex.get(dependencyOwner) <= stageIndex.get(owner),
        `${row.ID} depends on ${dependency} in a later stage`,
      );
    }
  }
}

function roadmapStageFixture(ids) {
  return ids.map((id) => `## ${id} — fixture`).join("\n\n");
}
