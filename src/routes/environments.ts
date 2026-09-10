import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { EnvironmentsService, parseEnvironmentType } from "../environments/service";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { parseNumberedPageRequest } from "../pagination";

export async function routeEnvironmentsApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: { environments: EnvironmentsService },
): Promise<Response | undefined> {
  if (url.pathname !== "/api/environments" && !url.pathname.startsWith("/api/environments/")) return undefined;
  requireCapability(principal, "vm:use");
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  const memberId = principal.memberId;
  if (url.pathname === "/api/environments") {
    if (request.method === "GET") {
      const seen = new Set<string>();
      for (const key of url.searchParams.keys()) {
        if (!["page", "pageSize", "type"].includes(key) || seen.has(key)) {
          throw new AppError("ENVIRONMENT_QUERY_INVALID", "Environment query is invalid", 400);
        }
        seen.add(key);
      }
      const type = url.searchParams.has("type") ? parseEnvironmentType(url.searchParams.get("type")) : undefined;
      return jsonResponse(await services.environments.list(memberId, {
        ...parseNumberedPageRequest(url, ["type"], "ENVIRONMENT_QUERY_INVALID"), ...(type === undefined ? {} : { type }),
      }), 200, context.requestId);
    }
    requireNoQuery(url);
    if (request.method === "POST") {
      const body = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
      return jsonResponse(await services.environments.create(memberId, body), 201, context.requestId);
    }
    return methodNotAllowed("GET, POST", context);
  }
  if (url.pathname === "/api/environments/tombstones") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    const page = parseNumberedPageRequest(url, [], "ENVIRONMENT_QUERY_INVALID");
    return jsonResponse(await services.environments.tombstones(memberId, page), 200, context.requestId);
  }
  const history = /^\/api\/environments\/([^/]+)\/operations$/u.exec(url.pathname);
  if (history) {
    if (request.method === "POST") {
      requireNoQuery(url);
      const body = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
      return jsonResponse(await services.environments.report(memberId, decodePathId(history[1]!), body), 200, context.requestId);
    }
    if (request.method !== "GET") return methodNotAllowed("GET, POST", context);
    const page = parseNumberedPageRequest(url, [], "ENVIRONMENT_QUERY_INVALID");
    return jsonResponse(await services.environments.operations(memberId, decodePathId(history[1]!), page), 200, context.requestId);
  }
  const match = /^\/api\/environments\/([^/]+)$/u.exec(url.pathname);
  if (!match) throw new AppError("NOT_FOUND", "Not found", 404);
  requireNoQuery(url);
  const id = decodePathId(match[1]!);
  if (request.method === "GET") return jsonResponse({ environment: await services.environments.get(memberId, id) }, 200, context.requestId);
  if (request.method === "PATCH" || request.method === "DELETE") {
    const body = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
    const result = request.method === "PATCH"
      ? await services.environments.update(memberId, id, body)
      : await services.environments.delete(memberId, id, body);
    return jsonResponse(result, 200, context.requestId);
  }
  return methodNotAllowed("GET, PATCH, DELETE", context);
}
