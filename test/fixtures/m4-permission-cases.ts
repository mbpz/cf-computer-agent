import type { PermissionLeakCase } from "../../src/evaluation/permission-leaks";

export const M4_PERMISSION_LEAK_CASES: readonly PermissionLeakCase[] = Object.freeze([
  { id: "shared-contributor", surface: "shared", expectedVisible: true },
  { id: "admin-only-contributor", surface: "admin_only", expectedVisible: false },
  { id: "admin-only-admin", surface: "admin_only", expectedVisible: true },
  { id: "disabled-contributor", surface: "disabled", expectedVisible: false },
  { id: "historical-hidden", surface: "history", expectedVisible: false },
  { id: "historical-visible", surface: "history", expectedVisible: true },
  { id: "deleted-item", surface: "deleted", expectedVisible: false },
]);
