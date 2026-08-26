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
  await env.DB.prepare(
    "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('agent-member', 'github:agent', 'agent@example.test', 'contributor', 'active', ?, ?)",
  ).bind("2026-08-26T00:00:00.000Z", "2026-08-26T00:00:00.000Z").run();
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

  it("routes create and read through the authenticated Worker boundary", async () => {
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    const member = await members.findById("agent-member");
    const session = await sessions.create(member!);
    const app = createApp();
    const postContext = createExecutionContext();
    const created = await app.fetch!(new Request("https://example.test/api/agent/sessions", {
      method: "POST",
      headers: {
        cookie: `__Host-memory-session=${session.token}`,
        origin: APP_CONFIG.canonicalOrigin,
      },
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, postContext);
    await waitOnExecutionContext(postContext);
    expect(created.status).toBe(201);
    const body = await created.json() as { session: { id: string; memberId: string } };
    expect(body.session).toMatchObject({ memberId: "agent-member" });

    const getContext = createExecutionContext();
    const read = await app.fetch!(new Request(`https://example.test/api/agent/sessions/${body.session.id}`, {
      headers: { cookie: `__Host-memory-session=${session.token}` },
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, getContext);
    await waitOnExecutionContext(getContext);
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toMatchObject({ session: { id: body.session.id, memberId: "agent-member" } });

    const messageContext = createExecutionContext();
    const message = await app.fetch!(new Request(`https://example.test/api/agent/sessions/${body.session.id}/messages`, {
      method: "POST",
      headers: {
        cookie: `__Host-memory-session=${session.token}`,
        origin: APP_CONFIG.canonicalOrigin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ content: "route message" }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, messageContext);
    await waitOnExecutionContext(messageContext);
    expect(message.status).toBe(201);
    await expect(message.json()).resolves.toMatchObject({ message: { role: "user", content: "route message" } });

    const listContext = createExecutionContext();
    const listed = await app.fetch!(new Request(`https://example.test/api/agent/sessions/${body.session.id}/messages?limit=5`, {
      headers: { cookie: `__Host-memory-session=${session.token}` },
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, listContext);
    await waitOnExecutionContext(listContext);
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({ messages: { items: [expect.objectContaining({ content: "route message" })], truncated: false } });

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
    await env.DB.batch([
      env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, requested_collection_id, kind, status, title, content, idempotency_key, created_at, updated_at) VALUES ('agent-submission-2', 'agent-member', 'default', NULL, 'markdown', 'review_pending', 'Duplicate agent knowledge', 'same evidence', NULL, ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, collection_id, kind, title, created_at, updated_at) VALUES ('agent-source-2', 'agent-member', 'default', NULL, 'markdown', 'Duplicate agent knowledge', ?, ?)").bind(now, now),
      env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('agent-version-2', 'agent-source-2', 'agent-submission-2', 1, 'same evidence', ?, 'm1-v1', ?)").bind("a".repeat(64), now),
    ]);

    const toolContext = createExecutionContext();
    const toolResponse = await app.fetch!(new Request(`https://example.test/api/agent/sessions/${body.session.id}/tools/searchKnowledge`, {
      method: "POST",
      headers: {
        cookie: `__Host-memory-session=${session.token}`,
        origin: APP_CONFIG.canonicalOrigin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "Durable" }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, toolContext);
    await waitOnExecutionContext(toolContext);
    expect(toolResponse.status).toBe(200);
    await expect(toolResponse.json()).resolves.toMatchObject({
      tool: "searchKnowledge",
      result: { degraded: false, items: [expect.objectContaining({ knowledgeItemId: "agent-knowledge", citationId: expect.any(String), excerpt: expect.stringContaining("Durable") })] },
    });

    const conflictContext = createExecutionContext();
    const conflictResponse = await app.fetch!(new Request(`https://example.test/api/agent/sessions/${body.session.id}/tools/listSourceConflicts`, {
      method: "POST",
      headers: {
        cookie: `__Host-memory-session=${session.token}`,
        origin: APP_CONFIG.canonicalOrigin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sourceVersionId: "agent-version" }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, conflictContext);
    await waitOnExecutionContext(conflictContext);
    expect(conflictResponse.status).toBe(200);
    await expect(conflictResponse.json()).resolves.toMatchObject({
      tool: "listSourceConflicts",
      result: { items: [expect.objectContaining({ sourceVersionId: "agent-version-2", spaceId: "default", contentSha256: "a".repeat(64) })] },
    });

    await env.DB.prepare("UPDATE members SET status = 'disabled' WHERE id = 'agent-member'").run();
    const disabledToolContext = createExecutionContext();
    const disabledToolResponse = await app.fetch!(new Request(`https://example.test/api/agent/sessions/${body.session.id}/tools/searchKnowledge`, {
      method: "POST",
      headers: {
        cookie: `__Host-memory-session=${session.token}`,
        origin: APP_CONFIG.canonicalOrigin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: "must stop" }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, disabledToolContext);
    await waitOnExecutionContext(disabledToolContext);
    expect(disabledToolResponse.status).toBe(403);
    await expect(disabledToolResponse.json()).resolves.toMatchObject({ error: { code: "MEMBER_DISABLED" } });
  });

  it("streams an assistant answer and persists it only after the upstream stream completes", async () => {
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    const member = await members.findById("agent-member");
    const session = await sessions.create(member!);
    const encoder = new TextEncoder();
    const streamingAi = {
      async run(_model: string, input: { stream?: boolean }): Promise<ReadableStream | Record<string, unknown>> {
        if (!input.stream) return { response: "unused" };
        return new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {"response":"streamed answer"}\n\n'));
            controller.close();
          },
        });
      },
    };
    const app = createApp({ ai: streamingAi as unknown as Ai });
    const createContext = createExecutionContext();
    const created = await app.fetch!(new Request("https://example.test/api/agent/sessions", {
      method: "POST",
      headers: { cookie: `__Host-memory-session=${session.token}`, origin: APP_CONFIG.canonicalOrigin },
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, createContext);
    await waitOnExecutionContext(createContext);
    const body = await created.json() as { session: { id: string } };

    const streamContext = createExecutionContext();
    const response = await app.fetch!(new Request(`https://example.test/api/agent/sessions/${body.session.id}/stream`, {
      method: "POST",
      headers: {
        cookie: `__Host-memory-session=${session.token}`,
        origin: APP_CONFIG.canonicalOrigin,
        "content-type": "application/json",
      },
      body: JSON.stringify({ question: "stream question" }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, streamContext);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/event-stream/u);
    await expect(response.text()).resolves.toContain("streamed answer");
    await waitOnExecutionContext(streamContext);

    const listed = await env.AGENT_SESSIONS.get(env.AGENT_SESSIONS.idFromString(body.session.id)).listMessages("agent-member", { limit: 10 });
    expect(listed).toMatchObject({ ok: true, value: { items: [
      { role: "assistant", content: "streamed answer" },
      { role: "user", content: "stream question" },
    ], truncated: false } });
  });

  it("does not persist an incomplete assistant message after the client disconnects", async () => {
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    const member = await members.findById("agent-member");
    const session = await sessions.create(member!);
    let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    const streamingAi = {
      async run(): Promise<ReadableStream> {
        return new ReadableStream({ start(controller) {
          controllerRef = controller;
          controller.enqueue(encoder.encode('data: {"response":"partial"}\n\n'));
        } });
      },
    };
    const app = createApp({ ai: streamingAi as unknown as Ai });
    const createContext = createExecutionContext();
    const created = await app.fetch!(new Request("https://example.test/api/agent/sessions", {
      method: "POST",
      headers: { cookie: `__Host-memory-session=${session.token}`, origin: APP_CONFIG.canonicalOrigin },
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, createContext);
    await waitOnExecutionContext(createContext);
    const body = await created.json() as { session: { id: string } };
    const streamContext = createExecutionContext();
    const response = await app.fetch!(new Request(`https://example.test/api/agent/sessions/${body.session.id}/stream`, {
      method: "POST",
      headers: { cookie: `__Host-memory-session=${session.token}`, origin: APP_CONFIG.canonicalOrigin, "content-type": "application/json" },
      body: JSON.stringify({ question: "disconnect question" }),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, streamContext);
    const turnId = response.headers.get("x-agent-turn-id");
    expect(turnId).toMatch(/^[A-Za-z0-9-]{16,128}$/u);
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel("disconnect");
    controllerRef.error(new Error("client disconnected"));
    await waitOnExecutionContext(streamContext);

    const listed = await env.AGENT_SESSIONS.get(env.AGENT_SESSIONS.idFromString(body.session.id)).listMessages("agent-member", { limit: 10 });
    expect(listed).toMatchObject({ ok: true, value: { items: [{ role: "user", content: "disconnect question" }], truncated: false } });
    await expect(env.AGENT_SESSIONS.get(env.AGENT_SESSIONS.idFromString(body.session.id)).getTurn("agent-member", turnId!)).resolves.toMatchObject({ ok: true, value: { status: "terminated" } });
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
