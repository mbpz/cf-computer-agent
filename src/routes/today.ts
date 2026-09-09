import { requireCapability } from "../authorization/policy";
import { AppError, jsonResponse, methodNotAllowed, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { TodayService } from "../today/service";

export async function routeTodayApi(request: Request, url: URL, context: RequestContext, principal: Principal, services: { today: TodayService }): Promise<Response | undefined> {
  if (url.pathname !== "/api/today") return undefined;
  requireCapability(principal, "tasks:use");
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  if (request.method !== "GET") return methodNotAllowed("GET", context);
  requireNoQuery(url);
  return jsonResponse(await services.today.get(principal.memberId), 200, context.requestId);
}
