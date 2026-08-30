import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { API } from "typescript/unstable/sync";
import { isFunctionDeclaration, isIfStatement, isJsxSelfClosingElement } from "typescript/unstable/ast/is";

const repositoryRoot = resolve(import.meta.dirname, "..");
const formalLists = [
  ["analytics", "frontend/lib/admin-analytics-data.ts", "frontend/pages/admin/analytics-page.tsx", "AdminAnalyticsPage", "src/routes/admin.ts", 'if (url.pathname === "/api/admin/analytics/overview")'],
  ["audit", "frontend/lib/admin-audit-data.ts", "frontend/pages/admin/audit-page.tsx", "AuditPage", "src/routes/admin.ts", 'if (url.pathname === "/api/admin/audit-events")'],
  ["members", "frontend/lib/admin-members-data.ts", "frontend/pages/admin/members-page.tsx", "MembersPage", "src/routes/admin.ts", 'if (url.pathname === "/api/admin/members")'],
  ["review", "frontend/lib/admin-review-data.ts", "frontend/pages/admin/review-queue-page.tsx", "ReviewQueuePage", "src/routes/admin.ts", 'if (url.pathname === "/api/admin/submissions")'],
  ["assets", "frontend/lib/admin-assets-data.ts", "frontend/pages/admin/asset-queue-page.tsx", "AssetQueuePage", "src/routes/admin.ts", 'if (url.pathname === "/api/admin/assets")'],
  ["duplicates", "frontend/lib/admin-duplicates-data.ts", "frontend/pages/admin/duplicate-queue-page.tsx", "DuplicateQueuePage", "src/routes/admin.ts", 'if (url.pathname === "/api/admin/duplicates")'],
  ["knowledge", "frontend/lib/knowledge-data.ts", "frontend/pages/knowledge-page.tsx", "KnowledgePage", "src/routes/library.ts", 'if (url.pathname === "/api/knowledge")'],
  ["search", "frontend/lib/search-data.ts", "frontend/pages/search-page.tsx", "SearchPage", "src/routes/library.ts", 'if (url.pathname === "/api/knowledge/search")'],
  ["submissions", "frontend/lib/my-submissions-data.ts", "frontend/pages/my-submissions-page.tsx", "MySubmissionsPage", "src/routes/member.ts", 'if (url.pathname === "/api/submissions/mine")'],
  ["tasks", "frontend/lib/tasks-data.ts", "frontend/pages/tasks/tasks-page.tsx", "TasksPage", "src/routes/tasks.ts", 'if (url.pathname === "/api/tasks")'],
];
const fixturePath = "test/fixtures/formal-source-braces.tsx";
const forbidden = /\bnextCursor\b|[?&]cursor=|\bonLoadMore\b|Load More|Load more|加载更多/u;

test("formal numbered pagination scopes use compiler AST boundaries", () => {
  const relativePaths = [...new Set(formalLists.flatMap(([, client, page, , route]) => [client, page, route]).concat(fixturePath))];
  const absolutePaths = relativePaths.map((path) => resolve(repositoryRoot, path));
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: absolutePaths });
  try {
    for (const [name, clientPath, pagePath, pageFunction, routePath, routeMarker] of formalLists) {
      const clientFile = sourceFile(snapshot, clientPath);
      const pageFile = sourceFile(snapshot, pagePath);
      const pageNode = namedFunction(pageFile, pageFunction);
      const pageText = name === "knowledge" ? withoutActivityPanel(pageFile, pageNode) : pageNode.getText(pageFile);
      const routeFile = sourceFile(snapshot, routePath);
      const routeText = matchingIfStatement(routeFile, routeMarker).getText(routeFile);
      for (const [scope, source] of [["client", clientFile.text], ["page", pageText], ["route", routeText]]) {
        assert.doesNotMatch(source, forbidden, `${name} ${scope}`);
      }
    }

    const fixture = sourceFile(snapshot, fixturePath);
    assert.match(namedFunction(fixture, "BraceFixture").getText(fixture), /FORMAL_COMPONENT_SENTINEL/u);
    assert.match(matchingIfStatement(fixture, 'if (path === "/fixture")').getText(fixture), /FORMAL_ROUTE_SENTINEL/u);
  } finally {
    snapshot.dispose();
    api.close();
  }
});

test("every shared pagination caller passes its page locale without English defaults", () => {
  const pagePaths = formalLists.map(([, , pagePath]) => pagePath);
  const absolutePaths = ["frontend/components/data-pagination.tsx", ...pagePaths].map((path) => resolve(repositoryRoot, path));
  const api = new API({ cwd: repositoryRoot });
  const snapshot = api.updateSnapshot({ openFiles: absolutePaths });
  try {
    const component = sourceFile(snapshot, "frontend/components/data-pagination.tsx");
    assert.match(component.text, /frontendPaginationLabels/u);
    assert.match(component.text, /DataPaginationLocalization/u);
    assert.doesNotMatch(component.text, /(?:totalLabel|rangeLabel|pageSizeLabel|previousLabel|nextLabel)\s*=\s*"/u);
    for (const [, , pagePath, pageFunction] of formalLists) {
      const page = sourceFile(snapshot, pagePath);
      const calls = collectNodes(page, (node) => isJsxSelfClosingElement(node) && node.tagName.getText(page) === "DataPagination");
      assert.equal(calls.length, 1, `${pagePath} DataPagination caller`);
      assert.match(calls[0].getText(page), /\blocale=\{locale\}/u, `${pagePath} locale forwarding`);
      assert.doesNotMatch(namedFunction(page, pageFunction).getText(page), /\blocale\?: LocaleRuntime\b/u, `${pagePath} required locale contract`);
    }
  } finally {
    snapshot.dispose();
    api.close();
  }
});

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

function matchingIfStatement(file, marker) {
  const matches = collectNodes(file, (node) => isIfStatement(node) && node.getText(file).startsWith(marker));
  assert.equal(matches.length, 1, marker);
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

function withoutActivityPanel(file, page) {
  const widgets = collectNodes(page, (node) => isJsxSelfClosingElement(node) && node.tagName.getText(file) === "ActivityPanel");
  assert.equal(widgets.length, 1, "knowledge ActivityPanel wiring");
  return page.getText(file).replace(widgets[0].getText(file), "");
}
