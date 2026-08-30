import type { SessionSnapshot } from "../contracts/api";
import type { FrontendCapability } from "../contracts/routes";
import { routeAccessAllowed, type RouteAccessTarget } from "./route-access";

export type FrontendAccess = { kind: "allow" } | { kind: "redirect"; href: "/auth/github" } | { kind: "forbidden" };

export function resolveFrontendAccess({ session, route, requiredCapability = null }: { session: SessionSnapshot | null; route?: RouteAccessTarget | null; requiredCapability?: FrontendCapability | null }): FrontendAccess {
  if (!session) return { kind: "redirect", href: "/auth/github" };
  return routeAccessAllowed(session, route ?? { capability: requiredCapability }) ? { kind: "allow" } : { kind: "forbidden" };
}
