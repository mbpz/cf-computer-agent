import { describe, expect, it } from "vitest";
import { navigationForSession } from "../../public/navigation.js";

describe("navigationForSession", () => {
  it("keeps administration links out of contributor navigation", () => {
    const navigation = navigationForSession({
      member: { id: "member-1", email: "contributor@example.test", role: "contributor" },
      capabilities: ["legacy:read", "submission:create", "submission:read-own", "knowledge:read"],
    });

    expect(navigation.map((item) => item.href)).toEqual([
      "/", "/submit", "/knowledge", "/search", "/agent", "/my-submissions",
    ]);
    expect(navigation.filter((item) => item.group === "workspace").map((item) => item.label)).toEqual([
      "Home", "Submit", "Library", "Search", "Agent", "My Submissions",
    ]);
  });

  it("adds all six administration destinations for an administrator", () => {
    const navigation = navigationForSession({
      member: { id: "member-1", email: "admin@example.test", role: "admin" },
      capabilities: ["legacy:read", "legacy:write", "submission:create", "submission:read-own", "submission:read-all", "member:manage", "space:manage", "audit:read", "knowledge:read", "knowledge:review"],
    });

    expect(navigation.filter((item) => item.group === "admin").map((item) => item.href)).toEqual([
      "/admin", "/admin/submissions", "/admin/assets", "/admin/members", "/admin/spaces", "/admin/audit",
    ]);
    expect(navigation.filter((item) => item.group === "admin").map((item) => item.label)).toEqual([
      "Administration", "Review Queue", "Asset Queue", "Members", "Spaces", "Audit",
    ]);
  });

  it("does not infer M1 navigation from a role when the server capability is absent", () => {
    const navigation = navigationForSession({
      member: { id: "member-1", email: "admin@example.test", role: "admin" },
      capabilities: ["legacy:read", "submission:read-all"],
    });

    expect(navigation.map((item) => item.href)).not.toContain("/knowledge");
    expect(navigation.map((item) => item.href)).not.toContain("/admin/submissions");
  });

  it("does not construct browser navigation for automation", () => {
    expect(navigationForSession(null)).toEqual([]);
  });
});
