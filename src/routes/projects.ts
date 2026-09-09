import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { parsePageRequest } from "../pagination";
import type { ProjectsService } from "../projects/service";
import type { ProjectStatus } from "../projects/types";
import { strictRecord } from "./member";

export interface ProjectsRouteServices { projects: ProjectsService; }

export async function routeProjectsApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: ProjectsRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/projects" && !url.pathname.startsWith("/api/projects/")) return undefined;
  requireCapability(principal, "tasks:use");
  const member = requireMember(principal);

  if (url.pathname === "/api/projects") {
    if (request.method === "GET") {
      requireExactQuery(url, ["limit", "cursor", "status"]);
      const status = url.searchParams.get("status");
      if (status !== null && !["planned", "active", "paused", "completed", "archived"].includes(status)) throw invalidPage();
      const page = parsePageRequest(url.searchParams.get("limit") === null ? undefined : Number(url.searchParams.get("limit")), url.searchParams.get("cursor") ?? undefined);
      return jsonResponse(await services.projects.list(member.memberId, status === null ? {} : { status: status as ProjectStatus }, page), 200, context.requestId);
    }
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["id", "clientKey", "title", "description", "progress", "targetAt"], "PROJECT_INVALID");
    const result = await services.projects.create(member.memberId, input);
    return jsonResponse(result, result.created ? 201 : 200, context.requestId);
  }

  const summary = /^\/api\/projects\/([^/]+)\/summary$/u.exec(url.pathname);
  if (summary) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(await services.projects.summary(member.memberId, decodePathId(summary[1]!)), 200, context.requestId);
  }

  const status = /^\/api\/projects\/([^/]+)\/status$/u.exec(url.pathname);
  if (status) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["status"], "PROJECT_INVALID");
    return jsonResponse(await services.projects.setStatus(member.memberId, decodePathId(status[1]!), input.status), 200, context.requestId);
  }

  const goal = /^\/api\/projects\/([^/]+)\/goals(?:\/([^/]+))?$/u.exec(url.pathname);
  if (goal) {
    requireNoQuery(url);
    const projectId = decodePathId(goal[1]!);
    if (goal[2]) {
      if (request.method !== "DELETE") return methodNotAllowed("DELETE", context);
      return jsonResponse(await services.projects.unlinkGoal(member.memberId, projectId, decodePathId(goal[2]!)), 200, context.requestId);
    }
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["goalId"], "PROJECT_INVALID");
    return jsonResponse(await services.projects.linkGoal(member.memberId, projectId, input.goalId), 200, context.requestId);
  }

  const task = /^\/api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?$/u.exec(url.pathname);
  if (task) {
    requireNoQuery(url);
    const projectId = decodePathId(task[1]!);
    if (task[2]) {
      if (request.method !== "DELETE") return methodNotAllowed("DELETE", context);
      return jsonResponse(await services.projects.unlinkTask(member.memberId, projectId, decodePathId(task[2]!)), 200, context.requestId);
    }
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["taskId"], "PROJECT_INVALID");
    return jsonResponse(await services.projects.linkTask(member.memberId, projectId, input.taskId), 200, context.requestId);
  }

  const project = /^\/api\/projects\/([^/]+)$/u.exec(url.pathname);
  if (project) {
    requireNoQuery(url);
    const id = decodePathId(project[1]!);
    if (request.method === "GET") return jsonResponse(await services.projects.get(member.memberId, id), 200, context.requestId);
    if (request.method === "PATCH") {
      const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["title", "description", "progress", "targetAt"], "PROJECT_INVALID");
      return jsonResponse(await services.projects.update(member.memberId, id, input), 200, context.requestId);
    }
    if (request.method === "DELETE") return jsonResponse(await services.projects.setStatus(member.memberId, id, "archived"), 200, context.requestId);
    return methodNotAllowed("GET, PATCH, DELETE", context);
  }
  throw new AppError("NOT_FOUND", "Not found", 404);
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}
function requireExactQuery(url: URL, allowedKeys: readonly string[]): void {
  for (const key of url.searchParams.keys()) if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) throw invalidPage();
}
function invalidPage(): AppError { return new AppError("PROJECT_PAGE_INVALID", "Project query parameters are invalid", 400); }
