import { describe, expect, it } from "vitest";
import { parseSessionPayload } from "../../frontend/contracts/api";

describe("session permission projection", () => {
  it("accepts an optional hexadecimal permission mask without changing legacy fields", () => {
    const session = parseSessionPayload({
      member: { id: "m1", email: "admin@example.com", role: "admin" },
      capabilities: ["knowledge:read"],
      permissionMask: "0x4001",
      logoutUrl: "/auth/logout",
    });
    expect(session.permissionMask).toBe("0x4001");
    expect(session.capabilities).toEqual(["knowledge:read"]);
  });

  it("fails closed for a malformed permission mask", () => {
    expect(() => parseSessionPayload({
      member: { id: "m1", email: "admin@example.com", role: "admin" },
      capabilities: [],
      permissionMask: "0x-1",
      logoutUrl: "/auth/logout",
    })).toThrow("SESSION_INVALID");
  });
});
