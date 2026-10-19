import { requireCapability } from "../authorization/policy";
import { AppError, decodePathId, jsonResponse, methodNotAllowed, parseJsonRequest, requireNoQuery, type RequestContext } from "../http";
import { APP_CONFIG } from "../config";
import type { Principal } from "../identity/principal";
import type { AgentMessagePage, AgentMessageRecord, AgentSession, AgentSessionRecord, AgentSessionResult, AgentTurnRecord } from "../agent/session-do";
import type { AgentToolRunner } from "../agent/tool-runner";
import type { WorkScope } from "../maintenance/lifecycle";
import { observeStorage } from "../maintenance/storage";
import { parallelWork, runWork } from "../maintenance/work";
import type { LibraryService } from "../library/service";
import type { ChatScope, LibraryScope } from "../library/types";
import type { CitedAnswerHistoryMessage, CitedAnswerResult, CitedAnswerService, CitedAnswerStage } from "../ai/cited-answer-service";
import { chatScopeRequest } from "./library";

const SESSION_ID = /^[A-Za-z0-9_-]{21,128}$/u;
const HISTORY_LIMIT = 20;
const EVIDENCE_LIMIT = 8;

/** Everything a bounded, read-only agent turn needs. `ai` and `tools` stay
 * request-scoped services even though the turn itself is grounded through
 * `library`/`citedAnswers`, so the tool route keeps its existing seam. */
export interface AgentRouteServices {
  sessions: DurableObjectNamespace<AgentSession>;
  ai: Ai;
  tools: AgentToolRunner;
  library: LibraryService;
  citedAnswers: CitedAnswerService;
  workScope?: WorkScope;
}

type AgentStreamStage = CitedAnswerStage | "retrieving";

/** The terminal frame payload. The knowledge chat payload is reused verbatim and
 * the session identity is added in the two fields the agent client validates:
 * `sessionId` is the agent session; `conversationId` is the same value under the
 * chat payload's name, kept as a compatibility mapping so the shared client
 * receipt rules apply unchanged. `turnId` lets the client terminate this exact
 * turn. */
type AgentAnswerBody = CitedAnswerResult & {
  sessionId: string;
  conversationId: string;
  turnId: string;
};

