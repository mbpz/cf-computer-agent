// @vitest-environment node
import { describe, expect, it } from "vitest";
import { capabilitiesFor } from "../../src/authorization/policy";
import { permissionMaskFor } from "../../src/authorization/permission-bitmap";
import type { MemberPrincipal } from "../../src/identity/principal";

function contributor(mask?: bigint): MemberPrincipal {
  return { kind: "member", memberId: "member-1", identitySubject: "member:member-1", email: "member@example.test", role: "contributor", ...(mask === undefined ? {} : { permissionMask: mask }) };
}

describe("delegated review capability snapshot", () => {
  it("adds review from the effective mask without granting admin read-all", () => {
    const caps = capabilitiesFor(contributor(permissionMaskFor(["knowledge:read", "knowledge:review", "submission:create", "submission:read-own", "workspace.tasks"])));
    expect(caps).toContain("knowledge:review");
    expect(caps).not.toContain("submission:read-all");
    expect(caps).toContain("submission:read-own");
  });

  it("does not infer review from the role alone", () => {
    expect(capabilitiesFor(contributor(permissionMaskFor(["knowledge:read", "submission:create"])))).not.toContain("knowledge:review");
    expect(capabilitiesFor(contributor())).not.toContain("knowledge:review");
  });
});
