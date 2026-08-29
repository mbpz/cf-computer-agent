import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const ledgerPath = resolve(repositoryRoot, "docs/product/delivery-status-ledger.md");
const routeCapabilitiesPath = resolve(repositoryRoot, "shared/workspace-route-capabilities.ts");
const roadmapPath = resolve(repositoryRoot, "ROADMAP.md");

const STATUS_VALUES = new Set(["done", "partial", "pending", "n/a"]);
const REQUIRED_COLUMNS = [
  "ID", "功能", "优先级", "实现", "验证", "发布", "验收", "依赖", "证据", "备注",
];

test("delivery status ledger reconciles documentation status claims", () => {
  const { headers, rows } = parseMarkdownTable(readFileSync(ledgerPath, "utf8"));

  assert.deepEqual(headers, REQUIRED_COLUMNS);
  assert.equal(new Set(rows.map((row) => row.ID)).size, rows.length, "ledger IDs must be unique");
  for (const row of rows) {
    for (const field of ["实现", "验证", "发布", "验收"]) {
      assert.ok(STATUS_VALUES.has(row[field]), `${row.ID} has invalid ${field}`);
    }
    if (row.实现 === "done" || row.验证 === "done" || row.发布 === "done" || row.验收 === "done") {
      assert.notEqual(row.证据, "-", `${row.ID} requires evidence`);
    }
  }

  const ledgerIds = new Set(rows.map((row) => row.ID));
  for (const route of workspaceRouteCapabilities()) {
    assert.ok(
      rows.some((row) => row.证据.includes(route.path) || row.备注.includes(route.path)),
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
  return line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((cell) => cell.trim());
}

function workspaceRouteCapabilities() {
  const source = readFileSync(routeCapabilitiesPath, "utf8");
  const routes = [...source.matchAll(/\{\s*id:\s*"[^"]+",\s*path:\s*"([^"]+)",\s*pageKind:\s*"[^"]+",\s*availability:\s*"(ready|coming_soon)"/gu)]
    .map((match) => ({ path: match[1], availability: match[2] }));
  assert.ok(routes.length > 0, "workspace route capabilities are required");
  return routes;
}

function roadmapBacktickIds(roadmap) {
  return [...roadmap.matchAll(/`([A-Z][A-Z0-9]*-[A-Z0-9]+)`/gu)].map((match) => match[1]);
}
