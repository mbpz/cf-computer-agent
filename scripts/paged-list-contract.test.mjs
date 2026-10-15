import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");

// Every server-paginated list renders the shared DataTable with its footer pager.
// Infinite scroll (append + near-bottom loading) was retired: desktop users need
// the totals and an explicit page control.
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
];

const retired = /loadingMoreLabel|endOfListLabel|LIST_LOADING_MORE|LIST_END_OF_LIST/u;
const sharedTable = /<DataTable\b/u;
const pagerWiring = /\bpagination=\{/u;
const pageControl = /\bonPageChange\b/u;
const feed = /\bonLoadMore\b/u;

// Desktop pages through the footer pager; narrow viewports keep appending, so
// every list wires both paths and lets the shared table pick by viewport.
function lintPagedList(source) {
  const violations = [];
  if (!sharedTable.test(source)) violations.push("renders no <DataTable>");
  if (!pagerWiring.test(source)) violations.push("passes no page metadata");
  if (!pageControl.test(source)) violations.push("offers no page control");
  if (!feed.test(source)) violations.push("offers no mobile feed");
  if (retired.test(source)) violations.push("still forwards the retired scroll labels");
  return violations;
}

test("every paginated list renders the shared table with its pager", () => {
  for (const [name, pagePath] of pageLists) {
    assert.deepEqual(lintPagedList(readFileSync(resolve(repositoryRoot, pagePath), "utf8")), [], `${name} ${pagePath}`);
  }
});

test("list routes own the page window and the mobile feed", () => {
  const app = readFileSync(resolve(repositoryRoot, "frontend/app.tsx"), "utf8");
  assert.match(app, /\blistPageSize\b/u, "list routes fetch the fixed page size");
  assert.match(app, /onPageChange=/u, "a route still lacks the pager control");
  assert.match(app, /onLoadMore=/u, "a route still lacks the mobile feed");
});

test("the numbered page contract stays intact", () => {
  const numbered = readFileSync(resolve(repositoryRoot, "frontend/lib/numbered-page.ts"), "utf8");
  assert.match(numbered, /export const supportedPageSizes = \[20, 50, 100\] as const/u);
  assert.match(numbered, /export function normalizeNumberedPage/u);
  assert.match(numbered, /export const listPageSize/u);
});

test("the shared pager keeps its locale contract", () => {
  const pager = readFileSync(resolve(repositoryRoot, "frontend/components/data-pagination.tsx"), "utf8");
  assert.match(pager, /frontendPaginationLabels/u);
  assert.doesNotMatch(pager, /(?:totalLabel|rangeLabel|pageSizeLabel|previousLabel|nextLabel)\s*=\s*"/u);
});

test("the checker rejects a list that offers only the mobile feed", () => {
  const fixture = readFileSync(resolve(repositoryRoot, "test/fixtures/paged-list-contract.tsx"), "utf8");
  const good = fixture.slice(fixture.indexOf("function PagedListFixture"), fixture.indexOf("function FeedOnlyFixture"));
  const bad = fixture.slice(fixture.indexOf("function FeedOnlyFixture"));
  assert.deepEqual(lintPagedList(good), []);
  assert.deepEqual(lintPagedList(bad), ["passes no page metadata", "offers no page control"]);
  assert.match(fixture, /PAGED_LIST_FIXTURE_SENTINEL/u);
});
