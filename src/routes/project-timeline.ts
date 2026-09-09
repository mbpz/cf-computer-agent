import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { ProjectTimelineService } from "../project-timeline/service";
import { strictRecord } from "./member";

export interface ProjectTimelineRouteServices { projectTimeline: ProjectTimelineService; }

export async function routeProjectTimelineApi(request: Request, url: URL, context: RequestContext, principal: Principal, services: ProjectTimelineRouteServices): Promise<Response | undefined> {
  if (!url.pathname.startsWith("/api/projects/") || !url.pathname.includes("/timeline")) return undefined;
  requireCapability(principal, "tasks:use");
  const member = requireMember(principal);
  const collection = /^\/api\/projects\/([^/]+)\/timeline$/u.exec(url.pathname);
  if (collection) {
    const projectId = decodePathId(collection[1]!);
    if (request.method === "GET") {
      requireExactQuery(url, ["limit", "cursor"]);
      const limit = parseOptionalNumber(url.searchParams.get("limit"));
      return jsonResponse(await services.projectTimeline.list(member.memberId, projectId, { limit, cursor: url.searchParams.get("cursor") ?? undefined }), 200, context.requestId);
    }
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["id", "clientKey", "kind", "title", "body", "startsAt", "dueAt"], "PROJECT_TIMELINE_INVALID");
    const result = await services.projectTimeline.create(member.memberId, projectId, input);
    return jsonResponse(result, result.created ? 201 : 200, context.requestId);
  }
  const item = /^\/api\/projects\/([^/]+)\/timeline\/([^/]+)(?:\/status)?$/u.exec(url.pathname);
  if (item) {
    const projectId = decodePathId(item[1]!);
    const itemId = decodePathId(item[2]!);
    if (url.pathname.endsWith("/status")) {
      if (request.method !== "POST") return methodNotAllowed("POST", context);
      requireNoQuery(url);
      const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["status"], "PROJECT_TIMELINE_INVALID");
      return jsonResponse(await services.projectTimeline.setStatus(member.memberId, projectId, itemId, input.status), 200, context.requestId);
    }
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(await services.projectTimeline.get(member.memberId, projectId, itemId), 200, context.requestId);
  }
  throw new AppError("NOT_FOUND", "Not found", 404);
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> { if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403); return principal; }
function requireExactQuery(url: URL, allowedKeys: readonly string[]): void { for (const key of url.searchParams.keys()) if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) throw new AppError("PROJECT_TIMELINE_PAGE_INVALID", "Timeline query parameters are invalid", 400); }
function parseOptionalNumber(value: string | null): number | undefined { if (value === null) return undefined; const number = Number(value); if (!Number.isInteger(number)) throw new AppError("PROJECT_TIMELINE_PAGE_INVALID", "Timeline pagination is invalid", 400); return number; }
