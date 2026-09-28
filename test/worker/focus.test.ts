/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { SessionService } from "../../src/identity/session";
import { MembersRepository } from "../../src/members/repository";
import { FocusRepository } from "../../src/focus/repository";
import { FocusService } from "../../src/focus/service";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = new Date("2026-09-09T10:00:00.000Z");

describe("focus workbench route", () => {
  let sessionA = "", sessionB = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    vi.useFakeTimers({ now: NOW });
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('focus-a', 'subject-focus-a', 'focus-a@example.test', 'contributor', 'active', ?, ?), ('focus-b', 'subject-focus-b', 'focus-b@example.test', 'contributor', 'active', ?, ?)").bind(NOW.toISOString(), NOW.toISOString(), NOW.toISOString(), NOW.toISOString()).run();
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES ('focus-task-a', 'focus-a', 'Focus task', '', 'todo', 0, 'medium', ?, ?), ('focus-task-b', 'focus-b', 'Other task', '', 'todo', 0, 'medium', ?, ?)").bind(NOW.getTime(), NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined, now: () => NOW });
    sessionA = (await sessions.create((await members.findByIdentitySubject("subject-focus-a"))!)).token;
    sessionB = (await sessions.create((await members.findByIdentitySubject("subject-focus-b"))!)).token;
  });

  afterEach(() => vi.useRealTimers());

  it("lists/searches and resolves only owned picker targets for both members", async () => {
    for (const [token, owned, foreign] of [[sessionA, "focus-task-a", "focus-task-b"], [sessionB, "focus-task-b", "focus-task-a"]]) {
      const response = await api("/api/tasks?page=1&pageSize=20&q=task", token);
      expect(response.status).toBe(200);
      const payload = await response.json() as {items: {id: string}[]; pagination: {total: number}};
      expect(payload.items.map(task => task.id)).toEqual([owned]); expect(payload.pagination.total).toBe(1);
      expect((await api(`/api/tasks/${owned}`, token)).status).toBe(200);
      expect((await api(`/api/tasks/${foreign}`, token)).status).toBe(404);
      expect((await api("/api/focus", token, {method: "POST", body: JSON.stringify({clientKey: `foreign-${owned}`, taskId: foreign})})).status).toBe(404);
    }
  });

  it("rejects a removed picker target without creating a session or calendar event", async () => {
    expect((await api("/api/tasks/focus-task-a", sessionA)).status).toBe(200);
    await env.DB.prepare("DELETE FROM tasks WHERE id = 'focus-task-a'").run();
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({clientKey: "removed", taskId: "focus-task-a"})})).status).toBe(404);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM focus_sessions").first("count")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM calendar_events").first("count")).toBe(0);
  });

  it("rejects a stale transition even when pause and resume share a wall-clock millisecond", async () => {
    await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "race", clientKey: "race", taskId: "focus-task-a"})});
    const repository = new FocusRepository(env.DB);
    const before = (await repository.findOwned("focus-a", "race"))!;
    const service = new FocusService(repository, {now: () => NOW});
    const paused = await service.pause("focus-a", "race");
    const resumed = await service.resume("focus-a", "race");
    expect(Date.parse(paused.updatedAt)).toBe(NOW.getTime() + 1);
    expect(Date.parse(resumed.updatedAt)).toBe(NOW.getTime() + 2);
    const stale = await repository.update("focus-a", "race", {status: "paused", startedAt: NOW.getTime(), pausedAt: NOW.getTime(), endedAt: null, elapsedMs: 123, updatedAt: NOW.getTime() + 3, expectedUpdatedAt: Date.parse(before.updatedAt)});
    expect(stale).toBeNull();
    expect(await repository.findOwned("focus-a", "race")).toMatchObject({status: "active", elapsedMs: 0, updatedAt: resumed.updatedAt});
  });

  it("losing a terminal-state race returns conflict and cannot overwrite the winner or its calendar", async () => {
    await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "terminal", clientKey: "terminal", taskId: "focus-task-a"})});
    const repository = new FocusRepository(env.DB);
    const originalUpdate = repository.update.bind(repository);
    // Interleave another real service transition after this service's read, before its write.
    repository.update = async (...args) => {
      repository.update = originalUpdate;
      await new FocusService(repository, {now: () => NOW}).abandon("focus-a", "terminal");
      return originalUpdate(...args);
    };
    const calendar = {setStatus: vi.fn()} as any;
    await expect(new FocusService(repository, {now: () => NOW, calendar}).complete("focus-a", "terminal")).rejects.toMatchObject({status: 409, code: "FOCUS_CONFLICT"});
    expect((await repository.findOwned("focus-a", "terminal"))?.status).toBe("abandoned");
    expect(calendar.setStatus).not.toHaveBeenCalled();
  });

  it("restores elapsed time through pause, resume, repeat and terminal current reads", async () => {
    await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "timer", clientKey: "timer", taskId: "focus-task-a"})});
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    expect(await (await api("/api/focus/timer/pause", sessionA, {method: "POST"})).json()).toMatchObject({status: "paused", elapsedMs: 60_000});
    vi.setSystemTime(new Date(NOW.getTime() + 300_000));
    expect(await (await api("/api/focus/timer/pause", sessionA, {method: "POST"})).json()).toMatchObject({status: "paused", elapsedMs: 60_000});
    expect(await (await api("/api/focus/current", sessionA)).json()).toMatchObject({session: {status: "paused", elapsedMs: 60_000}});
    await api("/api/focus/timer/resume", sessionA, {method: "POST"});
    vi.setSystemTime(new Date(NOW.getTime() + 330_000));
    expect(await (await api("/api/focus/timer/complete", sessionA, {method: "POST"})).json()).toMatchObject({status: "completed", elapsedMs: 90_000});
    expect(await (await api("/api/focus/current", sessionA)).json()).toEqual({session: null});
    expect(await (await api("/api/focus/timer/abandon", sessionA, {method: "POST"})).json()).toMatchObject({status: "completed", elapsedMs: 90_000});
    expect((await api("/api/focus/timer/pause", sessionB, {method: "POST"})).status).toBe(404);
  });

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
