// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ROUTES, requiredCapability } from "../../frontend/contracts/routes";
import { parseSessionPayload } from "../../frontend/contracts/api";

describe("frontend route contract", () => {
  it("keeps the existing public and admin routes", () => {
    expect(ROUTES.map((route) => route.path)).toEqual(expect.arrayContaining([
      "/", "/submit", "/knowledge", "/search", "/agent", "/my-submissions",
      "/admin", "/admin/submissions", "/admin/assets", "/admin/members", "/admin/spaces", "/admin/audit",
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
});
