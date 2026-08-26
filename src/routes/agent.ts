import { requireCapability } from "../authorization/policy";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import { APP_CONFIG } from "../config";
import type { Principal } from "../identity/principal";
import type { AgentMessagePage, AgentMessageRecord, AgentSession, AgentSessionRecord, AgentSessionResult, AgentTurnRecord } from "../agent/session-do";
import type { AgentToolRunner } from "../agent/tool-runner";

const SESSION_ID = /^[A-Za-z0-9_-]{21,128}$/u;

export async function routeAgentApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  namespace: DurableObjectNamespace<AgentSession>,
  ai: Ai,
  tools: AgentToolRunner,
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

  const toolPath = /^\/api\/agent\/sessions\/([^/]+)\/tools\/([^/]+)$/u.exec(url.pathname);
  if (toolPath) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const stub = sessionStub(namespace, decodePathId(toolPath[1]!));
    throwIfAgentError(await stub.read(principal.memberId));
    const input = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
    const name = decodePathId(toolPath[2]!);
    const result = await tools.run(principal.memberId, name, input);
    return jsonResponse({ tool: name, result }, 200, context.requestId);
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

  const streamPath = /^\/api\/agent\/sessions\/([^/]+)\/stream$/u.exec(url.pathname);
  if (streamPath) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const id = decodePathId(streamPath[1]!);
    const stub = sessionStub(namespace, id);
    const body = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
    if (!isQuestionBody(body)) throw new AppError("AGENT_STREAM_REQUEST_INVALID", "Agent stream request is invalid", 400);
    const started = await stub.startTurn(principal.memberId, body.question);
    throwIfAgentError(started);
    let upstream: ReadableStream;
    try {
      const candidate = await ai.run(APP_CONFIG.model, {
        messages: [{ role: "user", content: body.question }],
        stream: true,
        max_tokens: Math.min(APP_CONFIG.maxAnswerTokens, 700),
        temperature: 0,
      }) as unknown;
      if (!(candidate instanceof ReadableStream)) throw new Error("stream unavailable");
      upstream = candidate;
    } catch {
      throw new AppError("AGENT_STREAM_UNAVAILABLE", "Agent stream is temporarily unavailable", 503, true);
    }
    return new Response(withPersistedAssistant(upstream, stub, principal.memberId, started.value.turnId), {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/event-stream; charset=utf-8",
        "x-content-type-options": "nosniff",
        "x-request-id": context.requestId,
        "x-agent-turn-id": started.value.turnId,
      },
    });
  }

  const turnPath = /^\/api\/agent\/sessions\/([^/]+)\/turns\/([^/]+)$/u.exec(url.pathname);
  if (turnPath) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    const stub = sessionStub(namespace, decodePathId(turnPath[1]!));
    const result = await stub.getTurn(principal.memberId, decodePathId(turnPath[2]!));
    return jsonAgentResult(result, 200, context.requestId, "turn");
  }

  const id = decodePathId(url.pathname.slice("/api/agent/sessions/".length));
  if (!SESSION_ID.test(id)) throw new AppError("AGENT_SESSION_NOT_FOUND", "Agent session was not found", 404);
  if (request.method !== "GET") return methodNotAllowed("GET", context);
  requireNoQuery(url);
  const stub = sessionStub(namespace, id);
  return jsonAgentResult(await stub.read(principal.memberId), 200, context.requestId);
}

function jsonAgentResult<T extends AgentSessionRecord | AgentMessageRecord | AgentMessagePage | AgentTurnRecord>(
  result: AgentSessionResult<T>,
  successStatus: number,
  requestId: string,
  key = "session",
): Response {
  if (!result.ok) throw new AppError(result.error.code, result.error.code === "AGENT_SESSION_INVALID" ? "Agent session request is invalid" : "Agent session was not found", result.error.status, result.error.retryable);
  return jsonResponse({ [key]: result.value }, successStatus, requestId);
}

function throwIfAgentError<T>(result: AgentSessionResult<T>): asserts result is { ok: true; value: T } {
  if (!result.ok) throw new AppError(result.error.code, result.error.code === "AGENT_SESSION_INVALID" ? "Agent session request is invalid" : "Agent session was not found", result.error.status, result.error.retryable);
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

function isQuestionBody(value: unknown): value is { question: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return Object.keys(body).length === 1
    && typeof body.question === "string"
    && body.question.trim().length > 0
    && body.question.length <= 4_000
    && !/[\p{Cc}\p{Cf}]/u.test(body.question);
}

function withPersistedAssistant(
  upstream: ReadableStream,
  stub: DurableObjectStub<AgentSession>,
  memberId: string,
  turnId: string,
): ReadableStream<Uint8Array> {
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let disconnected = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      activeReader = reader;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          if (next.value) {
            chunks.push(next.value);
            controller.enqueue(next.value);
          }
        }
        if (disconnected) {
          await stub.terminateTurn(memberId, turnId);
          controller.close();
          return;
        }
        const answer = extractStreamAnswer(chunks);
        if (answer) throwIfAgentError(await stub.completeTurn(memberId, turnId, answer));
        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        activeReader = undefined;
      }
    },
    cancel(reason) {
      disconnected = true;
      void activeReader?.cancel(reason);
    },
  });
}

function extractStreamAnswer(chunks: readonly Uint8Array[]): string {
  const text = new TextDecoder().decode(concat(chunks));
  const lines = text.split(/\r?\n/u).filter((line) => line.startsWith("data:"));
  if (lines.length === 0) return text.trim();
  const pieces: string[] = [];
  for (const line of lines) {
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const value = JSON.parse(payload) as Record<string, unknown>;
      if (typeof value.response === "string") pieces.push(value.response);
      const choices = value.choices;
      if (Array.isArray(choices)) {
        const content = (choices[0] as Record<string, unknown> | undefined)?.delta;
        if (content && typeof content === "object" && typeof (content as Record<string, unknown>).content === "string") pieces.push((content as Record<string, string>).content);
      }
    } catch {
      continue;
    }
  }
  return pieces.join("").trim();
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
