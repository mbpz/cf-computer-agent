export type PermissionSurface = "shared" | "admin_only" | "disabled" | "history" | "deleted";
export type PermissionLeakCase = { id: string; surface: PermissionSurface; expectedVisible: boolean };

export function countPermissionLeaks(cases: readonly PermissionLeakCase[], observed: ReadonlyMap<string, boolean>): number {
  let leaks = 0;
  for (const item of cases) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(item.id)) throw new Error("PERMISSION_CASE_INVALID");
    const actual = observed.get(item.id);
    if (typeof actual !== "boolean") throw new Error("PERMISSION_OBSERVATION_MISSING");
    if (actual !== item.expectedVisible) leaks += 1;
  }
  return leaks;
}
