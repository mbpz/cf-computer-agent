import type { AdminSummaryRepository } from "../admin-summary/repository";
import { requireCapability } from "../authorization/policy";
import { jsonResponse, methodNotAllowed, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";

export interface AdminSummaryRouteServices {
  adminSummary: AdminSummaryRepository;
}

/**
 * `GET /api/admin/summary` — the administration dashboard's trend and activity
 * snapshot. `submission:read-all` is the capability that already gates the
 * `/admin` entry, so this read neither widens nor narrows who can open it.
 */
export async function routeAdminSummaryApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: AdminSummaryRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/admin/summary") return undefined;
  requireCapability(principal, "submission:read-all");
  if (request.method !== "GET") return methodNotAllowed("GET", context);
  requireNoQuery(url);
  return jsonResponse(await services.adminSummary.snapshot(), 200, context.requestId);
}
