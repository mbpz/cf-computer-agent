import { AppError } from "../http";
import type { Principal } from "../identity/principal";

export type Capability =
  | "legacy:read"
  | "legacy:write"
  | "submission:create"
  | "submission:read-own"
  | "submission:read-all"
  | "member:manage"
  | "space:manage"
  | "audit:read";

const contributorCapabilities = Object.freeze<readonly Capability[]>([
  "legacy:read",
  "submission:create",
  "submission:read-own",
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
]);

const automationCapabilities = Object.freeze<readonly Capability[]>(["legacy:read", "legacy:write"]);

export function capabilitiesFor(principal: Principal): readonly Capability[] {
  if (principal.kind === "automation") return automationCapabilities;
  return principal.role === "admin" ? adminCapabilities : contributorCapabilities;
}

export function requireCapability(principal: Principal, capability: Capability): void {
  if (!capabilitiesFor(principal).includes(capability)) {
    throw new AppError("FORBIDDEN", "Capability is not permitted", 403);
  }
}
