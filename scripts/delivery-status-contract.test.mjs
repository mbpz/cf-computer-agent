import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      { availability: "ready", path: "/first", id: "first", pageKind: "home" },
      { id: "second", pageKind: "coming-soon", path: "/second", availability: "coming_soon" },
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

test("delivery status ledger reconciles documentation status claims", () => {
  const { headers, rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));

  assert.deepEqual(headers, REQUIRED_COLUMNS);
  assert.equal(new Set(rows.map((row) => row.ID)).size, rows.length, "ledger IDs must be unique");
  for (const row of rows) {
    assertRowContract(row);
  }

  const ledgerIds = new Set(rows.map((row) => row.ID));
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
}

function hasWrittenValue(value) {
  return !PLACEHOLDER_VALUES.has((value ?? "").trim().toLowerCase());
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
    assert.ok(isStringLiteral(property.initializer), `workspace route registry entry ${index} property value must be a string literal`);
    properties.set(property.name.text, property.initializer.text);
  }
  assert.ok(properties.has("path"), `workspace route registry entry ${index} requires path`);
  assert.ok(properties.has("availability"), `workspace route registry entry ${index} requires availability`);
  return { path: properties.get("path"), availability: properties.get("availability") };
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
