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
  });
});
