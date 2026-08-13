import { verifyAutomationToken, type AuthEnvironment } from "../auth";
import { APP_CONFIG } from "../config";
import { verifyAccessJwt, type AccessEnvironment, type AccessIdentity, type VerifiedAccessAssertion } from "./access-jwt";
import type { Member } from "../members/types";

export interface MemberPrincipal {
  kind: "member";
  memberId: string;
  accessSub: string;
  email: string;
  role: "admin" | "contributor";
}

export interface AutomationPrincipal {
  kind: "automation";
  role: "automation";
}

export type Principal = MemberPrincipal | AutomationPrincipal;

export interface PrincipalEnvironment extends AuthEnvironment, AccessEnvironment {}

export interface ResolvePrincipalDependencies {
  members: Pick<MembersResolver, "resolveFirstLogin">;
  verifyAccessJwt?: (request: Request, env: AccessEnvironment) => Promise<VerifiedAccessAssertion>;
}

interface MembersResolver {
  resolveFirstLogin(identity: AccessIdentity): Promise<Member>;
}

export async function resolvePrincipal(
  request: Request,
  env: PrincipalEnvironment,
  dependencies: ResolvePrincipalDependencies,
): Promise<Principal> {
  if (request.headers.has(APP_CONFIG.accessJwtAssertionHeader)) {
    const assertion = await (dependencies.verifyAccessJwt || verifyAccessJwt)(request, env);
    if (assertion.kind === "service") {
      await verifyAutomationToken(request, env);
      return { kind: "automation", role: "automation" };
    }
    return memberPrincipal(await dependencies.members.resolveFirstLogin(assertion));
  }

  await verifyAutomationToken(request, env);
  return { kind: "automation", role: "automation" };
}

function memberPrincipal(member: Member): MemberPrincipal {
  return {
    kind: "member",
    memberId: member.id,
    accessSub: member.accessSub,
    email: member.email,
    role: member.role,
  };
}
