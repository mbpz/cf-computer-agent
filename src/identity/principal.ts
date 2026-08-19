import { AppError } from "../http";
import type { Member } from "../members/types";
import { requestFromVerifiedBytes, type AutomationAuthenticator } from "./automation";
import type { SessionService } from "./session";

const SESSION_COOKIE_NAME = "__Host-memory-session";
const AUTOMATION_HEADER_NAMES = [
  "authorization",
  "x-automation-id",
  "x-automation-timestamp",
  "x-automation-nonce",
  "x-automation-signature",
] as const;

export interface MemberPrincipal {
  kind: "member";
  memberId: string;
  identitySubject: string;
  email: string;
  role: "admin" | "contributor";
}

export interface AutomationPrincipal {
  kind: "automation";
  role: "automation";
}

export type Principal = MemberPrincipal | AutomationPrincipal;

export interface ResolvedPrincipal {
  principal: Principal;
  request: Request;
}

export interface ResolvePrincipalDependencies {
  sessions: Pick<SessionService, "resolve">;
  automation: Pick<AutomationAuthenticator, "verify">;
  maxBodyBytes: number;
}

export async function resolvePrincipal(
  request: Request,
  dependencies: ResolvePrincipalDependencies,
): Promise<ResolvedPrincipal> {
  const hasSession = hasCookieOccurrence(request, SESSION_COOKIE_NAME);
  const automationHeaders = AUTOMATION_HEADER_NAMES.map((name) => request.headers.has(name));
  const hasAutomation = automationHeaders.some(Boolean);

  if ((hasSession && hasAutomation) || (hasAutomation && !automationHeaders.every(Boolean))) {
    throw authenticationRequired();
  }
  if (hasSession) {
    return { principal: memberPrincipal(await dependencies.sessions.resolve(request)), request };
  }
  if (hasAutomation) {
    const verified = await dependencies.automation.verify(request, dependencies.maxBodyBytes);
    return {
      principal: { kind: "automation", role: "automation" },
      request: requestFromVerifiedBytes(request, verified.bodyBytes),
    };
  }
  throw authenticationRequired();
}

function hasCookieOccurrence(request: Request, name: string): boolean {
  const header = request.headers.get("cookie");
  if (!header) return false;
  return header.split(";").some((segment) => {
    const equals = segment.indexOf("=");
    const rawName = equals === -1 ? segment : segment.slice(0, equals);
    return rawName.trim() === name;
  });
}

function memberPrincipal(member: Member): MemberPrincipal {
  return {
    kind: "member",
    memberId: member.id,
    identitySubject: member.identitySubject,
    email: member.email,
    role: member.role,
  };
}

function authenticationRequired(): AppError {
  return new AppError("AUTH_REQUIRED", "Authentication required", 401);
}
