import { APP_CONFIG } from "../config";
import type { DiscussionsService } from "../discussions/service";
import type { DiscussionContext } from "../discussions/types";
import {
  AppError,
  decodePathId,
  jsonResponse,
  methodNotAllowed,
  parseJsonRequest,
  requireNoQuery,
  type RequestContext,
} from "../http";
import type { Principal } from "../identity/principal";
import { parsePageRequest } from "../pagination";
import { strictRecord } from "./member";

export interface DiscussionsRouteServices { discussions: DiscussionsService; }

export async function routeDiscussionsApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: DiscussionsRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/discussions" && !url.pathname.startsWith("/api/discussions/")) return undefined;
  const member = requireMember(principal);

  if (url.pathname === "/api/discussions") {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    return jsonResponse(
      await services.discussions.listThreads(member.memberId, cursorPage(url)),
      200,
      context.requestId,
    );
  }

  if (url.pathname === "/api/discussions/context") {
    if (request.method === "GET") {
      const query = exactContextQuery(url);
      return jsonResponse(await services.discussions.getContextThread(member.memberId, query), 200, context.requestId);
    }
    if (request.method !== "POST") return methodNotAllowed("GET, POST", context);
    requireNoQuery(url);
    const input = contextRecord(await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes));
    const result = await services.discussions.ensureContextThread(member.memberId, input);
    return jsonResponse(result, result.created ? 201 : 200, context.requestId);
  }

  if (url.pathname === "/api/discussions/messages") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const input = strictRecord(
      await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes),
      ["context", "body", "clientKey", "replyToMessageId", "mentionMemberIds"],
      "DISCUSSION_MESSAGE_INVALID",
    );
    const result = await services.discussions.sendMessage(member.memberId, {
      context: contextRecord(input.context),
      body: input.body,
      clientKey: input.clientKey,
      ...(input.replyToMessageId !== undefined ? { replyToMessageId: input.replyToMessageId } : {}),
      ...(input.mentionMemberIds !== undefined ? { mentionMemberIds: input.mentionMemberIds } : {}),
    });
    return jsonResponse(result, result.created ? 201 : 200, context.requestId);
  }

  const messages = /^\/api\/discussions\/([^/]+)\/messages$/u.exec(url.pathname);
  if (messages) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    return jsonResponse(
      await services.discussions.listMessages(member.memberId, decodePathId(messages[1]!), cursorPage(url)),
      200,
      context.requestId,
    );
  }

  const thread = /^\/api\/discussions\/([^/]+)$/u.exec(url.pathname);
  if (thread) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    return jsonResponse(
      await services.discussions.getThread(member.memberId, decodePathId(thread[1]!)),
      200,
      context.requestId,
    );
  }

  throw new AppError("NOT_FOUND", "Not found", 404);
}

function cursorPage(url: URL): { limit: number; cursor?: string } {
  requireExactQuery(url, ["limit", "cursor"]);
  const limitValue = url.searchParams.get("limit");
  const limit = limitValue === null ? undefined : parseStrictInteger(limitValue);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  return parsePageRequest(limit, cursor);
}

function exactContextQuery(url: URL): DiscussionContext {
  requireExactQuery(url, ["kind", "id"]);
  if (url.searchParams.get("kind") === null || url.searchParams.get("id") === null) throw invalidRequest();
  return contextRecord({ kind: url.searchParams.get("kind"), id: url.searchParams.get("id") });
}

function contextRecord(value: unknown): DiscussionContext {
  const record = strictRecord(value, ["kind", "id"], "DISCUSSION_MESSAGE_INVALID");
  if ((record.kind !== "task" && record.kind !== "knowledge")
    || typeof record.id !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(record.id)) throw invalidRequest();
  return { kind: record.kind, id: record.id };
}

function requireExactQuery(url: URL, allowedKeys: readonly string[]): void {
  for (const key of url.searchParams.keys()) {
    if (!allowedKeys.includes(key) || url.searchParams.getAll(key).length !== 1) throw invalidRequest();
  }
}

function parseStrictInteger(value: string): number {
  if (!/^[1-9]\d*$/u.test(value)) throw invalidRequest();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw invalidRequest();
  return parsed;
}

function requireMember(principal: Principal): Extract<Principal, { kind: "member" }> {
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  return principal;
}

function invalidRequest(): AppError {
  return new AppError("DISCUSSION_MESSAGE_INVALID", "Discussion request is invalid", 400);
}
