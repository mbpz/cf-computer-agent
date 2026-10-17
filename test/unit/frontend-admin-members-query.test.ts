import { describe, expect, it } from "vitest";
import { normalizeAdminMembersTab, parseAdminMembersTab, writeAdminMembersTab } from "../../frontend/lib/admin-members-query";

describe("admin members tab query", () => {
  it("defaults to the members tab for a missing, duplicated, or unknown value", () => {
    expect(parseAdminMembersTab("")).toBe("members");
    expect(parseAdminMembersTab("?status=active")).toBe("members");
    expect(parseAdminMembersTab("?tab=")).toBe("members");
    expect(parseAdminMembersTab("?tab=bogus")).toBe("members");
    expect(parseAdminMembersTab("?tab=members&tab=invitations")).toBe("members");
    expect(parseAdminMembersTab("?tab=invitations")).toBe("invitations");
  });

  it("omits the default tab and preserves every other param", () => {
    expect(writeAdminMembersTab("", "members")).toBe("");
    expect(writeAdminMembersTab("?tab=invitations", "members")).toBe("");
    expect(writeAdminMembersTab("?status=active&page=2&pageSize=50", "invitations")).toBe("?status=active&page=2&pageSize=50&tab=invitations");
    expect(writeAdminMembersTab("?status=active&tab=members", "invitations")).toBe("?status=active&tab=invitations");
  });

  it("normalizes only non-canonical tabs", () => {
    expect(normalizeAdminMembersTab("")).toBeNull();
    expect(normalizeAdminMembersTab("?status=active")).toBeNull();
    expect(normalizeAdminMembersTab("?tab=invitations")).toBeNull();
    expect(normalizeAdminMembersTab("?tab=members")).toBe("");
    expect(normalizeAdminMembersTab("?status=active&tab=bogus")).toBe("?status=active");
    expect(normalizeAdminMembersTab("?tab=invitations&tab=invitations")).toBe("");
  });
});
