import { capabilitiesFor } from "../authorization/policy";
import { AppError, jsonResponse, methodNotAllowed, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";

export function routeSession(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
): Response | undefined {
  if (url.pathname !== "/api/session") return undefined;
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  if (request.method !== "GET") return methodNotAllowed("GET", context);

  return jsonResponse({
    member: { id: principal.memberId, email: principal.email, role: principal.role },
    capabilities: capabilitiesFor(principal),
    logoutUrl: "/auth/logout",
  }, 200, context.requestId);
}
