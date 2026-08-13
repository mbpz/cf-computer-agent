import { describe, expect, it } from "vitest";
import { capabilitiesFor, requireCapability, type Capability } from "../../src/authorization/policy";
import type { Principal } from "../../src/identity/principal";

const contributor: Principal = {
  kind: "member",
  memberId: "member-contributor",
  accessSub: "access-subject-contributor",
  email: "contributor@example.test",
  role: "contributor",
};

const admin: Principal = { ...contributor, memberId: "member-admin", role: "admin" };
const automation: Principal = { kind: "automation", role: "automation" };

describe("capabilitiesFor", () => {
  it.each<[Principal, Capability[]]>([
    [contributor, ["legacy:read", "submission:create", "submission:read-own"]],
    [admin, [
      "legacy:read",
      "legacy:write",
      "submission:create",
      "submission:read-own",
      "submission:read-all",
      "member:manage",
      "space:manage",
      "audit:read",
    ]],
    [automation, ["legacy:read", "legacy:write"]],
  ])("returns the least-privilege capability set for %#", (principal, expected) => {
    expect(capabilitiesFor(principal)).toEqual(expected);
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
});
