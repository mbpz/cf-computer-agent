/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { CalendarRepository } from "../../src/calendar/repository";
import { CalendarService } from "../../src/calendar/service";
import type { CalendarEvent } from "../../src/calendar/types";
import { AppError } from "../../src/http";

describe("private calendar migration contract", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)").bind("member-a", "subject-a", "a@example.test", 1, 1, "member-b", "subject-b", "b@example.test", 1, 1).run();
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES (?, ?, ?, '', 'todo', 0, 'medium', ?, ?), (?, ?, ?, '', 'todo', 0, 'medium', ?, ?)").bind("task-a", "member-a", "A", 1, 1, "task-b", "member-b", "B", 1, 1).run();
  });

  it("enforces event time, client idempotency, and overlap indexes", async () => {
    await env.DB.prepare("INSERT INTO calendar_events (id, member_id, client_key, kind, title, starts_at, ends_at, timezone, all_day, status, created_at, updated_at) VALUES (?, ?, ?, 'event', ?, ?, ?, 'UTC', 0, 'scheduled', ?, ?)").bind("event-a", "member-a", "client-a", "A", 100, 200, 1, 1).run();
    await expect(env.DB.prepare("INSERT INTO calendar_events (id, member_id, client_key, kind, title, starts_at, ends_at, timezone, all_day, status, created_at, updated_at) VALUES (?, ?, ?, 'event', ?, ?, ?, 'UTC', 0, 'scheduled', ?, ?)").bind("event-b", "member-a", "client-a", "B", 300, 400, 2, 2).run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO calendar_events (id, member_id, client_key, kind, title, starts_at, ends_at, timezone, all_day, status, created_at, updated_at) VALUES (?, ?, ?, 'event', ?, ?, ?, 'UTC', 0, 'scheduled', ?, ?)").bind("event-c", "member-a", "client-c", "C", 500, 500, 3, 3).run()).rejects.toThrow();
  });

  it("rejects cross-member task relations at the database boundary", async () => {
    await expect(env.DB.prepare("INSERT INTO calendar_events (id, member_id, client_key, kind, title, starts_at, ends_at, timezone, all_day, status, task_id, created_at, updated_at) VALUES (?, ?, ?, 'event', ?, ?, ?, 'UTC', 0, 'scheduled', ?, ?, ?)").bind("event-cross", "member-a", "client-cross", "Cross", 100, 200, "task-b", 1, 1).run()).rejects.toThrow();
  });

  it.each(["task", "project"] as const)("detaches only the deleted %s reference and preserves other members and fields", async (kind) => {
    await seedLinkedEvents();
    const before = (await env.DB.prepare("SELECT * FROM calendar_events ORDER BY id").all()).results;
    const table = kind === "task" ? "tasks" : "projects";
    await env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND member_id = 'member-a'`).bind(`${kind}-a`).run();
    const after = (await env.DB.prepare("SELECT * FROM calendar_events ORDER BY id").all()).results;
    expect(after).toEqual([
      { ...before[0], [`${kind}_id`]: null, updated_at: expect.any(Number) },
      before[1],
    ]);
    expect(Number(after[0]!.updated_at)).toBeGreaterThanOrEqual(Number(before[0]!.updated_at));
    expect(await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(`${kind}-a`).first()).toBeNull();
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it.each(["task", "project"] as const)("rolls back %s detachment if a later statement in the transaction fails", async (kind) => {
    await seedLinkedEvents();
    await env.DB.exec("INSERT INTO browser_environments (id, member_id, name, type, task_id, created_at, updated_at) VALUES ('env-a', 'member-a', 'Keep VM', 'personal', 'task-a', 1, 1);");
    const events = (await env.DB.prepare("SELECT * FROM calendar_events ORDER BY id").all()).results;
    const vm = await env.DB.prepare("SELECT * FROM browser_environments WHERE id = 'env-a'").first();
    const table = kind === "task" ? "tasks" : "projects";
    await expect(env.DB.batch([
      env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND member_id = 'member-a'`).bind(`${kind}-a`),
      env.DB.prepare("UPDATE calendar_events SET ends_at = starts_at WHERE id = 'event-b'"),
    ])).rejects.toThrow(/CHECK constraint failed/);
    expect((await env.DB.prepare("SELECT * FROM calendar_events ORDER BY id").all()).results).toEqual(events);
    expect(await env.DB.prepare("SELECT * FROM browser_environments WHERE id = 'env-a'").first()).toEqual(vm);
    expect(await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(`${kind}-a`).first()).toEqual({ id: `${kind}-a` });
    expect((await env.DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });

  it("keeps cross-member project references and NULL owners forbidden after repair", async () => {
    await seedLinkedEvents();
    await expect(env.DB.prepare("UPDATE calendar_events SET project_id = 'project-b' WHERE id = 'event-a'").run()).rejects.toThrow(/FOREIGN KEY constraint failed/);
    await expect(env.DB.prepare("UPDATE calendar_events SET member_id = NULL WHERE id = 'event-a'").run()).rejects.toThrow(/NOT NULL constraint failed/);
    expect(await env.DB.prepare("SELECT member_id, project_id FROM calendar_events WHERE id = 'event-a'").first()).toEqual({ member_id: "member-a", project_id: "project-a" });
  });
});

