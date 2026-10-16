import { permissionMaskFor, type PermissionKey } from "../../../src/authorization/permission-bitmap";

/** Workbench bits a default administrator may still add to itself. */
export const workbenchKeys = ["workspace.tasks", "workspace.vm"] as const satisfies readonly PermissionKey[];
export const workbenchMask = permissionMaskFor(workbenchKeys);

/** The bounded matrix shared by the role detail editor and the create form. */
export const permissionGroups: ReadonlyArray<{ labelKey: string; keys: readonly PermissionKey[] }> = [
  { labelKey: "ADMIN_ROLES_GROUP_KNOWLEDGE", keys: ["knowledge:read", "knowledge:create", "knowledge:edit", "knowledge:review", "knowledge:publish", "knowledge:delete"] },
  { labelKey: "ADMIN_ROLES_GROUP_SUBMISSIONS", keys: ["submission:create", "submission:read-own", "submission:read-all"] },
  { labelKey: "ADMIN_ROLES_GROUP_GOVERNANCE", keys: ["member:manage", "role:manage", "menu:manage", "space:manage", "audit:read", "analytics:read"] },
  { labelKey: "ADMIN_ROLES_GROUP_OPERATIONS", keys: ["asset:manage", "duplicate:review", "agent:use", "search:use", "workspace.tasks", "workspace.vm"] },
];

export function permissionLabelKey(key: PermissionKey): string {
  return `ADMIN_ROLES_PERMISSION_${key.replace(/[:.]/gu, "_").replaceAll("-", "_").toUpperCase()}`;
}
