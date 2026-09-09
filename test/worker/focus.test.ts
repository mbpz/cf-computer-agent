/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = new Date("2026-09-09T10:00:00.000Z");

describe("focus workbench route", () => {
  let sessionA = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    vi.useFakeTimers({ now: NOW });
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('focus-a', 'subject-focus-a', 'focus-a@example.test', 'contributor', 'active', ?, ?), ('focus-b', 'subject-focus-b', 'focus-b@example.test', 'contributor', 'active', ?, ?)").bind(NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), NOW.toISOString()).run();
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES ('focus-task-a', 'focus-a', 'Focus task', '', 'todo', 0, 'medium', ?, ?), ('focus-task-b', 'focus-b', 'Other task', '', 'todo', 0, 'medium', ?, ?)").bind(NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => NOW });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-focus-a"))!)).token;
  });

  afterEach(() => vi.useRealTimers());

  it("starts idempotently, restores current state, transitions, and rejects cross-member task", async () => {
    const start = await api("/api/focus", sessionA, { method: "POST", body: JSON.stringify({ id: "focus-1", clientKey: "focus-key-1", taskId: "focus-task-a", durationMinutes: 25 }) });
    expect(start.status).toBe(201);
    const started = await start.json() as { session: { id: string; status: string; calendarEventId: string | null } };
    expect(started.session).toMatchObject({ id: "focus-1", status: "active" });
    expect(started.session.calendarEventId).toBeTruthy();
    expect((await api("/api/focus", sessionA, { method: "POST", body: JSON.stringify({ id: "other", clientKey: "focus-key-1", taskId: "focus-task-a" }) })).status).toBe(200);
    expect((await api("/api/focus/current", sessionA)).status).toBe(200);
    expect((await api("/api/focus/focus-1/pause", sessionA, { method: "POST" })).status).toBe(200);
    expect((await api("/api/focus/focus-1/resume", sessionA, { method: "POST" })).status).toBe(200);
    expect((await api("/api/focus/focus-1/complete", sessionA, { method: "POST" })).status).toBe(200);
    expect((await api("/api/focus", sessionA, { method: "POST", body: JSON.stringify({ clientKey: "bad", taskId: "focus-task-b" }) })).status).toBe(404);
  });
});

async function api(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("cookie", `__Host-memory-session=${token}`);
  headers.set("origin", "https://memory.crgmhrc.asia");
  headers.set("content-type", "application/json");
  const context = createExecutionContext();
  const response = await createApp().fetch!(new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
