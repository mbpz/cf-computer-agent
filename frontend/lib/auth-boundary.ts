import type { SessionSnapshot } from "../contracts/api";
import type { FrontendCapability } from "../contracts/routes";
import { PERMISSION_BITS, hasPermission, parsePermissionMask } from "../../src/authorization/permission-bitmap";

export type FrontendAccess = { kind: "allow" } | { kind: "redirect"; href: "/auth/github" } | { kind: "forbidden" };

export function resolveFrontendAccess({ session, requiredCapability }: { session: SessionSnapshot | null; requiredCapability: FrontendCapability | null }): FrontendAccess {
  if (!session) return { kind: "redirect", href: "/auth/github" };
  if (requiredCapability && !session.capabilities.includes(requiredCapability)
    && !(requiredCapability === "analytics:read" && session.capabilities.includes("audit:read"))
    && !hasMaskedCapability(session, requiredCapability)) return { kind: "forbidden" };
  return { kind: "allow" };
}

function hasMaskedCapability(session: SessionSnapshot, capability: FrontendCapability): boolean {
  if (!session.permissionMask) return false;
  const bit = PERMISSION_BITS[capability as keyof typeof PERMISSION_BITS];
  if (bit === undefined) return false;
  try { return hasPermission(parsePermissionMask(session.permissionMask), bit); } catch { return false; }
}
