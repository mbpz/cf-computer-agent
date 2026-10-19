import { APP_CONFIG } from "../config";
import { AppError, jsonResponse, methodNotAllowed, requireNoQuery, requireSameOrigin, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { InvitationsService } from "../invitations/service";

export interface InvitationRouteServices {
  invitations: Pick<InvitationsService, "ensureMemberInvitation" | "findMemberInvitation">;
}

/**
 * `POST /api/invitations/mine` — the authenticated member's lifetime sharing
 * code. Idempotent: the first call creates it (201), later calls return the
 * same row (200), including after it was consumed.  Same-origin is enforced
 * here as well as at the app boundary because this POST creates state.
 */
export async function routeInvitationsApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: InvitationRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/invitations/mine") return undefined;
  const member = requireMember(principal);
  if (request.method === "GET") {
    requireNoQuery(url);
    return jsonResponse({ invitation: await services.invitations.findMemberInvitation(member.memberId) }, 200, context.requestId);
  }
  if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
  requireSameOrigin(request, APP_CONFIG.canonicalOrigin);
  requireNoQuery(url);
  const result = await services.invitations.ensureMemberInvitation(member.memberId);
  return jsonResponse({ invitation: result.invitation }, result.created ? 201 : 200, context.requestId);
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}
