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

  it("rejects missing, malformed and stale client versions before changing focus state", async () => {
    await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "versioned", clientKey: "versioned", taskId: "focus-task-a"})});
    for (const body of [{}, {expectedUpdatedAt: "bad"}, {expectedUpdatedAt: 1}]) {
      expect((await api("/api/focus/versioned/pause", sessionA, {method: "POST", body: JSON.stringify(body)})).status).toBe(400);
    }
    const original = await (await api("/api/focus/versioned", sessionA)).json() as {updatedAt: string};
    const paused = await api("/api/focus/versioned/pause", sessionA, {method: "POST", body: JSON.stringify({expectedUpdatedAt: original.updatedAt})});
    expect(paused.status).toBe(200);
    const receipt = await paused.json() as {updatedAt: string};
    expect(Date.parse(receipt.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));
    // Check the observed version before no-op handling as well as state changes.
    for (const action of ["pause", "resume", "complete", "abandon"]) {
      expect((await api(`/api/focus/versioned/${action}`, sessionA, {method: "POST", body: JSON.stringify({expectedUpdatedAt: original.updatedAt})})).status).toBe(409);
    }
    expect(await (await api("/api/focus/versioned", sessionA)).json()).toMatchObject({status: "paused", updatedAt: receipt.updatedAt});
    expect((await api("/api/focus/versioned/complete", sessionB, {method: "POST", body: JSON.stringify({expectedUpdatedAt: receipt.updatedAt})})).status).toBe(404);
  });

  it("does not report another concurrent start as this request's receipt", async () => {
    const repository = new FocusRepository(env.DB);
    const insert = repository.insert.bind(repository);
    repository.insert = async input => {
      await insert({...input, id: "winner", clientKey: "winner-key"});
      return insert(input);
    };
    const service = new FocusService(repository, {now: () => NOW});
    await expect(service.start("focus-a", {id: "loser", clientKey: "loser-key", taskId: "focus-task-a"})).rejects.toMatchObject({status: 409});
    expect(await repository.findOwned("focus-a", "loser")).toBeNull();
    expect(await repository.findOpen("focus-a")).toMatchObject({id: "winner"});
  });

  it("reads an owned terminal receipt by ID without exposing another member", async () => {
    await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "receipt", clientKey: "receipt-key", taskId: "focus-task-a"})});
    await transition("/api/focus/receipt/complete", sessionA);
    const read = await api("/api/focus/receipt", sessionA);
    expect(read.status).toBe(200); expect(await read.json()).toMatchObject({id: "receipt", status: "completed", clientKey: "receipt-key"});
    expect((await api("/api/focus/receipt", sessionB)).status).toBe(404);
    expect((await api("/api/focus/missing", sessionA)).status).toBe(404);
  });
  it("rejects reuse of a start key for a different session or task", async () => {
    const input = {id: "intent", clientKey: "stable", taskId: "focus-task-a"};
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify(input)})).status).toBe(201);
    for (const patch of [{id: "different"}, {taskId: "focus-task-b"}]) {
      expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({...input, ...patch})})).status).toBe(409);
    }
    const replay = await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify(input)});
    expect(replay.status).toBe(200); expect(await replay.json()).toMatchObject({created: false, session: {id: "intent"}});
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM focus_sessions").first("count")).toBe(1);
  });

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
    const paused = await service.pause("focus-a", "race", before.updatedAt);
    const resumed = await service.resume("focus-a", "race", paused.updatedAt);
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
      await new FocusService(repository, {now: () => NOW}).abandon("focus-a", "terminal", (await repository.findOwned("focus-a", "terminal"))!.updatedAt);
      return originalUpdate(...args);
    };
    const calendar = {setStatus: vi.fn()} as any;
    await expect(new FocusService(repository, {now: () => NOW, calendar}).complete("focus-a", "terminal", (await repository.findOwned("focus-a", "terminal"))!.updatedAt)).rejects.toMatchObject({status: 409, code: "FOCUS_CONFLICT"});
    expect((await repository.findOwned("focus-a", "terminal"))?.status).toBe("abandoned");
    expect(calendar.setStatus).not.toHaveBeenCalled();
  });

  it("restores elapsed time through pause, resume, repeat and terminal current reads", async () => {
    await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "timer", clientKey: "timer", taskId: "focus-task-a"})});
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    expect(await (await transition("/api/focus/timer/pause", sessionA)).json()).toMatchObject({status: "paused", elapsedMs: 60_000});
    vi.setSystemTime(new Date(NOW.getTime() + 300_000));
    expect(await (await transition("/api/focus/timer/pause", sessionA)).json()).toMatchObject({status: "paused", elapsedMs: 60_000});
    expect(await (await api("/api/focus/current", sessionA)).json()).toMatchObject({session: {status: "paused", elapsedMs: 60_000}});
    await transition("/api/focus/timer/resume", sessionA);
    vi.setSystemTime(new Date(NOW.getTime() + 330_000));
    expect(await (await transition("/api/focus/timer/complete", sessionA)).json()).toMatchObject({status: "completed", elapsedMs: 90_000});
    expect(await (await api("/api/focus/current", sessionA)).json()).toEqual({session: null});
    expect(await (await transition("/api/focus/timer/abandon", sessionA)).json()).toMatchObject({status: "completed", elapsedMs: 90_000});
    expect((await transition("/api/focus/timer/pause", sessionB)).status).toBe(404);
  });

  it("starts idempotently, restores current state, transitions, and rejects cross-member task", async () => {
    const start = await api("/api/focus", sessionA, { method: "POST", body: JSON.stringify({ id: "focus-1", clientKey: "focus-key-1", taskId: "focus-task-a", durationMinutes: 25 }) });
    expect(start.status).toBe(201);
    const started = await start.json() as { session: { id: string; status: string; calendarEventId: string | null } };
    expect(started.session).toMatchObject({ id: "focus-1", status: "active" });
    expect(started.session.calendarEventId).toBeTruthy();
    expect((await api("/api/focus", sessionA, { method: "POST", body: JSON.stringify({ id: "focus-1", clientKey: "focus-key-1", taskId: "focus-task-a" }) })).status).toBe(200);
    expect((await api("/api/focus/current", sessionA)).status).toBe(200);
    expect((await transition("/api/focus/focus-1/pause", sessionA)).status).toBe(200);
    expect((await transition("/api/focus/focus-1/resume", sessionA)).status).toBe(200);
    expect((await transition("/api/focus/focus-1/complete", sessionA)).status).toBe(200);
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

async function transition(path: string, token: string): Promise<Response> {
  const target = path.slice(0, path.lastIndexOf("/"));
  const read = await api(target, token);
  const receipt = await read.json() as {updatedAt?: string};
  return api(path, token, {method: "POST", body: JSON.stringify({expectedUpdatedAt: receipt.updatedAt ?? NOW.toISOString()})});
}
