import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { parsePageRequest } from "../pagination";
import type { GoalsService } from "../goals/service";
import type { GoalStatus } from "../goals/types";
import { strictRecord } from "./member";

export interface GoalsRouteServices { goals: GoalsService; }

export async function routeGoalsApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: GoalsRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/goals" && !url.pathname.startsWith("/api/goals/")) return undefined;
  requireCapability(principal, "tasks:use");
  const member = requireMember(principal);

  if (url.pathname === "/api/goals") {
    if (request.method === "GET") {
      requireExactQuery(url, ["limit", "cursor", "status"]);
      const status = url.searchParams.get("status");
      if (status !== null && !["active", "paused", "completed", "archived"].includes(status)) throw invalidPage();
      const page = parsePageRequest(url.searchParams.get("limit") === null ? undefined : Number(url.searchParams.get("limit")), url.searchParams.get("cursor") ?? undefined);
      return jsonResponse(await services.goals.list(member.memberId, status === null ? {} : { status: status as GoalStatus }, page), 200, context.requestId);
    }
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["id", "clientKey", "title", "description", "targetAt"], "GOAL_INVALID");
    const result = await services.goals.create(member.memberId, input);
    return jsonResponse(result, result.created ? 201 : 200, context.requestId);
  }

  const status = /^\/api\/goals\/([^/]+)\/status$/u.exec(url.pathname);
  if (status) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["status"], "GOAL_INVALID");
    return jsonResponse(await services.goals.setStatus(member.memberId, decodePathId(status[1]!), input.status), 200, context.requestId);
  }

  const progress = /^\/api\/goals\/([^/]+)\/progress$/u.exec(url.pathname);
  if (progress) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["progress"], "GOAL_INVALID");
    return jsonResponse(await services.goals.setProgress(member.memberId, decodePathId(progress[1]!), input.progress), 200, context.requestId);
  }

  const goal = /^\/api\/goals\/([^/]+)$/u.exec(url.pathname);
  if (goal) {
    requireNoQuery(url);
    const id = decodePathId(goal[1]!);
    if (request.method === "GET") return jsonResponse(await services.goals.get(member.memberId, id), 200, context.requestId);
    if (request.method === "PATCH") {
      const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["title", "description", "targetAt"], "GOAL_INVALID");
      return jsonResponse(await services.goals.update(member.memberId, id, input), 200, context.requestId);
    }
    if (request.method === "DELETE") return jsonResponse(await services.goals.setStatus(member.memberId, id, "archived"), 200, context.requestId);
    return methodNotAllowed("GET, PATCH, DELETE", context);
  }
  throw new AppError("NOT_FOUND", "Not found", 404);
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}

function requireExactQuery(url: URL, allowedKeys: readonly string[]): void {
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) throw invalidPage();
  }
}

function invalidPage(): AppError { return new AppError("GOAL_PAGE_INVALID", "Goal query parameters are invalid", 400); }
