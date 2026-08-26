import { requireCapability } from "../authorization/policy";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, requireNoQuery, type RequestContext } from "../http";
import type { Principal } from "../identity/principal";
import type { AgentSession, AgentSessionRecord, AgentSessionResult } from "../agent/session-do";

const SESSION_ID = /^[A-Za-z0-9_-]{21,128}$/u;

export function routeAgentApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  namespace: DurableObjectNamespace<AgentSession>,
): Response | undefined | Promise<Response> {
  if (url.pathname !== "/api/agent/sessions" && !url.pathname.startsWith("/api/agent/sessions/")) return undefined;
  requireCapability(principal, "knowledge:read");
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);

  if (url.pathname === "/api/agent/sessions") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const id = namespace.newUniqueId();
    const sessionId = id.toString();
    return namespace.get(id).create({
      sessionId,
      memberId: principal.memberId,
      now: new Date().toISOString(),
    }).then((result) => jsonAgentResult(result, 201, context.requestId));
  }

  const id = decodePathId(url.pathname.slice("/api/agent/sessions/".length));
  if (!SESSION_ID.test(id)) throw new AppError("AGENT_SESSION_NOT_FOUND", "Agent session was not found", 404);
  if (request.method !== "GET") return methodNotAllowed("GET", context);
  requireNoQuery(url);
  let stub: DurableObjectStub<AgentSession>;
  try {
    stub = namespace.get(namespace.idFromString(id));
  } catch {
    throw new AppError("AGENT_SESSION_NOT_FOUND", "Agent session was not found", 404);
  }
  return stub.read(principal.memberId).then((result) => jsonAgentResult(result, 200, context.requestId));
}

function jsonAgentResult(
  result: AgentSessionResult<AgentSessionRecord>,
  successStatus: number,
  requestId: string,
): Response {
  if (!result.ok) throw new AppError(result.error.code, result.error.code === "AGENT_SESSION_INVALID" ? "Agent session request is invalid" : "Agent session was not found", result.error.status, result.error.retryable);
  return jsonResponse({ session: result.value }, successStatus, requestId);
}
