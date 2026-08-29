// @vitest-environment node
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { ROUTES, requiredCapability } from "../../frontend/contracts/routes";
import { parseSessionPayload } from "../../frontend/contracts/api";

const formalClientSources = import.meta.glob([
  "../../frontend/lib/admin-{analytics,audit,members,review,assets,duplicates}-data.ts",
  "../../frontend/lib/{knowledge,search,my-submissions,tasks}-data.ts",
], { eager: true, import: "default", query: "?raw" }) as Record<string, string>;

const formalPageSources = import.meta.glob([
  "../../frontend/pages/admin/{analytics,audit,members,review-queue,asset-queue,duplicate-queue}-page.tsx",
  "../../frontend/pages/{knowledge,search,my-submissions}-page.tsx",
  "../../frontend/pages/tasks/tasks-page.tsx",
], { eager: true, import: "default", query: "?raw" }) as Record<string, string>;

const formalRouteSources = import.meta.glob([
  "../../src/routes/{admin,library,member,tasks}.ts",
], { eager: true, import: "default", query: "?raw" }) as Record<string, string>;

const formalLists = [
  ["analytics", "admin-analytics-data.ts", "admin/analytics-page.tsx", "AdminAnalyticsPage", "admin.ts", 'if (url.pathname === "/api/admin/analytics/overview")'],
  ["audit", "admin-audit-data.ts", "admin/audit-page.tsx", "AuditPage", "admin.ts", 'if (url.pathname === "/api/admin/audit-events")'],
  ["members", "admin-members-data.ts", "admin/members-page.tsx", "MembersPage", "admin.ts", 'if (url.pathname === "/api/admin/members")'],
  ["review", "admin-review-data.ts", "admin/review-queue-page.tsx", "ReviewQueuePage", "admin.ts", 'if (url.pathname === "/api/admin/submissions")'],
  ["assets", "admin-assets-data.ts", "admin/asset-queue-page.tsx", "AssetQueuePage", "admin.ts", 'if (url.pathname === "/api/admin/assets")'],
  ["duplicates", "admin-duplicates-data.ts", "admin/duplicate-queue-page.tsx", "DuplicateQueuePage", "admin.ts", 'if (url.pathname === "/api/admin/duplicates")'],
  ["knowledge", "knowledge-data.ts", "knowledge-page.tsx", "KnowledgePage", "library.ts", 'if (url.pathname === "/api/knowledge")'],
  ["search", "search-data.ts", "search-page.tsx", "SearchPage", "library.ts", 'if (url.pathname === "/api/knowledge/search")'],
  ["submissions", "my-submissions-data.ts", "my-submissions-page.tsx", "MySubmissionsPage", "member.ts", 'if (url.pathname === "/api/submissions/mine")'],
  ["tasks", "tasks-data.ts", "tasks/tasks-page.tsx", "TasksPage", "tasks.ts", 'if (url.pathname === "/api/tasks")'],
] as const;

// Intentionally outside the ten formal numbered pages: dashboard activity,
// favorites, recent visits, private notes, research runs, R2 orphan cleanup,
// and background asset processing keep bounded cursor/keyset workflows.
const documentedCursorSources = import.meta.glob([
  "../../frontend/lib/activity-data.ts",
  "../../src/{favorites,recent-visits,private-notes,research}/*.ts",
  "../../src/ai/research-report-service.ts",
  "../../src/assets/{repository,service,types}.ts",
  "../../src/routes/admin.ts",
], { eager: true, import: "default", query: "?raw" }) as Record<string, string>;

describe("frontend route contract", () => {
  it("keeps the existing public and admin routes", () => {
    expect(ROUTES.map((route) => route.path)).toEqual(expect.arrayContaining([
      "/", "/submit", "/knowledge", "/search", "/agent", "/my-submissions",
      "/admin", "/admin/submissions", "/admin/duplicates", "/admin/assets", "/admin/members", "/admin/spaces", "/admin/audit",
    ]));
    expect(requiredCapability("/admin/assets")).toBe("submission:read-all");
    expect(requiredCapability("/knowledge")).toBe("knowledge:read");
  });

  it("normalizes only the server-issued session shape", () => {
    expect(parseSessionPayload({
      member: { id: "member-1", email: "owner@example.test", role: "admin" },
      capabilities: ["knowledge:read", "member:manage"],
      logoutUrl: "/auth/logout",
    })).toEqual({
      member: { id: "member-1", email: "owner@example.test", role: "admin" },
      capabilities: ["knowledge:read", "member:manage"],
      logoutUrl: "/auth/logout",
    });
    expect(() => parseSessionPayload({ member: { id: "member-1" }, capabilities: [] })).toThrow("SESSION_INVALID");
  });

  it("keeps all ten formal page sources on numbered pagination only", async () => {
    expect(Object.keys(formalClientSources)).toHaveLength(10);
    expect(Object.keys(formalPageSources)).toHaveLength(10);
    expect(Object.keys(formalRouteSources)).toHaveLength(4);
    for (const [name, clientSuffix, pageSuffix, pageFunction, routeSuffix, routeMarker] of formalLists) {
      const client = sourceEndingWith(formalClientSources, clientSuffix);
      const rawPage = extractFunction(sourceEndingWith(formalPageSources, pageSuffix), pageFunction);
      const page = name === "knowledge" ? excludeDocumentedKnowledgeActivity(rawPage) : rawPage;
      const route = extractIfStatement(sourceEndingWith(formalRouteSources, routeSuffix), routeMarker);
      for (const [scope, source] of [["client", client], ["page", page], ["route", route]] as const) {
        expect(source, `${name} ${scope}`).not.toMatch(/nextCursor|[?&]cursor=|onLoadMore|Load More|Load more|加载更多/u);
      }
    }
    expect(Object.keys(documentedCursorSources).length).toBeGreaterThan(0);
    expect(Object.values(documentedCursorSources).join("\n")).toMatch(/nextCursor|cursor/u);
  });
});

function sourceEndingWith(sources: Record<string, string>, suffix: string): string {
  const matches = Object.entries(sources).filter(([path]) => path.endsWith(suffix));
  expect(matches, suffix).toHaveLength(1);
  return matches[0]![1];
}

function extractFunction(source: string, functionName: string): string {
  const marker = `export function ${functionName}`;
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, marker).toBeGreaterThanOrEqual(0);
  const bodyMatch = /\)\s*\{/gu.exec(source.slice(markerIndex));
  expect(bodyMatch, `${functionName} body`).toBeTruthy();
  const openIndex = markerIndex + bodyMatch!.index + bodyMatch![0].lastIndexOf("{");
  return source.slice(markerIndex, balancedBlockEnd(source, openIndex));
}

function extractIfStatement(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, marker).toBeGreaterThanOrEqual(0);
  const openIndex = source.indexOf("{", markerIndex + marker.length);
  expect(openIndex, `${marker} body`).toBeGreaterThan(markerIndex);
  return source.slice(markerIndex, balancedBlockEnd(source, openIndex));
}

function balancedBlockEnd(source: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return index + 1;
  }
  throw new Error(`Unbalanced source block at ${openIndex}`);
}

function excludeDocumentedKnowledgeActivity(source: string): string {
  const withoutWidget = source.replace(/\{activity\.length > 0 && <ActivityPanel\b.*?\/>\}/su, "");
  expect(withoutWidget, "knowledge activity widget exclusion").not.toBe(source);
  return withoutWidget
    .replaceAll("activityNextCursor", "documentedActivityCursor")
    .replaceAll("onLoadMoreActivity", "documentedActivityLoad");
}
