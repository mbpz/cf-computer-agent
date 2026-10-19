/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { APP_CONFIG } from "../../src/config";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, MIGRATIONS);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('agent-member', 'github:agent', 'agent@example.test', 'contributor', 'active', ?, ?)",
    ).bind("2026-08-26T00:00:00.000Z", "2026-08-26T00:00:00.000Z"),
    env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('other-member', 'github:other', 'other@example.test', 'contributor', 'active', ?, ?)",
    ).bind("2026-08-26T00:00:00.000Z", "2026-08-26T00:00:00.000Z"),
  ]);
});

describe("AgentSession Durable Object", () => {
  it("creates a random member-bound session and hides it from another member", async () => {
    const id = crypto.randomUUID();
    const stub = env.AGENT_SESSIONS.getByName(`agent-test-${id}`);
    const created = await stub.create({
      sessionId: id,
      memberId: "member-a",
      now: "2026-08-26T00:00:00.000Z",
    });

    expect(created).toEqual({
      ok: true,
      value: {
        id,
        memberId: "member-a",
        createdAt: "2026-08-26T00:00:00.000Z",
        lastSeenAt: "2026-08-26T00:00:00.000Z",
      },
    });
    await expect(stub.read("member-b")).resolves.toEqual({
      ok: false,
      error: { code: "AGENT_SESSION_NOT_FOUND", status: 404, retryable: false },
    });
    await expect(stub.read("member-a")).resolves.toMatchObject({
      ok: true,
      value: { id, memberId: "member-a" },
    });
  });

  it("persists bounded user and assistant messages for the owner only", async () => {
    const id = crypto.randomUUID();
    const stub = env.AGENT_SESSIONS.getByName(`agent-message-test-${id}`);
    await stub.create({ sessionId: id, memberId: "member-a", now: "2026-08-26T00:00:00.000Z" });
    await expect(stub.appendMessage("member-a", { role: "user", content: "hello" })).resolves.toMatchObject({
      ok: true,
      value: { role: "user", content: "hello" },
    });
    await expect(stub.appendMessage("member-a", { role: "assistant", content: "grounded answer" })).resolves.toMatchObject({
      ok: true,
      value: { role: "assistant", content: "grounded answer" },
    });
    await expect(stub.listMessages("member-a", { limit: 1 })).resolves.toMatchObject({
      ok: true,
      value: { items: [expect.objectContaining({ role: "assistant", content: "grounded answer" })], truncated: true },
    });
    await expect(stub.listMessages("member-b", { limit: 10 })).resolves.toEqual({
      ok: false,
      error: { code: "AGENT_SESSION_NOT_FOUND", status: 404, retryable: false },
    });
    await expect(stub.appendMessage("member-a", { role: "tool", content: "not allowed" })).resolves.toEqual({
      ok: false,
      error: { code: "AGENT_SESSION_INVALID", status: 400, retryable: false },
    });
  });

  it("records a terminated turn so reconnects cannot duplicate an assistant write", async () => {
    const id = crypto.randomUUID();
    const stub = env.AGENT_SESSIONS.getByName(`agent-turn-test-${id}`);
    await stub.create({ sessionId: id, memberId: "member-a", now: "2026-08-26T00:00:00.000Z" });
    const started = await stub.startTurn("member-a", "turn question");
    expect(started).toMatchObject({ ok: true, value: { status: "active", question: "turn question" } });
    const turnId = (started as { ok: true; value: { turnId: string } }).value.turnId;
    await expect(stub.terminateTurn("member-a", turnId)).resolves.toMatchObject({ ok: true, value: { status: "terminated" } });
    await expect(stub.getTurn("member-a", turnId)).resolves.toMatchObject({ ok: true, value: { status: "terminated" } });
    await expect(stub.completeTurn("member-a", turnId, "late answer")).resolves.toEqual({
      ok: false,
      error: { code: "AGENT_TURN_TERMINATED", status: 409, retryable: false },
    });
    await expect(stub.listMessages("member-a", { limit: 10 })).resolves.toMatchObject({
      ok: true,
      value: { items: [{ role: "user", content: "turn question" }], truncated: false },
    });
  });
});

