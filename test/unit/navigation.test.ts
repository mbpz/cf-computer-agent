import { describe, expect, it } from "vitest";
import { navigationForSession } from "../../public/navigation.js";

describe("navigationForSession", () => {
  it("keeps administration links out of contributor navigation", () => {
    const navigation = navigationForSession({
      member: { id: "member-1", email: "contributor@example.test", role: "contributor" },
      capabilities: ["legacy:read", "submission:create", "submission:read-own"],
    });

    expect(navigation.map((item) => item.href)).toEqual([
      "/", "/submit", "/knowledge", "/search", "/agent", "/my-submissions",
    ]);
  });

  it("adds all five administration destinations for an administrator", () => {
    const navigation = navigationForSession({
      member: { id: "member-1", email: "admin@example.test", role: "admin" },
      capabilities: ["legacy:read", "legacy:write", "submission:create", "submission:read-own", "submission:read-all", "member:manage", "space:manage", "audit:read"],
    });

    expect(navigation.filter((item) => item.group === "admin").map((item) => item.href)).toEqual([
      "/admin", "/admin/submissions", "/admin/members", "/admin/spaces", "/admin/audit",
    ]);
  });

  it("does not construct browser navigation for automation", () => {
    expect(navigationForSession(null)).toEqual([]);
  });
});
