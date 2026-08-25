import type { SessionSnapshot } from "../contracts/api";
import type { FrontendCapability } from "../contracts/routes";

export type FrontendAccess = { kind: "allow" } | { kind: "redirect"; href: "/auth/github" } | { kind: "forbidden" };

export function resolveFrontendAccess({ session, requiredCapability }: { session: SessionSnapshot | null; requiredCapability: FrontendCapability | null }): FrontendAccess {
  if (!session) return { kind: "redirect", href: "/auth/github" };
  if (requiredCapability && !session.capabilities.includes(requiredCapability)) return { kind: "forbidden" };
  return { kind: "allow" };
}
