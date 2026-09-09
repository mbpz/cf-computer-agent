import { requireCapability } from "../authorization/policy";
import { AppError, jsonResponse, methodNotAllowed, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { WorkbenchReviewService } from "../workbench-review/service";

export async function routeWorkbenchReviewApi(request: Request, url: URL, context: RequestContext, principal: Principal, services: { review: WorkbenchReviewService }): Promise<Response | undefined> {
  if (url.pathname !== "/api/workbench/review") return undefined;
  requireCapability(principal, "tasks:use");
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  if (request.method !== "GET") return methodNotAllowed("GET", context);
  const period = url.searchParams.get("period") ?? "daily";
  if (url.searchParams.getAll("period").length > 1 || [...url.searchParams.keys()].some((key) => key !== "period")) throw new AppError("WORKBENCH_REVIEW_QUERY_INVALID", "Review query is invalid", 400);
  return jsonResponse(await services.review.get(principal.memberId, period), 200, context.requestId);
}
