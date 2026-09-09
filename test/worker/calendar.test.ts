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
});
