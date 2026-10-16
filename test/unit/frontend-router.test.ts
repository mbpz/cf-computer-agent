// @vitest-environment node
import { describe, expect, it } from "vitest";
import { matchRoute } from "../../frontend/lib/router";

describe("frontend route adapter", () => {
  it("matches exact and parameterized routes with capability metadata", () => {
    expect(matchRoute("/knowledge")).toMatchObject({ path: "/knowledge", capability: "knowledge:read" });
    expect(matchRoute("/knowledge/revision-1")).toMatchObject({ path: "/knowledge/:id", params: { id: "revision-1" } });
    expect(matchRoute("/admin/submissions/sub-1")).toMatchObject({ path: "/admin/submissions/:id", capability: "knowledge:review" });
    // The role pages are gated even though they are not navigation entries.
    expect(matchRoute("/admin/roles/role-1")).toMatchObject({ path: "/admin/roles/:id", capability: "role:manage", params: { id: "role-1" } });
    expect(matchRoute("/admin/roles/new")).toMatchObject({ capability: "role:manage" });
  });

  it("returns null for unknown routes and unsafe empty ids", () => {
    expect(matchRoute("/not-a-route")).toBeNull();
    expect(matchRoute("/knowledge/")).toBeNull();
    expect(matchRoute("/knowledge/a%2Fb")).toBeNull();
  });
});
