import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { parseNumberedPageRequest } from "../pagination";
import type { GoalTasksService } from "../goal-tasks/service";
import { strictRecord } from "./member";
export async function routeGoalTasksApi(request: Request, url: URL, context: RequestContext, principal: Principal, services: { goalTasks: GoalTasksService }): Promise<Response | undefined> {
  const collection = /^\/api\/goals\/([^/]+)\/tasks$/u.exec(url.pathname);
  const item = /^\/api\/goals\/([^/]+)\/tasks\/([^/]+)$/u.exec(url.pathname);
  if (!collection && !item) return undefined;
  requireCapability(principal, "tasks:use");
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member required", 403);
  const goalId = decodePathId((collection ?? item)![1]!);
  if (collection) {
    if (request.method === "GET") return jsonResponse(await services.goalTasks.list(principal.memberId, goalId, parseNumberedPageRequest(url, [], "GOAL_PAGE_INVALID")), 200, context.requestId);
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["taskId", "expectedUpdatedAt"], "GOAL_INVALID");
    return jsonResponse(await services.goalTasks.change(principal.memberId, goalId, input.taskId, true, input.expectedUpdatedAt), 200, context.requestId);
  }
  if (item) {
    if (request.method !== "DELETE") return methodNotAllowed("DELETE", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["expectedUpdatedAt"], "GOAL_INVALID");
    return jsonResponse(await services.goalTasks.change(principal.memberId, goalId, decodePathId(item![2]!), false, input.expectedUpdatedAt), 200, context.requestId);
  }
  return undefined;
}
