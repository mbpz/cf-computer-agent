import { AppError } from "../http";
import type { Principal } from "../identity/principal";
import { permissionMaskFor, serializePermissionMask } from "./permission-bitmap";

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
  | "knowledge:review";

const contributorCapabilities = Object.freeze<readonly Capability[]>([
  "legacy:read",
  "submission:create",
  "submission:read-own",
  "knowledge:read",
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
  if (principal.role === "admin") {
    return serializePermissionMask(permissionMaskFor([
      "knowledge:read", "knowledge:create", "knowledge:edit", "knowledge:review", "knowledge:publish", "knowledge:delete",
      "submission:create", "submission:read-own", "submission:read-all", "member:manage", "role:manage", "menu:manage",
      "space:manage", "audit:read", "analytics:read", "asset:manage", "duplicate:review", "agent:use", "search:use",
    ]));
  }
  return serializePermissionMask(permissionMaskFor([
    "knowledge:read", "knowledge:create", "submission:create", "submission:read-own", "agent:use", "search:use",
  ]));
}

export function requireCapability(principal: Principal, capability: Capability): void {
  if (!capabilitiesFor(principal).includes(capability)) {
    throw new AppError("FORBIDDEN", "Capability is not permitted", 403);
  }
}
