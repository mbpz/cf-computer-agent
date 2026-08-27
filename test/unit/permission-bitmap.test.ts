import { describe, expect, it } from "vitest";
import {
  PERMISSION_BITS,
  capabilitiesForMask,
  hasPermission,
  parsePermissionMask,
  permissionMaskFor,
} from "../../src/authorization/permission-bitmap";

describe("permission bitmap", () => {
  it("keeps stable bit indexes and composes a hexadecimal-safe mask", () => {
    expect(PERMISSION_BITS["knowledge:read"]).toBe(0);
    expect(PERMISSION_BITS["analytics:read"]).toBe(14);
    const mask = permissionMaskFor(["knowledge:read", "analytics:read"]);
    expect(mask).toBe(1n | (1n << 14n));
    expect(parsePermissionMask("0x4001")).toBe(mask);
  });

  it("checks permissions with bigint without number precision loss", () => {
    const mask = 1n << 63n;
    expect(hasPermission(mask, 63)).toBe(true);
    expect(hasPermission(mask, 62)).toBe(false);
  });

  it("projects a mask to stable capability names", () => {
    const mask = permissionMaskFor(["knowledge:read", "search:use", "analytics:read"]);
    expect(capabilitiesForMask(mask)).toEqual(["knowledge:read", "analytics:read", "search:use"]);
  });

  it("rejects unknown permissions and malformed masks", () => {
    expect(() => permissionMaskFor(["not-a-permission"])).toThrow("PERMISSION_UNKNOWN");
    expect(() => parsePermissionMask("4001")).toThrow("PERMISSION_MASK_INVALID");
    expect(() => parsePermissionMask("0x0")).not.toThrow();
    expect(() => parsePermissionMask("0x-1")).toThrow("PERMISSION_MASK_INVALID");
  });
});
