import { requireCapability } from "../authorization/policy";
import { APP_CONFIG } from "../config";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import { parsePageRequest } from "../pagination";
import type { InboxService } from "../inbox/service";
import type { InboxStatus } from "../inbox/types";
import { strictRecord } from "./member";

export interface InboxRouteServices { inbox: InboxService; }

export async function routeInboxApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: InboxRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/inbox" && !url.pathname.startsWith("/api/inbox/")) return undefined;
  requireCapability(principal, "tasks:use");
  const member = requireMember(principal);

  if (url.pathname === "/api/inbox") {
    if (request.method === "GET") {
      requireExactQuery(url, ["limit", "cursor", "status"]);
      const status = url.searchParams.get("status");
      if (status !== null && status !== "inbox" && status !== "archived" && status !== "promoted") throw invalidPage();
      const page = parsePageRequest(url.searchParams.get("limit") === null ? undefined : Number(url.searchParams.get("limit")), url.searchParams.get("cursor") ?? undefined);
      return jsonResponse(await services.inbox.list(member.memberId, status === null ? {} : { status: status as InboxStatus }, page), 200, context.requestId);
    }
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    requireNoQuery(url);
    const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["id", "clientKey", "kind", "content", "sourceUrl"], "INBOX_INVALID");
    const result = await services.inbox.create(member.memberId, input);
    return jsonResponse(result, result.created ? 201 : 200, context.requestId);
  }

  const promoteTask = /^\/api\/inbox\/([^/]+)\/promote\/task$/u.exec(url.pathname);
  if (promoteTask) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    return jsonResponse(await services.inbox.promoteTask(member.memberId, decodePathId(promoteTask[1]!)), 200, context.requestId);
  }
  const promoteKnowledge = /^\/api\/inbox\/([^/]+)\/promote\/knowledge$/u.exec(url.pathname);
  if (promoteKnowledge) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    return jsonResponse(await services.inbox.promoteKnowledge(member.memberId, decodePathId(promoteKnowledge[1]!)), 200, context.requestId);
  }
  const item = /^\/api\/inbox\/([^/]+)$/u.exec(url.pathname);
  if (item) {
    requireNoQuery(url);
    const id = decodePathId(item[1]!);
    if (request.method === "GET") return jsonResponse(await services.inbox.get(member.memberId, id), 200, context.requestId);
    if (request.method === "PATCH") {
      const input = strictRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes), ["status"], "INBOX_INVALID");
      return jsonResponse(await services.inbox.updateStatus(member.memberId, id, input.status), 200, context.requestId);
    }
    return methodNotAllowed("GET, PATCH", context);
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

function invalidPage(): AppError { return new AppError("INBOX_PAGE_INVALID", "Inbox query parameters are invalid", 400); }