describe("agent session HTTP boundary", () => {
  it("routes create and read through the authenticated Worker boundary", async () => {
    const { app, session } = await signIn("agent-member");
    const sessionId = await createSession(app, session.token);
    const read = await fetchAgent(app, `/api/agent/sessions/${sessionId}`, session.token);
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({ session: { id: sessionId, memberId: "agent-member" } });

    const message = await fetchAgent(app, `/api/agent/sessions/${sessionId}/messages`, session.token, "POST", { content: "route message" });
    expect(message.status).toBe(201);
    await expect(message.json()).resolves.toMatchObject({ message: { role: "user", content: "route message" } });

    const listed = await fetchAgent(app, `/api/agent/sessions/${sessionId}/messages?limit=5`, session.token);
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ messages: { items: [expect.objectContaining({ content: "route message" })], truncated: false } });
  });

  it("does not expose another member's session through read, stream or terminate", async () => {
    const owner = await signIn("agent-member");
    const other = await signIn("other-member");
    const sessionId = await createSession(owner.app, owner.session.token);
    const started = await owner.app.fetch!(agentRequest(`/api/agent/sessions/${sessionId}/stream`, owner.session.token, "POST", { question: "Durable search evidence" }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, createExecutionContext());
    const turnId = started.headers.get("x-agent-turn-id")!;
    expect(turnId).toBeTruthy();
    await sseText(started);

    expect((await fetchAgent(owner.app, `/api/agent/sessions/${sessionId}`, other.session.token)).status).toBe(404);
    expect((await fetchAgent(owner.app, `/api/agent/sessions/${sessionId}/messages`, other.session.token)).status).toBe(404);
    expect((await fetchAgent(owner.app, `/api/agent/sessions/${sessionId}/stream`, other.session.token, "POST", { question: "Durable search evidence" })).status).toBe(404);
    expect((await fetchAgent(owner.app, `/api/agent/sessions/${sessionId}/turns/${turnId}/terminate`, other.session.token, "POST")).status).toBe(404);
  });

  it("keeps the tool route on its allowlist", async () => {
    const { app, session } = await signIn("agent-member");
    const sessionId = await createSession(app, session.token);
    await seedKnowledge();
    const tool = await fetchAgent(app, `/api/agent/sessions/${sessionId}/tools/searchKnowledge`, session.token, "POST", { query: "Durable" });
    expect(tool.status).toBe(200);
    await expect(tool.json()).resolves.toMatchObject({
      tool: "searchKnowledge",
      result: { degraded: false, items: [expect.objectContaining({ knowledgeItemId: "agent-knowledge", excerpt: expect.stringContaining("Durable") })] },
    });
    const unknown = await fetchAgent(app, `/api/agent/sessions/${sessionId}/tools/deleteEverything`, session.token, "POST", {});
    expect(unknown.status).toBe(404);
  });

  it("rejects an invalid stream body and scope before starting a turn", async () => {
    const { app, session } = await signIn("agent-member");
    const sessionId = await createSession(app, session.token);
    for (const body of [null, {}, { question: "" }, { question: "ok", extra: true }, { question: "ok", scope: { kind: "all", spaceId: "secret" } }, { question: "ok", scope: { kind: "items", knowledgeItemIds: [] } }]) {
      const response = await fetchAgent(app, `/api/agent/sessions/${sessionId}/stream`, session.token, "POST", body);
      expect(response.status, JSON.stringify(body)).toBe(400);
    }
    await expect(agentMessages(sessionId)).resolves.toEqual({ ok: true, value: { items: [], truncated: false } });
  });
});