export async function routeAgentApi(
  request: Request,
  url: URL,
  context: RequestContext,
  principal: Principal,
  services: AgentRouteServices,
): Promise<Response | undefined> {
  if (url.pathname !== "/api/agent/sessions" && !url.pathname.startsWith("/api/agent/sessions/")) return undefined;
  requireCapability(principal, "knowledge:read");
  if (principal.kind !== "member") throw new AppError("FORBIDDEN", "Member access required", 403);
  const memberId = principal.memberId;

  if (url.pathname === "/api/agent/sessions") {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const id = services.sessions.newUniqueId();
    const sessionId = id.toString();
    const result = await observeStorage(services.workScope, async () => await services.sessions.get(id).create({
      sessionId,
      memberId,
      now: new Date().toISOString(),
    }));
    return jsonAgentResult(result, 201, context.requestId);
  }

  const toolPath = /^\/api\/agent\/sessions\/([^/]+)\/tools\/([^/]+)$/u.exec(url.pathname);
  if (toolPath) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const stub = sessionStub(services.sessions, decodePathId(toolPath[1]!));
    throwIfAgentError(await observeStorage(services.workScope, async () => await stub.read(memberId)));
    const input = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
    const name = decodePathId(toolPath[2]!);
    const result = await services.tools.run(memberId, name, input);
    return jsonResponse({ tool: name, result }, 200, context.requestId);
  }

  const messagePath = /^\/api\/agent\/sessions\/([^/]+)\/messages$/u.exec(url.pathname);
  if (messagePath) {
    const id = decodePathId(messagePath[1]!);
    const stub = sessionStub(services.sessions, id);
    if (request.method === "POST") {
      requireNoQuery(url);
      const body = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
      if (!isMessageBody(body)) throw new AppError("AGENT_MESSAGE_INVALID", "Agent message is invalid", 400);
      const result = await observeStorage(services.workScope, async () => await stub.appendMessage(memberId, { role: "user", content: body.content }));
      return jsonAgentResult(result, 201, context.requestId, "message");
    }
    if (request.method === "GET") {
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? undefined : Number(rawLimit);
      const result = await observeStorage(services.workScope, async () => await stub.listMessages(memberId, { limit }));
      return jsonAgentResult(result, 200, context.requestId, "messages");
    }
    return methodNotAllowed("GET, POST", context);
  }

  const streamPath = /^\/api\/agent\/sessions\/([^/]+)\/stream$/u.exec(url.pathname);
  if (streamPath) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const sessionId = decodePathId(streamPath[1]!);
    const stub = sessionStub(services.sessions, sessionId);
    const body = await parseJsonRequest(request, APP_CONFIG.maxJsonRequestBytes);
    const turn = parseStreamBody(body);
    const scope: LibraryScope = { memberId, role: principal.role };
    const started = await startAgentTurn(services, stub, memberId, turn.question);
    // The turn id is known before the stream starts so a client can terminate
    // exactly this turn when it stops waiting.
    return agentStreamResponse(services, scope, stub, memberId, sessionId, turn.chatScope, turn.question, started.turnId, context);
  }

  const terminatePath = /^\/api\/agent\/sessions\/([^/]+)\/turns\/([^/]+)\/terminate$/u.exec(url.pathname);
  if (terminatePath) {
    if (request.method !== "POST") return methodNotAllowed("POST", context);
    requireNoQuery(url);
    const stub = sessionStub(services.sessions, decodePathId(terminatePath[1]!));
    const turnId = decodePathId(terminatePath[2]!);
    const result = await observeStorage(services.workScope, async () => await stub.terminateTurn(memberId, turnId));
    return jsonAgentResult(result, 200, context.requestId, "turn");
  }

  const turnPath = /^\/api\/agent\/sessions\/([^/]+)\/turns\/([^/]+)$/u.exec(url.pathname);
  if (turnPath) {
    if (request.method !== "GET") return methodNotAllowed("GET", context);
    requireNoQuery(url);
    const stub = sessionStub(services.sessions, decodePathId(turnPath[1]!));
    const turnId = decodePathId(turnPath[2]!);
    const result = await observeStorage(services.workScope, async () => await stub.getTurn(memberId, turnId));
    return jsonAgentResult(result, 200, context.requestId, "turn");
  }

  const id = decodePathId(url.pathname.slice("/api/agent/sessions/".length));
  if (!SESSION_ID.test(id)) throw new AppError("AGENT_SESSION_NOT_FOUND", "Agent session was not found", 404);
  if (request.method !== "GET") return methodNotAllowed("GET", context);
  requireNoQuery(url);
  const stub = sessionStub(services.sessions, id);
  return jsonAgentResult(await observeStorage(services.workScope, async () => await stub.read(memberId)), 200, context.requestId);
}

/**
 * One grounded read-only turn. The session stores the question and the final
 * validated answer only; retrieval, grounding and citation authorization reuse
 * the exact knowledge-chat pipeline so both surfaces cannot drift apart.
 */
async function runAgentTurn(
  services: AgentRouteServices,
  scope: LibraryScope,
  stub: DurableObjectStub<AgentSession>,
  memberId: string,
  sessionId: string,
  chatScope: ChatScope,
  question: string,
  turnId: string,
  onStage: (stage: AgentStreamStage) => void,
  isCancelled: () => boolean,
): Promise<AgentAnswerBody> {
  const history = await agentHistory(services, stub, memberId, question);
  onStage("retrieving");
  const hits = await services.library.searchInternal(scope, { query: question, limit: EVIDENCE_LIMIT }, chatScope);
  const answer = await services.citedAnswers.answer(scope, question, hits.items, history, onStage);
  // Recheck after generation: access may have changed during the AI call. The
  // whole answer is withheld when any citation is no longer readable.
  await parallelWork(services.workScope, [...new Set([...hits.items.map((hit) => hit.citationId), ...answer.citations])]
    .map((citationId) => () => services.library.readCitation(scope, citationId)));
  if (isCancelled()) throw new AppError("AGENT_STREAM_CANCELLED", "Agent stream was cancelled", 409);
  throwIfAgentError(await observeStorage(services.workScope, async () => await stub.completeTurn(memberId, turnId, answer.answer)));
  return { ...answer, sessionId, conversationId: sessionId, turnId };
}

/** The stored transcript is context for follow-up understanding only; citation
 * ids were never persisted, so the answer must still be grounded in this turn's
 * freshly authorized hits. `startTurn` already stored the current question, so
 * the trailing identical user message is dropped: this is prior-turn history. */
