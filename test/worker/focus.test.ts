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

  it("rolls back a calendar block when focus insertion fails", async () => {
    await env.DB.exec("CREATE TRIGGER fail_focus_insert BEFORE INSERT ON focus_sessions BEGIN SELECT RAISE(ABORT, 'injected focus failure'); END");
    const response = await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "atomic-start", clientKey: "atomic-start", taskId: "focus-task-a"})});
    expect(response.status).toBe(500);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM focus_sessions").first("count")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM calendar_events").first("count")).toBe(0);
  });

  it.each(["complete", "abandon"])("rolls back focus %s when calendar status persistence fails", async action => {
    await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "atomic-end", clientKey: "atomic-end", taskId: "focus-task-a"})});
    const before = await (await api("/api/focus/atomic-end", sessionA)).json();
    await env.DB.exec("CREATE TRIGGER fail_calendar_update BEFORE UPDATE ON calendar_events BEGIN SELECT RAISE(ABORT, 'injected calendar failure'); END");
    expect((await transition(`/api/focus/atomic-end/${action}`, sessionA)).status).toBe(500);
    expect(await (await api("/api/focus/atomic-end", sessionA)).json()).toEqual(before);
    expect(await env.DB.prepare("SELECT status FROM calendar_events WHERE member_id = 'focus-a'").first("status")).toBe("scheduled");
    await env.DB.exec("DROP TRIGGER fail_calendar_update");
    expect((await transition(`/api/focus/atomic-end/${action}`, sessionA)).status).toBe(200);
    expect(await env.DB.prepare("SELECT status FROM calendar_events WHERE member_id = 'focus-a'").first("status")).toBe(action === "complete" ? "completed" : "canceled");
  });

  it("rolls back focus when calendar insertion fails, then permits the exact retry", async () => {
    const input = {id: "calendar-failure", clientKey: "calendar-failure", taskId: "focus-task-a"};
    await env.DB.exec("CREATE TRIGGER fail_calendar_insert BEFORE INSERT ON calendar_events BEGIN SELECT RAISE(ABORT, 'injected calendar failure'); END");
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify(input)})).status).toBe(500);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM focus_sessions").first("count")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM calendar_events").first("count")).toBe(0);
    await env.DB.exec("DROP TRIGGER fail_calendar_insert");
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify(input)})).status).toBe(201);
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify(input)})).status).toBe(200);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM calendar_events").first("count")).toBe(1);
  });

  it("supports maximum-length start identities without exceeding calendar identity limits", async () => {
    const response = await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "x".repeat(128), clientKey: "y".repeat(128), taskId: "focus-task-a"})});
    expect(response.status).toBe(201);
    const {session} = await response.json() as {session: {calendarEventId: string}};
    expect(session.calendarEventId.length).toBeLessThanOrEqual(128);
    const calendar = await api(`/api/calendar/events/${session.calendarEventId}`, sessionA);
    expect(calendar.status).toBe(200);
  });

  it.each(["missing", "foreign", "different-task"])("rejects terminal writes with a %s calendar link without changing either resource", async corruption => {
    await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "broken-link", clientKey: "broken-link", taskId: "focus-task-a"})});
    if (corruption === "missing") await env.DB.exec("UPDATE focus_sessions SET calendar_event_id = 'missing'");
    if (corruption === "foreign") await env.DB.exec("UPDATE calendar_events SET member_id = 'focus-b', task_id = 'focus-task-b'");
    if (corruption === "different-task") await env.DB.exec("UPDATE calendar_events SET task_id = NULL");
    const before = await (await api("/api/focus/broken-link", sessionA)).json();
    const events = (await env.DB.prepare("SELECT * FROM calendar_events").all()).results;
    expect((await transition("/api/focus/broken-link/complete", sessionA)).status).toBe(409);
    expect(await (await api("/api/focus/broken-link", sessionA)).json()).toEqual(before);
    expect((await env.DB.prepare("SELECT * FROM calendar_events").all()).results).toEqual(events);
  });

  it("prevents calendar-side cancellation and task detachment of a managed focus block", async () => {
    const start = await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "managed", clientKey: "managed", taskId: "focus-task-a"})});
    const {session} = await start.json() as {session: {calendarEventId: string}};
    const path = `/api/calendar/events/${session.calendarEventId}`;
    const before = await (await api(path, sessionA)).json() as {updatedAt: string};
    expect((await api(path, sessionA, {method: "DELETE", body: JSON.stringify({expectedUpdatedAt: before.updatedAt})})).status).toBe(409);
    expect((await api(path, sessionA, {method: "PATCH", body: JSON.stringify({taskId: null, expectedUpdatedAt: before.updatedAt})})).status).toBe(409);
    expect(await (await api(path, sessionA)).json()).toEqual(before);
    expect((await api(path, sessionB, {method: "DELETE", body: JSON.stringify({expectedUpdatedAt: before.updatedAt})})).status).toBe(404);
    expect((await api(path, sessionA, {method: "PATCH", body: JSON.stringify({title: "Edited independently", expectedUpdatedAt: before.updatedAt})})).status).toBe(200);
    expect((await transition("/api/focus/managed/complete", sessionA)).status).toBe(200);
    expect(await (await api(path, sessionA)).json()).toMatchObject({title: "Edited independently", status: "completed", taskId: "focus-task-a"});
  });

  it("does not create another calendar block when the exact insert loses to a replay", async () => {
    const repository = new FocusRepository(env.DB);
    const insert = repository.insert.bind(repository);
    repository.insert = async input => {
      await insert(input);
      return insert({...input, calendarEventId: "unused-loser-calendar"});
    };
    const result = await new FocusService(repository, {now: () => NOW}).start("focus-a", {id: "same-race", clientKey: "same-race", taskId: "focus-task-a"});
    expect(result.created).toBe(false);
    expect(result.session.calendarEventId).not.toBe("unused-loser-calendar");
    expect((await env.DB.prepare("SELECT id FROM calendar_events").all()).results).toEqual([{id: result.session.calendarEventId}]);
  });

  it.each(["complete", "abandon"])("keeps calendar revisions monotonic for %s and does not rewrite on terminal replay", async action => {
    await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "future-calendar", clientKey: "future-calendar", taskId: "focus-task-a"})});
    const future = NOW.getTime() + 60_000;
    await env.DB.prepare("UPDATE calendar_events SET updated_at = ?").bind(future).run();
    expect((await transition(`/api/focus/future-calendar/${action}`, sessionA)).status).toBe(200);
    const calendar = await env.DB.prepare("SELECT * FROM calendar_events").first();
    expect(calendar).toMatchObject({updated_at: future + 1, status: action === "complete" ? "completed" : "canceled"});
    expect((await transition(`/api/focus/future-calendar/${action}`, sessionA)).status).toBe(200);
    expect(await env.DB.prepare("SELECT * FROM calendar_events").first()).toEqual(calendar);
    const path = `/api/calendar/events/${calendar!.id}`;
    expect((await api(path, sessionA, {method: "DELETE", body: JSON.stringify({expectedUpdatedAt: new Date(future + 1).toISOString()})})).status).toBe(409);
  });

  it.each([{title: "Changed title"}, {durationMinutes: 30}])("rejects changed start payload on key replay %j without changing the calendar", async patch => {
    const input = {id: "payload", clientKey: "payload", taskId: "focus-task-a", title: "Original", durationMinutes: 25};
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify(input)})).status).toBe(201);
    const before = await env.DB.prepare("SELECT * FROM calendar_events").all();
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({...input, ...patch})})).status).toBe(409);
    expect(await env.DB.prepare("SELECT * FROM calendar_events").all()).toMatchObject({results: before.results});
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify(input)})).status).toBe(200);
  });

  it("rejects a concurrent winner with different start payload", async () => {
    const repository = new FocusRepository(env.DB);
    const insert = repository.insert.bind(repository);
    repository.insert = async input => {
      await insert({...input, startTitle: "Another title", durationMinutes: 40});
      return insert(input);
    };
    await expect(new FocusService(repository, {now: () => NOW}).start("focus-a", {id: "payload-race", clientKey: "payload-race", taskId: "focus-task-a", title: "Original", durationMinutes: 25})).rejects.toMatchObject({status: 409, code: "FOCUS_CONFLICT"});
  });

  it("normalizes defaults and keeps original start payload after calendar edits and session completion", async () => {
    const input = {id: "normalized", clientKey: "normalized", taskId: "focus-task-a"};
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify(input)})).status).toBe(201);
    await env.DB.prepare("UPDATE calendar_events SET title = 'Edited independently' WHERE member_id = 'focus-a'").run();
    await transition("/api/focus/normalized/complete", sessionA);
    const replay = await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({...input, title: " Focus session ", durationMinutes: 25})});
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({created: false, session: {status: "completed", startTitle: "Focus session", durationMinutes: 25}});
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({...input, title: "Edited independently"})})).status).toBe(409);
  });

  it("does not invent an original payload for legacy sessions but permits owned reads and transitions", async () => {
    await env.DB.prepare("INSERT INTO focus_sessions (id, member_id, task_id, client_key, status, started_at, elapsed_ms, created_at, updated_at) VALUES ('legacy', 'focus-a', 'focus-task-a', 'legacy', 'active', ?, 0, ?, ?)").bind(NOW.getTime(), NOW.getTime(), NOW.getTime()).run();
    expect(await (await api("/api/focus/legacy", sessionA)).json()).toMatchObject({startTitle: null, durationMinutes: null});
    expect((await api("/api/focus", sessionA, {method: "POST", body: JSON.stringify({id: "legacy", clientKey: "legacy", taskId: "focus-task-a"})})).status).toBe(409);
    expect((await transition("/api/focus/legacy/complete", sessionA)).status).toBe(200);
    expect((await api("/api/focus/legacy", sessionB)).status).toBe(404);
  });

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
    expect((await env.DB.prepare("SELECT client_key FROM calendar_events WHERE member_id = 'focus-a'").all()).results).toEqual([{client_key: "focus:winner-key"}]);
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
    await expect(new FocusService(repository, {now: () => NOW}).complete("focus-a", "terminal", (await repository.findOwned("focus-a", "terminal"))!.updatedAt)).rejects.toMatchObject({status: 409, code: "FOCUS_CONFLICT"});
    expect((await repository.findOwned("focus-a", "terminal"))?.status).toBe("abandoned");
    expect(await env.DB.prepare("SELECT status FROM calendar_events WHERE member_id = ?").bind("focus-a").first()).toEqual({status: "canceled"});
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
