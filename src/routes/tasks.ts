import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { TasksService } from "../tasks/service";
import type { TaskDueFilter, TaskListFilters, TaskPriority, TaskStatus } from "../tasks/types";
import { pageRequest, strictRecord } from "./member";

export interface TasksRouteServices { tasks: TasksService; }

export async function routeTasksApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: TasksRouteServices,
): Promise<Response | undefined> {
  if (!url.pathname.startsWith("/api/tasks")) return undefined;
  requireCapability(principal, "tasks:use");
  const member = requireMember(principal);

  if (url.pathname === "/api/tasks") {
    if (request.method === "GET") {
      requireExactQuery(url, ["limit", "cursor", "status", "priority", "tag", "due", "q"]);
      return jsonResponse(await services.tasks.list(member.memberId, { ...pageRequest(url), filters: taskFilters(url) }), 200, context.requestId);
    }
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["id", "title", "notes", "priority", "dueAt", "knowledgeItemId"], "TASK_INVALID");
    const result = await services.tasks.create(member.memberId, input);
    return jsonResponse(result, result.created ? 201 : 200, context.requestId);
  }

  if (url.pathname === "/api/tasks/summary") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(await services.tasks.summary(member.memberId), 200, context.requestId);
  }

  const status = /^\/api\/tasks\/([^/]+)\/status$/u.exec(url.pathname);
  if (status) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["status"], "TASK_INVALID");
    return jsonResponse(await services.tasks.setStatus(member.memberId, decodePathId(status[1]!), input.status), 200, context.requestId);
  }

  const progress = /^\/api\/tasks\/([^/]+)\/progress$/u.exec(url.pathname);
  if (progress) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["progress"], "TASK_INVALID");
    return jsonResponse(await services.tasks.setProgress(member.memberId, decodePathId(progress[1]!), input.progress), 200, context.requestId);
  }

  const tags = /^\/api\/tasks\/([^/]+)\/tags$/u.exec(url.pathname);
  if (tags) {
    if (request.method !== "PUT") return methodNotAllowed("PUT", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["tags"], "TASK_INVALID");
    return jsonResponse({ tags: await services.tasks.replaceTags(member.memberId, decodePathId(tags[1]!), input.tags) }, 200, context.requestId);
  }

  const links = /^\/api\/tasks\/([^/]+)\/links$/u.exec(url.pathname);
  if (links) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["knowledgeItemId"], "TASK_INVALID");
    return jsonResponse({ link: await services.tasks.addLink(member.memberId, decodePathId(links[1]!), input.knowledgeItemId) }, 201, context.requestId);
  }

  const link = /^\/api\/tasks\/([^/]+)\/links\/([^/]+)$/u.exec(url.pathname);
  if (link) {
    if (request.method !== "DELETE") return methodNotAllowed("DELETE", context);
    requireNoQuery(url);
    await services.tasks.removeLink(member.memberId, decodePathId(link[1]!), decodePathId(link[2]!));
    return noContent(context.requestId);
  }

  const task = /^\/api\/tasks\/([^/]+)$/u.exec(url.pathname);
  if (task) {
    requireNoQuery(url);
    const id = decodePathId(task[1]!);
    if (request.method === "GET") return jsonResponse(await services.tasks.get(member.memberId, id), 200, context.requestId);
    if (request.method === "PATCH") {
      const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["title", "notes", "priority", "dueAt"], "TASK_INVALID");
      return jsonResponse(await services.tasks.update(member.memberId, id, input), 200, context.requestId);
    }
    if (request.method === "DELETE") {
      await services.tasks.delete(member.memberId, id);
      return noContent(context.requestId);
    }
    return methodNotAllowed("DELETE, GET, PATCH", context);
  }

  throw new AppError("NOT_FOUND", "Not found", 404);
}

function taskFilters(url: URL): TaskListFilters {
  const filters: TaskListFilters = {};
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const tag = url.searchParams.get("tag");
  const due = url.searchParams.get("due");
  const q = url.searchParams.get("q");
  if (status !== null) filters.status = status as TaskStatus;
  if (priority !== null) filters.priority = priority as TaskPriority;
  if (tag !== null) filters.tag = tag;
  if (due !== null) filters.due = due as TaskDueFilter;
  if (q !== null) filters.q = q;
  return filters;
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}

function requireExactQuery(url: URL, allowedKeys: readonly string[]): void {
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) {
      throw new AppError("TASK_PAGE_INVALID", "Task query parameters are invalid", 400);
    }
  }
}

function noContent(requestId: string): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "x-request-id": requestId } });
}
