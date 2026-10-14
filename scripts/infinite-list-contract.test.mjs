import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { API } from "typescript/unstable/sync";
import { isFunctionDeclaration } from "typescript/unstable/ast/is";

const repositoryRoot = resolve(import.meta.dirname, "..");

// Every server-paginated list renders the shared DataTable and appends pages.
// The retired numbered pager must not come back anywhere in first-party source.
const pageLists = [
  ["analytics", "frontend/pages/admin/analytics-page.tsx"],
  ["audit", "frontend/pages/admin/audit-page.tsx"],
  ["members", "frontend/pages/admin/members-page.tsx"],
  ["review", "frontend/pages/admin/review-queue-page.tsx"],
  ["assets", "frontend/pages/admin/asset-queue-page.tsx"],
  ["duplicates", "frontend/pages/admin/duplicate-queue-page.tsx"],
  ["knowledge", "frontend/pages/knowledge-page.tsx"],
  ["search", "frontend/pages/search-page.tsx"],
  ["submissions", "frontend/pages/my-submissions-page.tsx"],
  ["tasks", "frontend/pages/tasks/tasks-page.tsx"],
  ["notifications", "frontend/pages/notifications/notifications-page.tsx"],
  ["inbox", "frontend/pages/inbox-page.tsx"],
  ["boards", "frontend/pages/boards/boards-page.tsx"],
  ["calendar", "frontend/pages/calendar-page.tsx"],
  ["goals", "frontend/pages/goals-page.tsx"],
  ["projects", "frontend/pages/projects-page.tsx"],
  ["timeline", "frontend/pages/project-timeline-page.tsx"],
  ["environments", "frontend/features/environments/environments-page.tsx"],
  ["focus-picker", "frontend/components/focus-task-picker.tsx"],
  ["goal-tasks", "frontend/components/goal-tasks-editor.tsx"],
  ["relations", "frontend/components/project-relations-editor.tsx"],
];

const retired = /\bDataPagination\b|aria-label="Page |Rows per page|PAGINATION_(?:TOTAL|VISIBLE|ROWS_PER_PAGE|PREVIOUS_PAGE|NEXT_PAGE|PAGE_LABEL|MOBILE_SUMMARY|NAVIGATION)\b|frontendPaginationLabels|\bparsePageSearch\b|\bwritePageSearch\b/u;
const appends = /\bonLoadMore\b/u;
const fixedWindow = /\blistPageSize\b/u;
const sharedTable = /<DataTable\b/u;

function lintInfiniteList(source) {
  const violations = [];
  if (!sharedTable.test(source)) violations.push("renders no <DataTable>");
  if (!appends.test(source)) violations.push("passes no onLoadMore");
  if (retired.test(source)) violations.push("still references the numbered pager");
  return violations;
}

test("every paginated list renders the shared table and appends pages", () => {
  for (const [name, pagePath] of pageLists) {
    assert.deepEqual(lintInfiniteList(readFileSync(resolve(repositoryRoot, pagePath), "utf8")), [], `${name} ${pagePath}`);
  }
  // The list routes live in one file: they must fetch the fixed window and never
  // hand the retired page callbacks down to a page.
  const app = readFileSync(resolve(repositoryRoot, "frontend/app.tsx"), "utf8");
  assert.match(app, fixedWindow, "list routes fetch the fixed window");
  assert.ok(!/onPageChange\s*=|onPageSizeChange\s*=/u.test(app), "a route still passes numbered page callbacks");
});

test("the retired numbered pager leaves no references behind", () => {
  const offenders = [];
  for (const path of firstPartySources(resolve(repositoryRoot, "frontend"))) {
    const text = readFileSync(path, "utf8");
    if (/\bDataPagination\b|components\/data-pagination/u.test(text)) offenders.push(path.slice(repositoryRoot.length + 1));
  }
  assert.deepEqual(offenders, []);
});

test("the server window contract stays intact for the appending lists", () => {
  const numbered = readFileSync(resolve(repositoryRoot, "frontend/lib/numbered-page.ts"), "utf8");
  assert.match(numbered, /export const supportedPageSizes = \[20, 50, 100\] as const/u);
  assert.match(numbered, /export function normalizeNumberedPage/u);
  assert.match(numbered, /export const listPageSize/u);
});

test("the checker rejects a list that still renders the numbered pager", () => {
  const fixture = readFileSync(resolve(repositoryRoot, "test/fixtures/infinite-list-contract.tsx"), "utf8");
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: [resolve(repositoryRoot, "test/fixtures/infinite-list-contract.tsx")] });
  try {
    const file = sourceFile(snapshot, "test/fixtures/infinite-list-contract.tsx");
    assert.deepEqual(lintInfiniteList(namedFunction(file, "InfiniteListFixture").getText(file)), []);
    assert.deepEqual(lintInfiniteList(namedFunction(file, "NumberedListFixture").getText(file)), ["renders no <DataTable>", "passes no onLoadMore", "still references the numbered pager"]);
    assert.match(fixture, /INFINITE_LIST_FIXTURE_SENTINEL/u);
  } finally {
    snapshot.dispose();
    api.close();
  }
});

function firstPartySources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "dist" || entry.name === "node_modules" ? [] : firstPartySources(path);
    return /\.(?:ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

function sourceFile(snapshot, relativePath) {
  const absolutePath = resolve(repositoryRoot, relativePath);
  const project = snapshot.getDefaultProjectForFile(absolutePath);
  const file = project?.program.getSourceFile(absolutePath);
  assert.ok(file, relativePath);
  return file;
}

function namedFunction(file, functionName) {
  const matches = collectNodes(file, (node) => isFunctionDeclaration(node) && node.name?.text === functionName);
  assert.equal(matches.length, 1, functionName);
  return matches[0];
}


function collectNodes(root, predicate) {
  const matches = [];
  const visit = (node) => {
    if (predicate(node)) matches.push(node);
    node.forEachChild(visit);
  };
  visit(root);
  return matches;
}