describe("agent grounded streaming", () => {
  it("streams the knowledge pipeline stages and persists the validated answer", async () => {
    await seedKnowledge();
    const ai = groundedAi("Durable search evidence");
    const { app, session } = await signIn("agent-member", ai);
    const sessionId = await createSession(app, session.token);

    const response = await fetchAgent(app, `/api/agent/sessions/${sessionId}/stream`, session.token, "POST", { question: "Durable search evidence" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/u);
    const turnId = response.headers.get("x-agent-turn-id");
    expect(turnId).toMatch(/^[A-Za-z0-9-]{16,128}$/u);
    const frames = agentFrames(await response.text());
    const answer = frames.find((frame): frame is AgentAnswerFrame => frame.stage === "answer")!;
    const stages = frames.filter((frame) => frame.stage !== "answer" && frame.stage !== "error").map((frame) => frame.stage);
    expect(stages).toEqual(["retrieving", "evidence", "generating", "validating"]);
    expect(answer.body).toMatchObject({
      answer: expect.stringContaining("Durable search evidence"),
      citations: [expect.any(String)],
      sources: [expect.objectContaining({ knowledgeItemId: "agent-knowledge" })],
      sessionId,
      conversationId: sessionId,
      turnId,
    });
    expect(answer.body.evidenceConfidence).toBeGreaterThan(0.5);

    const stub = sessionStub(sessionId);
    await expect(stub.getTurn("agent-member", turnId!)).resolves.toMatchObject({ ok: true, value: { status: "completed", question: "Durable search evidence" } });
    await expect(stub.listMessages("agent-member", { limit: 10 })).resolves.toMatchObject({
      ok: true,
      value: {
        items: [
          { role: "assistant", content: expect.stringContaining("Durable search evidence") },
          { role: "user", content: "Durable search evidence" },
        ],
        truncated: false,
      },
    });
  });

  it("refuses without evidence and never calls the model", async () => {
    let modelCalls = 0;
    const ai = { async run() { modelCalls += 1; return { response: "{}" }; } };
    const { app, session } = await signIn("agent-member", ai);
    const sessionId = await createSession(app, session.token);

    const response = await fetchAgent(app, `/api/agent/sessions/${sessionId}/stream`, session.token, "POST", { question: "Completely unrelated question" });
    const frames = agentFrames(await response.text());
    expect(frames.map((frame) => frame.stage)).toEqual(["retrieving", "evidence", "answer"]);
    const answer = frames.find((frame): frame is AgentAnswerFrame => frame.stage === "answer")!;
    expect(answer.body).toMatchObject({ citations: [], sources: [], messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT", sessionId, conversationId: sessionId });
    expect(modelCalls).toBe(0);
    const turnId = response.headers.get("x-agent-turn-id")!;
    await expect(sessionStub(sessionId).getTurn("agent-member", turnId)).resolves.toMatchObject({ ok: true, value: { status: "completed" } });
  });

  it("fails closed when the model cites an unavailable source and terminates the turn", async () => {
    await seedKnowledge();
    const ai = { async run() { return { response: JSON.stringify({ claims: [{ text: "Invented claim", citationIds: ["not-an-authorized-source"] }], insufficientEvidence: false }) }; } };
    const { app, session } = await signIn("agent-member", ai);
    const sessionId = await createSession(app, session.token);

    const response = await fetchAgent(app, `/api/agent/sessions/${sessionId}/stream`, session.token, "POST", { question: "Durable search evidence" });
    const frames = agentFrames(await response.text());
    expect(frames.at(-1)).toMatchObject({ stage: "error", error: { code: "ANSWER_UNGROUNDED", status: 422, retryable: false } });
    const turnId = response.headers.get("x-agent-turn-id")!;
    await expect(sessionStub(sessionId).getTurn("agent-member", turnId)).resolves.toMatchObject({ ok: true, value: { status: "terminated" } });
    await expect(agentMessages(sessionId)).resolves.toMatchObject({ ok: true, value: { items: [{ role: "user", content: "Durable search evidence" }] } });
  });

  it("feeds the prior validated turns back as conversation history", async () => {
    await seedKnowledge();
    const inputs: string[] = [];
    const ai = {
      async run(_model: string, input: { messages: Array<{ content: string }> }) {
        inputs.push(input.messages.at(-1)!.content);
        const citationId = sourceCitation(input.messages.at(-1)!.content);
        return { response: JSON.stringify({ claims: [{ text: "Durable search evidence", citationIds: [citationId] }], insufficientEvidence: false }) };
      },
    };
    const { app, session } = await signIn("agent-member", ai);
    const sessionId = await createSession(app, session.token);
    await sseText(await fetchAgent(app, `/api/agent/sessions/${sessionId}/stream`, session.token, "POST", { question: "Durable search evidence" }));
    const second = await sseText(await fetchAgent(app, `/api/agent/sessions/${sessionId}/stream`, session.token, "POST", { question: "Durable" }));
    expect(second).toContain('"stage":"answer"');
    expect(inputs[1]).toContain("Durable search evidence");
    await expect(agentMessages(sessionId)).resolves.toMatchObject({
      ok: true,
      value: { items: expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Durable search evidence" }),
        expect.objectContaining({ role: "user", content: "Durable" }),
        expect.objectContaining({ role: "assistant" }),
        expect.objectContaining({ role: "assistant" }),
      ]) },
    });
  });

  it("terminates the active turn through the owner-only endpoint so the next question can start", async () => {
    const { app, session } = await signIn("agent-member");
    const sessionId = await createSession(app, session.token);
    const stub = sessionStub(sessionId);
    const started = await stub.startTurn("agent-member", "stuck question");
    const turnId = (started as { ok: true; value: { turnId: string } }).value.turnId;

    const terminated = await fetchAgent(app, `/api/agent/sessions/${sessionId}/turns/${turnId}/terminate`, session.token, "POST");
    expect(terminated.status).toBe(200);
    await expect(terminated.json()).resolves.toMatchObject({ turn: { turnId, status: "terminated" } });
    await expect(stub.completeTurn("agent-member", turnId, "late answer")).resolves.toMatchObject({ ok: false, error: { code: "AGENT_TURN_TERMINATED" } });

    const next = await fetchAgent(app, `/api/agent/sessions/${sessionId}/stream`, session.token, "POST", { question: "Completely unrelated question" });
    expect(next.status).toBe(200);
    const nextTurn = next.headers.get("x-agent-turn-id");
    expect(nextTurn).not.toBe(turnId);
    await sseText(next);
    await expect(stub.getTurn("agent-member", nextTurn!)).resolves.toMatchObject({ ok: true, value: { status: "completed" } });
  });

  it("does not persist an incomplete answer after the client disconnects", async () => {
    await seedKnowledge();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ai = {
      async run() {
        await gate;
        return { response: JSON.stringify({ claims: [{ text: "Durable search evidence", citationIds: [sourceCitation("")] }], insufficientEvidence: false }) };
      },
    };
    const { app, session } = await signIn("agent-member", ai);
    const sessionId = await createSession(app, session.token);
    const response = await fetchAgent(app, `/api/agent/sessions/${sessionId}/stream`, session.token, "POST", { question: "Durable search evidence" });
    const turnId = response.headers.get("x-agent-turn-id")!;
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel("disconnect");
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(sessionStub(sessionId).getTurn("agent-member", turnId)).resolves.toMatchObject({ ok: true, value: { status: "terminated" } });
    await expect(agentMessages(sessionId)).resolves.toMatchObject({ ok: true, value: { items: [{ role: "user", content: "Durable search evidence" }] } });
  });
});

// --- helpers ------------------------------------------------------------

interface AgentAnswerFrame {
  stage: "answer";
  body: {
    answer: string;
    citations: string[];
    sources: Array<{ citationId: string; knowledgeItemId: string }>;
    evidenceConfidence: number;
    sessionId: string;
    conversationId: string;
    turnId: string;
    messageKey?: string;
  };
}

type AgentStreamFrame =
  | { stage: "retrieving" | "evidence" | "generating" | "validating" }
  | AgentAnswerFrame
  | { stage: "error"; error: { code: string; message: string; status: number; retryable: boolean } };

function agentFrames(text: string): AgentStreamFrame[] {
  return text.split("\n\n").flatMap((chunk) => {
    const line = chunk.trim();
    if (!line.startsWith("data:")) return [];
    return [JSON.parse(line.slice(5).trim()) as AgentStreamFrame];
  });
}

interface SignedIn {
  app: ReturnType<typeof createApp>;
  session: { token: string };
}

async function signIn(memberId: string, ai?: unknown): Promise<SignedIn> {
  const members = new MembersRepository(env.DB);
  const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
  const member = await members.findById(memberId);
  const session = await sessions.create(member!);
  return { app: createApp(ai === undefined ? {} : { ai: ai as never }), session };
}

function agentRequest(path: string, token: string, method = "GET", body?: unknown): Request {
  return new Request(`https://example.test${path}`, {
    method,
    headers: {
      cookie: `__Host-memory-session=${token}`,
      origin: APP_CONFIG.canonicalOrigin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function fetchAgent(app: SignedIn["app"], path: string, token: string, method = "GET", body?: unknown): Promise<Response> {
  const context = createExecutionContext();
  const response = await app.fetch!(agentRequest(path, token, method, body) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}

async function createSession(app: SignedIn["app"], token: string): Promise<string> {
  const created = await fetchAgent(app, "/api/agent/sessions", token, "POST");
  expect(created.status).toBe(201);
  const body = await created.json() as { session: { id: string; memberId: string } };
  expect(body.session.id).toMatch(/^[A-Za-z0-9_-]{21,128}$/u);
  return body.session.id;
}

function sessionStub(sessionId: string) {
  return env.AGENT_SESSIONS.get(env.AGENT_SESSIONS.idFromString(sessionId));
}

async function agentMessages(sessionId: string) {
  return await sessionStub(sessionId).listMessages("agent-member", { limit: 10 });
}

/** The grounded answer prompt serializes the authorized sources as JSON after
 * this marker; a test model can only cite what the service actually offered. */
function sourceCitation(prompt: string): string {
  const marker = "输入 JSON：\n";
  const index = prompt.lastIndexOf(marker);
  const payload = JSON.parse(prompt.slice(index + marker.length)) as { sources: Array<{ citationId: string }> };
  const citationId = payload.sources[0]?.citationId;
  if (!citationId) throw new Error("test model was called without an authorized source");
  return citationId;
}

function groundedAi(claim: string) {
  return {
    async run(_model: string, input: { messages: Array<{ content: string }> }) {
      const prompt = input.messages.at(-1)!.content;
      return { response: JSON.stringify({ claims: [{ text: claim, citationIds: [sourceCitation(prompt)] }], insufficientEvidence: false }) };
    },
  };
}

async function sseText(response: Response): Promise<string> {
  expect(response.status).toBe(200);
  return await response.text();
}

async function seedKnowledge(): Promise<void> {
  const now = "2026-08-26T00:00:01.000Z";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at) VALUES ('agent-submission', 'agent-member', 'default', NULL, 'markdown', 'published', 'Agent knowledge', '# Agent knowledge\\n\\nDurable search evidence', NULL, ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('agent-source', 'agent-member', 'default', NULL, 'markdown', 'Agent knowledge', ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('agent-version', 'agent-source', 'agent-submission', 1, '# Agent knowledge\\n\\nDurable search evidence', ?, 'm1-v1', ?)").bind("a".repeat(64), now),
    env.DB.prepare("INSERT INTO knowledge_items (id, space_id, collection_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('agent-knowledge', 'default', NULL, NULL, 'active', 'indexed', ?, ?)").bind(now, now),
    env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, summary, tags_json, visibility, published_by, published_at) VALUES ('agent-revision', 'agent-knowledge', 'agent-version', '/workspace/published/default/agent-knowledge/agent-revision.md', ?, 'Agent knowledge', '', '[]', 'shared', 'agent-member', ?)").bind("a".repeat(64), now),
    env.DB.prepare("INSERT INTO chunks (id, revision_id, ordinal, heading_path, start_line, end_line, body, search_title, search_tags, search_body, index_field, location_json) VALUES ('agent-chunk', 'agent-revision', 0, '[\"Agent\"]', 3, 3, 'Durable search evidence', 'Agent knowledge', '', 'Durable search evidence', 'body', '{}')"),
    env.DB.prepare("INSERT INTO jobs (id, kind, resource_id, state, attempts, available_at, created_at, updated_at) VALUES ('agent-job', 'index_revision', 'agent-revision', 'completed', 1, ?, ?, ?)").bind(now, now, now),
    env.DB.prepare("INSERT INTO chunks_fts (rowid, chunk_id, title, summary, tags, body, code) SELECT rowid, id, 'Agent knowledge', '', '', search_body, '' FROM chunks WHERE id = 'agent-chunk'"),
    env.DB.prepare("INSERT INTO chunks_fts_shared (rowid, chunk_id, title, summary, tags, body, code) SELECT rowid, id, 'Agent knowledge', '', '', search_body, '' FROM chunks WHERE id = 'agent-chunk'"),
  ]);
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'agent-revision' WHERE id = 'agent-knowledge'").run();
}
