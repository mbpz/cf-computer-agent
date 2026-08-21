import { describe, expect, it } from "vitest";
import { capabilitiesFor, requireCapability, type Capability } from "../../src/authorization/policy";
import type { Principal } from "../../src/identity/principal";

const contributor: Principal = {
  kind: "member",
  memberId: "member-contributor",
  identitySubject: "github:101",
  email: "contributor@example.test",
  role: "contributor",
};

const admin: Principal = { ...contributor, memberId: "member-admin", role: "admin" };
const automation: Principal = { kind: "automation", role: "automation" };

describe("capabilitiesFor", () => {
  it.each<[Principal, Capability[]]>([
    [contributor, ["legacy:read", "submission:create", "submission:read-own", "knowledge:read"]],
    [admin, [
      "legacy:read",
      "legacy:write",
      "submission:create",
      "submission:read-own",
      "submission:read-all",
      "member:manage",
      "space:manage",
      "audit:read",
      "knowledge:read",
      "knowledge:review",
    ]],
    [automation, ["legacy:read", "legacy:write"]],
  ])("returns the least-privilege capability set for %#", (principal, expected) => {
    expect(capabilitiesFor(principal)).toEqual(expected);
  });

  it("returns an immutable capability set that cannot change the shared policy", () => {
    const capabilities = capabilitiesFor(automation);

    expect(() => (capabilities as Capability[]).push("member:manage")).toThrow();
    expect(capabilitiesFor(automation)).toEqual(["legacy:read", "legacy:write"]);
  });
});

describe("requireCapability", () => {
  it("rejects an unavailable capability without changing the principal", () => {
    try {
      requireCapability(contributor, "member:manage");
      throw new Error("expected capability check to reject");
    } catch (error) {
      expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
  });

  it("returns when the principal has the requested capability", () => {
    expect(() => requireCapability(admin, "audit:read")).not.toThrow();
  });

  it("allows members to read knowledge while reserving review for administrators", () => {
    expect(() => requireCapability(contributor, "knowledge:read")).not.toThrow();
    try {
      requireCapability(contributor, "knowledge:review");
      throw new Error("expected review capability check to reject a contributor");
    } catch (error) {
      expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
    expect(() => requireCapability(admin, "knowledge:review")).not.toThrow();
  });
});
