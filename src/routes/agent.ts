import { requireCapability } from "../authorization/policy";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import { APP_CONFIG } from "../config";
import type { Principal } from "../identity/principal";
import type { AgentMessagePage, AgentMessageRecord, AgentSession, AgentSessionRecord, AgentSessionResult } from "../agent/session-do";

const SESSION_ID = /^[A-Za-z0-9_-]{21,128}$/u;

export async function routeAgentApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  namespace: DurableObjectNamespace<AgentSession>,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/agent/sessions" && !url.pathname.startsWith("/api/agent/sessions/")) return undefined;
  requireCapability(principal, "knowledge:read");
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);

  if (url.pathname === "/api/agent/sessions") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const id = namespace.newUniqueId();
    const sessionId = id.toString();
    const result = await namespace.get(id).create({
      sessionId,
      memberId: principal.memberId,
      now: new Date().toISOString(),
    });
    return jsonAgentResult(result, 201, context.requestId);
  }

  const messagePath = /^\/api\/agent\/sessions\/([^/]+)\/messages$/u.exec(url.pathname);
  if (messagePath) {
    const id = decodePathId(messagePath[1]!);
    const stub = sessionStub(namespace, id);
    if (request.method === "POST") {
      requireNoQuery(url);
      const body = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
      if (!isMessageBody(body)) throw new AppError("AGENT_MESSAGE_INVALID", "Agent message is invalid", 400);
      const result = await stub.appendMessage(principal.memberId, { role: "user", content: body.content });
      return jsonAgentResult(result, 201, context.requestId, "message");
    }
    if (request.method === "GET") {
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? undefined : Number(rawLimit);
      const result = await stub.listMessages(principal.memberId, { limit });
      return jsonAgentResult(result, 200, context.requestId, "messages");
    }
    return methodNotAllowed("GET, POST", context);
  }

  const id = decodePathId(url.pathname.slice("/api/agent/sessions/".length));
  if (!SESSION_ID.test(id)) throw new AppError("AGENT_SESSION_NOT_FOUND", "Agent session was not found", 404);
  if (request.method !== "GET") return methodNotAllowed("GET", context);
  requireNoQuery(url);
  const stub = sessionStub(namespace, id);
  return jsonAgentResult(await stub.read(principal.memberId), 200, context.requestId);
}

function jsonAgentResult<T extends AgentSessionRecord | AgentMessageRecord | AgentMessagePage>(
  result: AgentSessionResult<T>,
  successStatus: number,
  requestId: string,
  key = "session",
): Response {
  if (!result.ok) throw new AppError(result.error.code, result.error.code === "AGENT_SESSION_INVALID" ? "Agent session request is invalid" : "Agent session was not found", result.error.status, result.error.retryable);
  return jsonResponse({ [key]: result.value }, successStatus, requestId);
}

function sessionStub(namespace: DurableObjectNamespace<AgentSession>, id: string): DurableObjectStub<AgentSession> {
  if (!SESSION_ID.test(id)) throw new AppError("AGENT_SESSION_NOT_FOUND", "Agent session was not found", 404);
  try {
    return namespace.get(namespace.idFromString(id));
  } catch {
    throw new AppError("AGENT_SESSION_NOT_FOUND", "Agent session was not found", 404);
  }
}

function isMessageBody(value: unknown): value is { content: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1
    && typeof body.content === "string"
    && body.content.trim().length > 0;
}
