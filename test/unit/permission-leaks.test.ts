import { describe, expect, it } from "vitest";
import { M4_PERMISSION_LEAK_CASES } from "../fixtures/m4-permission-cases";
import { countPermissionLeaks } from "../../src/evaluation/permission-leaks";

describe("permission leak evaluation", () => {
  it("covers shared, private, disabled, history, and deleted surfaces", () => {
    expect(new Set(M4_PERMISSION_LEAK_CASES.map((item) => item.surface))).toEqual(new Set(["shared", "admin_only", "disabled", "history", "deleted"]));
    const observed = new Map(M4_PERMISSION_LEAK_CASES.map((item) => [item.id, item.expectedVisible] as const));
    expect(countPermissionLeaks(M4_PERMISSION_LEAK_CASES, observed)).toBe(0);
  });

  it("counts a visibility regression instead of hiding it", () => {
    const observed = new Map(M4_PERMISSION_LEAK_CASES.map((item) => [item.id, item.expectedVisible] as const));
    observed.set("deleted-item", true);
    expect(countPermissionLeaks(M4_PERMISSION_LEAK_CASES, observed)).toBe(1);
  });
});
