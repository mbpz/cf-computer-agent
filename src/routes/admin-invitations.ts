import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, jsonResponse, methodNotAllowed, requireNoQuery, requireSameOrigin, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { parseNumberedPageRequest } from "../pagination";
import type { InvitationsService } from "../invitations/service";
import { INVITATION_GENERATE_MAX, INVITATION_GENERATE_MIN, type InvitationKind, type InvitationStatus } from "../invitations/types";
import { parseJsonRequestAs, strictRecord } from "./member";

export interface AdminInvitationRouteServices {
  invitations: Pick<InvitationsService, "generateAdminInvitations" | "listPage">;
}

/**
 * Administrator invitation surface. Both endpoints require the
 * `member:manage` capability and an actual administrator role, so an
 * effective-permission contributor cannot reach the administration view.
 */
export async function routeAdminInvitationsApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: AdminInvitationRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/admin/invitations") return undefined;
  requireCapability(principal, "member:manage");
  const admin = requireAdminMember(principal);

  if (request.method === "GET") {
    const page = parseNumberedPageRequest(url, ["status", "kind"]);
    const status = requireEnumFilter<InvitationStatus>(url, "status", ["unused", "used"]);
    const kind = requireEnumFilter<InvitationKind>(url, "kind", ["admin", "member"]);
    return jsonResponse(await services.invitations.listPage(page, { status, kind }), 200, context.requestId);
  }

  if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
  requireSameOrigin(request, APP_CONFIG.canonicalOrigin);
  requireNoQuery(url);
  const count = await readGenerationCount(request);
  const invitations = await services.invitations.generateAdminInvitations(admin.memberId, count);
  return jsonResponse({ invitations }, 201, context.requestId);
}

/** `{ "count"?: 1..20 }`; an absent body means one code. */
async function readGenerationCount(request: Request): Promise<number> {
  if (request.body === null) return 1;
  const input = strictRecord(
    await parseJsonRequestAs(request, "INVITATION_REQUEST_INVALID"),
    ["count"],
    "INVITATION_REQUEST_INVALID",
  );
  if (input.count === undefined) return 1;
  if (typeof input.count !== "number"
    || !Number.isSafeInteger(input.count)
    || input.count < INVITATION_GENERATE_MIN
    || input.count > INVITATION_GENERATE_MAX) {
    throw new AppError("INVITATION_REQUEST_INVALID", "Invitation count must be an integer from 1 to 20", 400);
  }
  return input.count;
}

function requireEnumFilter<T extends string>(url: URL, name: string, allowed: readonly T[]): T | undefined {
  const value = url.searchParams.get(name);
  if (value === null) return undefined;
  if (!allowed.includes(value as T)) throw new AppError("FILTER_INVALID", "Filter is invalid", 400);
  return value as T;
}

function requireAdminMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member" || principal.role !== "admin") {
    throw new AppError("FORBIDDEN", "Administrator access required", 403);
  }
  return principal;
}
