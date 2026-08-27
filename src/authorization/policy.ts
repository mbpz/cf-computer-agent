import { AppError } from "../http";
import type { Principal } from "../identity/principal";
import { PERMISSION_BITS, hasPermission, permissionMaskFor, serializePermissionMask, type PermissionKey } from "./permission-bitmap";

export type Capability =
  | "legacy:read"
  | "legacy:write"
  | "submission:create"
  | "submission:read-own"
  | "submission:read-all"
  | "member:manage"
  | "space:manage"
  | "audit:read"
  | "knowledge:read"
  | "knowledge:review"
  | "analytics:read"
  | "role:manage"
  | "menu:manage"
  | "tasks:use";

const contributorCapabilities = Object.freeze<readonly Capability[]>([
  "legacy:read",
  "submission:create",
  "submission:read-own",
  "knowledge:read",
  "tasks:use",
]);

const adminCapabilities = Object.freeze<readonly Capability[]>([
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
  "tasks:use",
]);

const automationCapabilities = Object.freeze<readonly Capability[]>(["legacy:read", "legacy:write"]);

export function capabilitiesFor(principal: Principal): readonly Capability[] {
  if (principal.kind === "automation") return automationCapabilities;
  return principal.role === "admin" ? adminCapabilities : contributorCapabilities;
}

/** Compatibility role masks for the workspace UI. Legacy capabilities stay
 * in capabilitiesFor so existing API consumers do not change behavior. */
export function permissionMaskForPrincipal(principal: Principal): string {
  if (principal.kind === "automation") return "0x0";
  if (principal.permissionMask !== undefined) return serializePermissionMask(principal.permissionMask);
  if (principal.role === "admin") {
    return serializePermissionMask(permissionMaskFor([
      "knowledge:read", "knowledge:create", "knowledge:edit", "knowledge:review", "knowledge:publish", "knowledge:delete",
      "submission:create", "submission:read-own", "submission:read-all", "member:manage", "role:manage", "menu:manage",
      "space:manage", "audit:read", "analytics:read", "asset:manage", "duplicate:review", "agent:use", "search:use",
      "workspace.tasks",
    ]));
  }
  return serializePermissionMask(permissionMaskFor([
    "knowledge:read", "knowledge:create", "submission:create", "submission:read-own", "agent:use", "search:use",
    "workspace.tasks",
  ]));
}

export function requireCapability(principal: Principal, capability: Capability): void {
  const adminOnlyWorkspaceCapability = principal.kind === "member"
    && principal.role === "admin"
    && (capability === "analytics:read" || capability === "role:manage" || capability === "menu:manage");
  const effectivePermission = principal.kind === "member" && principal.permissionMask !== undefined
    ? permissionForCapability(capability, principal.permissionMask)
    : false;
  if (!capabilitiesFor(principal).includes(capability) && !adminOnlyWorkspaceCapability && !effectivePermission) {
    throw new AppError("FORBIDDEN", "Capability is not permitted", 403);
  }
}

const capabilityPermission: Partial<Record<Capability, PermissionKey>> = {
  "knowledge:read": "knowledge:read",
  "knowledge:review": "knowledge:review",
  "submission:create": "submission:create",
  "submission:read-own": "submission:read-own",
  "submission:read-all": "submission:read-all",
  "member:manage": "member:manage",
  "role:manage": "role:manage",
  "menu:manage": "menu:manage",
  "space:manage": "space:manage",
  "audit:read": "audit:read",
  "analytics:read": "analytics:read",
  "tasks:use": "workspace.tasks",
};

function permissionForCapability(capability: Capability, mask: bigint): boolean {
  const key = capabilityPermission[capability];
  return key === undefined ? false : hasPermission(mask, PERMISSION_BITS[key]);
}
