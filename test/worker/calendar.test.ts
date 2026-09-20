/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

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

async function seedLinkedEvents() {
  for (const suffix of ["a", "b"]) {
    await env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 0, 1, 1)").bind(`project-${suffix}`, `member-${suffix}`, `project-key-${suffix}`, `Project ${suffix}`).run();
    // Future timestamp tests that the database clock never moves updated_at back.
    await env.DB.prepare("INSERT INTO calendar_events (id, member_id, client_key, kind, title, description, starts_at, ends_at, timezone, all_day, status, task_id, project_id, created_at, updated_at) VALUES (?, ?, ?, 'focus', ?, 'Keep description', 100, 200, 'Asia/Shanghai', 0, 'completed', ?, ?, 1, 4102444800000)").bind(`event-${suffix}`, `member-${suffix}`, `event-key-${suffix}`, `Event ${suffix}`, `task-${suffix}`, `project-${suffix}`).run();
  }
}