async function agentHistory(
  services: AgentRouteServices,
  stub: DurableObjectStub<AgentSession>,
  memberId: string,
  question: string,
): Promise<CitedAnswerHistoryMessage[]> {
  const page = await observeStorage(services.workScope, async () => await stub.listMessages(memberId, { limit: HISTORY_LIMIT }));
  throwIfAgentError(page);
  const messages = [...page.value.items].reverse();
  const current = messages.at(-1);
  if (current && current.role === "user" && current.content === question.trim()) messages.pop();
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    citationIds: [],
  }));
}

/**
 * Start the turn for this question. `startTurn` is idempotent for an in-flight
 * retry of the same question. A different question found on the active turn can
 * only come from an interrupted earlier request, so that turn is terminated
 * before the new one, keeping the next question from being blocked forever.
 */
async function startAgentTurn(
  services: AgentRouteServices,
  stub: DurableObjectStub<AgentSession>,
  memberId: string,
  question: string,
): Promise<AgentTurnRecord> {
  const started = await observeStorage(services.workScope, async () => await stub.startTurn(memberId, question));
  throwIfAgentError(started);
  if (started.value.question === question.trim()) return started.value;
  throwIfAgentError(await observeStorage(services.workScope, async () => await stub.terminateTurn(memberId, started.value.turnId)));
  const restarted = await observeStorage(services.workScope, async () => await stub.startTurn(memberId, question));
  throwIfAgentError(restarted);
  return restarted.value;
}

/**
 * Server-sent stage frames matching the knowledge-chat stream exactly: stage
 * progress, one terminal `answer` frame, or one terminal `error` frame. The
 * answer is persisted before the frame is written, so a client that sees the
 * terminal frame has a durable turn; a stream that ends without a terminal frame
 * is an unconfirmed write, and the turn is terminated instead of left active.
 */
function agentStreamResponse(
  services: AgentRouteServices,
  scope: LibraryScope,
  stub: DurableObjectStub<AgentSession>,
  memberId: string,
  sessionId: string,
  chatScope: ChatScope,
  question: string,
  turnId: string,
  context: RequestContext,
): Response {
  const encoder = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  let writable = true;
  const frame = async (payload: unknown): Promise<void> => {
    if (!writable) return;
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    } catch {
      writable = false;
    }
  };
  const produce = async () => {
    try {
      const body = await runAgentTurn(
        services,
        scope,
        stub,
        memberId,
        sessionId,
        chatScope,
        question,
        turnId,
        (stage) => { void frame({ stage }); },
        () => !writable,
      );
      await frame({ stage: "answer", body });
    } catch (error) {
      // A failed or abandoned turn must not stay `active`; termination is
      // best-effort because the failure may be the completion itself.
      await observeStorage(services.workScope, async () => await stub.terminateTurn(memberId, turnId)).catch(() => undefined);
      const failure = error instanceof AppError
        ? { code: error.code, message: error.message, status: error.status, retryable: error.retryable }
        : { code: "AGENT_FAILED", message: "Agent generation failed", status: 500, retryable: false };
      await frame({ stage: "error", error: failure });
    } finally {
      writable = false;
      await writer.close().catch(() => undefined);
    }
  };
  // Register the whole factory before it starts so disconnects and completion
  // each keep the request-scoped work alive independently.
  void runWork(services.workScope, produce).catch(() => undefined);
  return new Response(stream.readable, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/event-stream; charset=utf-8",
      "x-content-type-options": "nosniff",
      "x-request-id": context.requestId,
      "x-agent-turn-id": turnId,
    },
  });
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

function parseStreamBody(value: unknown): { question: string; chatScope: ChatScope } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidStreamRequest();
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "question" && key !== "scope")) throw invalidStreamRequest();
  if (typeof body.question !== "string"
    || body.question.trim().length === 0
    || body.question.length > 4_000
    || /[\p{Cc}\p{Cf}]/u.test(body.question)) throw invalidStreamRequest();
  if (body.scope === undefined) return { question: body.question.trim(), chatScope: { kind: "all" } };
  try {
    return { question: body.question.trim(), chatScope: chatScopeRequest(body.scope) };
  } catch {
    throw invalidStreamRequest();
  }
}

function invalidStreamRequest(): AppError {
  return new AppError("AGENT_STREAM_REQUEST_INVALID", "Agent stream request is invalid", 400);
}
