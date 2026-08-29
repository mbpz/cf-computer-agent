// @vitest-environment node
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { ROUTES, requiredCapability } from "../../frontend/contracts/routes";
import { parseSessionPayload } from "../../frontend/contracts/api";

const formalPageSources = import.meta.glob([
  "../../frontend/lib/admin-{analytics,audit,members,review,assets,duplicates}-data.ts",
  "../../frontend/lib/{knowledge,search,my-submissions,tasks}-data.ts",
], { eager: true, import: "default", query: "?raw" }) as Record<string, string>;

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
    expect(Object.keys(formalPageSources)).toHaveLength(10);
    for (const [path, source] of Object.entries(formalPageSources)) {
      expect(source, path).not.toMatch(/nextCursor|[?&]cursor=|onLoadMore|Load More|Load more|加载更多/u);
    }
    expect(Object.keys(documentedCursorSources).length).toBeGreaterThan(0);
    expect(Object.values(documentedCursorSources).join("\n")).toMatch(/nextCursor|cursor/u);
  });
});