describe("workbench calendar service convergence", () => {
  const NOW_MS = Date.parse("2026-09-09T10:00:00.000Z");
  const STARTS = Date.parse("2026-09-10T01:00:00.000Z");
  const ENDS = Date.parse("2026-09-10T02:00:00.000Z");
  let calendar: CalendarService;
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare("INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)").bind("member-a", "subject-a", "a@example.test", 1, 1, "member-b", "subject-b", "b@example.test", 1, 1).run();
    calendar = new CalendarService(new CalendarRepository(env.DB), { now: () => new Date(NOW_MS) });
  });

  it("workbench-calendar:query_or_idempotency:create-calendar-event — duplicate clicks converge on one identical-time event while new-key modifications conflict and members stay isolated", async () => {
    const [first, second] = await Promise.all([
      calendar.create("member-a", { id: "event-race-1", clientKey: "calendar-race-key", title: "Race one", startsAt: STARTS, endsAt: ENDS }),
      calendar.create("member-a", { id: "event-race-2", clientKey: "calendar-race-key", title: "Race two", startsAt: STARTS, endsAt: ENDS }),
    ]);
    expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
    expect(first.event.id).toBe(second.event.id);
    const winnerId = first.event.id;
    expect(await eventCount("member-a", "calendar-race-key")).toBe(1);

    const retry = await calendar.create("member-a", { id: "event-race-3", clientKey: "calendar-race-key", title: "Retry", startsAt: STARTS + 86_400_000, endsAt: ENDS + 86_400_000 });
    expect(retry.created).toBe(false);
    expect(retry.event.id).toBe(winnerId);
    const stored = await env.DB.prepare("SELECT title, starts_at, ends_at FROM calendar_events WHERE id = ?").bind(winnerId).first<{ title: string; starts_at: number; ends_at: number }>();
    expect(stored).toEqual({ title: first.event.title, starts_at: STARTS, ends_at: ENDS });

    expect(await conflictOf(() => calendar.create("member-a", { id: winnerId, clientKey: "calendar-modify-key", title: "Renamed", startsAt: STARTS, endsAt: ENDS }))).toEqual({ status: 409, code: "CALENDAR_ID_CONFLICT" });
    expect(await env.DB.prepare("SELECT title, starts_at, ends_at, client_key, status FROM calendar_events WHERE id = ?").bind(winnerId).first()).toEqual({ title: "Race one", starts_at: STARTS, ends_at: ENDS, client_key: "calendar-race-key", status: "scheduled" });

    const added = await calendar.create("member-a", { id: "event-extra", clientKey: "calendar-modify-key", title: "Renamed", startsAt: STARTS, endsAt: ENDS });
    expect(added.created).toBe(true);
    expect(added.event.id).toBe("event-extra");
    expect(await eventCount("member-a", "calendar-race-key")).toBe(1);
    expect(await eventCount("member-a", "calendar-modify-key")).toBe(1);

    const other = await calendar.create("member-b", { id: "event-b", clientKey: "calendar-race-key", title: "B event", startsAt: STARTS, endsAt: ENDS });
    expect(other.created).toBe(true);
    expect(other.event.id).not.toBe(winnerId);
    expect((await calendar.create("member-a", { id: "event-ignored", clientKey: "calendar-race-key", title: "Replay", startsAt: STARTS, endsAt: ENDS })).event.id).toBe(winnerId);
    expect(await eventCount("member-b", "calendar-race-key")).toBe(1);
    expect(await eventCount("member-a", "calendar-race-key")).toBe(1);
  });

  it("workbench-calendar:query_or_idempotency:cancel-calendar-event — cancel and edit race to one winner, repeated cancel converges and foreign members see nothing", async () => {
    const created = await calendar.create("member-a", { id: "event-cancel", clientKey: "calendar-cancel-key", title: "Original", startsAt: STARTS, endsAt: ENDS });
    const fresh = await calendar.get("member-a", created.event.id);
    const initialVersion = fresh.updatedAt;

    const settled = await Promise.allSettled([
      calendar.update("member-a", fresh.id, { expectedUpdatedAt: initialVersion, title: "Edited" }),
      calendar.cancel("member-a", fresh.id, initialVersion),
    ]);
    const fulfilled = settled.filter((result): result is PromiseFulfilledResult<CalendarEvent> => result.status === "fulfilled");
    const rejected = settled.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = rejected[0]!.reason;
    expect(failure).toBeInstanceOf(AppError);
    expect({ status: (failure as AppError).status, code: (failure as AppError).code }).toEqual({ status: 409, code: "CALENDAR_VERSION_CONFLICT" });

    const authoritative = await calendar.get("member-a", fresh.id);
    expect(authoritative.updatedAt).toBe(fulfilled[0]!.value.updatedAt);
    expect(authoritative.status).toBe(fulfilled[0]!.value.status);

    const repeat = await calendar.cancel("member-a", fresh.id, authoritative.updatedAt);
    expect(repeat.status).toBe("canceled");
    expect((await calendar.get("member-a", fresh.id)).status).toBe("canceled");

    const before = await env.DB.prepare("SELECT status, updated_at FROM calendar_events WHERE id = ?").bind(fresh.id).first<{ status: string; updated_at: number }>();
    expect(await conflictOf(() => calendar.cancel("member-a", fresh.id, initialVersion))).toEqual({ status: 409, code: "CALENDAR_VERSION_CONFLICT" });
    expect(await env.DB.prepare("SELECT status, updated_at FROM calendar_events WHERE id = ?").bind(fresh.id).first()).toEqual(before);

    expect(await conflictOf(() => calendar.get("member-b", fresh.id))).toEqual({ status: 404, code: "CALENDAR_NOT_FOUND" });
    expect(await conflictOf(() => calendar.cancel("member-b", fresh.id, authoritative.updatedAt))).toEqual({ status: 404, code: "CALENDAR_NOT_FOUND" });
  });
});

async function eventCount(memberId: string, clientKey: string): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM calendar_events WHERE member_id = ? AND client_key = ?").bind(memberId, clientKey).first<{ count: number }>();
  return row?.count ?? -1;
}

async function conflictOf(run: () => Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) return { status: error.status, code: error.code };
    throw error;
  }
  throw new Error("Expected the call to reject");
}

async function seedLinkedEvents() {
  for (const suffix of ["a", "b"]) {
    await env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 0, 1, 1)").bind(`project-${suffix}`, `member-${suffix}`, `project-key-${suffix}`, `Project ${suffix}`).run();
    // Future timestamp tests that the database clock never moves updated_at back.
    await env.DB.prepare("INSERT INTO calendar_events (id, member_id, client_key, kind, title, description, starts_at, ends_at, timezone, all_day, status, task_id, project_id, created_at, updated_at) VALUES (?, ?, ?, 'focus', ?, 'Keep description', 100, 200, 'Asia/Shanghai', 0, 'completed', ?, ?, 1, 4102444800000)").bind(`event-${suffix}`, `member-${suffix}`, `event-key-${suffix}`, `Event ${suffix}`, `task-${suffix}`, `project-${suffix}`).run();
  }
}
