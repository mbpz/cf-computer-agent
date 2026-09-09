/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

describe("private task structure migration contract", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
      "member-b", "subject-b", "b@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    ).run();
    await env.DB.prepare(
      "INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES (?, ?, ?, '', 'todo', 0, 'medium', ?, ?), (?, ?, ?, '', 'todo', 0, 'medium', ?, ?), (?, ?, ?, '', 'todo', 0, 'medium', ?, ?)",
    ).bind("task-a", "member-a", "A", 1, 1, "task-b", "member-a", "B", 1, 1, "task-c", "member-b", "C", 1, 1).run();
  });

  it("creates ordered subtasks and rejects duplicate positions", async () => {
    await env.DB.prepare("INSERT INTO task_subtasks (id, member_id, task_id, title, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, 'todo', ?, ?, ?)").bind("sub-a", "member-a", "task-a", "First", 0, 1, 1).run();
    await expect(env.DB.prepare("INSERT INTO task_subtasks (id, member_id, task_id, title, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, 'todo', ?, ?, ?)").bind("sub-b", "member-a", "task-a", "Duplicate", 0, 2, 2).run()).rejects.toThrow();
  });

  it("enforces valid dependency edges and member-owned task relations", async () => {
    await env.DB.prepare("INSERT INTO task_dependencies (member_id, task_id, depends_on_task_id, created_at) VALUES (?, ?, ?, ?)").bind("member-a", "task-a", "task-b", 1).run();
    await expect(env.DB.prepare("INSERT INTO task_dependencies (member_id, task_id, depends_on_task_id, created_at) VALUES (?, ?, ?, ?)").bind("member-a", "task-a", "task-a", 2).run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO task_dependencies (member_id, task_id, depends_on_task_id, created_at) VALUES (?, ?, ?, ?)").bind("member-a", "task-a", "task-c", 3).run()).rejects.toThrow();
  });
});
