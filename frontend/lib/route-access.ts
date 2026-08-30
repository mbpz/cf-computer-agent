import type { SessionSnapshot } from "../contracts/api";
import type { PermissionKey } from "../../src/authorization/permission-bitmap";
import { PERMISSION_BITS, hasPermission, parsePermissionMask } from "../../src/authorization/permission-bitmap";
import type { WorkspaceCapability } from "../../shared/workspace-route-capabilities";

export interface RouteAccessTarget {
  capability: WorkspaceCapability | null;
  requiredPermission?: PermissionKey;
}

export function routeAccessAllowed(session: SessionSnapshot, route: RouteAccessTarget): boolean {
  return hasSemanticCapability(session, route.capability)
    && (route.requiredPermission === undefined || hasPermissionKey(session, route.requiredPermission));
}

function hasSemanticCapability(session: SessionSnapshot, capability: WorkspaceCapability | null): boolean {
  if (capability === null || session.capabilities.includes(capability)) return true;
  if (capability === "analytics:read" && session.capabilities.includes("audit:read")) return true;
  return hasPermissionKey(session, capability);
}

function hasPermissionKey(session: SessionSnapshot, permission: PermissionKey): boolean {
  if (!session.permissionMask) return false;
  try {
    return hasPermission(parsePermissionMask(session.permissionMask), PERMISSION_BITS[permission]);
  } catch {
    return false;
  }
}
