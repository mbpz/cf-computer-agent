/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";

describe("private Projects migration contract", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
      "member-b", "subject-b", "b@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    ).run();
  });

  it("creates a member-scoped project schema with bounded states and stable indexes", async () => {
    const table = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'projects'").first<{ sql: string }>();
    expect(table?.sql).toContain("status TEXT NOT NULL");
    expect(table?.sql).toContain("progress INTEGER NOT NULL");
    expect(table?.sql).toContain("status IN ('planned', 'active', 'paused', 'completed', 'archived')");
    const columns = await env.DB.prepare("PRAGMA table_info('projects')").all<{ name: string }>();
    expect(columns.results.map((column) => column.name)).toEqual([
      "id", "member_id", "client_key", "title", "description", "status", "progress", "target_at", "created_at", "updated_at",
    ]);
    const indexes = await env.DB.prepare("PRAGMA index_list('projects')").all<{ name: string }>();
    expect(indexes.results.map((index) => index.name)).toEqual(expect.arrayContaining([
      "idx_projects_member_client_key",
      "idx_projects_member_status_updated",
    ]));
  });

  it("enforces project relations as member-scoped unique edges", async () => {
    await env.DB.prepare("INSERT INTO goals (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 0, ?, ?)").bind("goal-a", "member-a", "goal-a", "Goal A", 1, 1).run();
    await env.DB.prepare("INSERT INTO tasks (id, member_id, title, notes, status, progress, priority, created_at, updated_at) VALUES (?, ?, ?, '', 'todo', 0, 'medium', ?, ?)").bind("task-a", "member-a", "Task A", 1, 1).run();
    await env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, 'planned', 0, ?, ?)").bind("project-a", "member-a", "project-a", "Project A", 1, 1).run();
    await env.DB.prepare("INSERT INTO project_goals (project_id, member_id, goal_id, created_at) VALUES (?, ?, ?, ?)").bind("project-a", "member-a", "goal-a", 1).run();
    await expect(env.DB.prepare("INSERT INTO project_goals (project_id, member_id, goal_id, created_at) VALUES (?, ?, ?, ?)").bind("project-a", "member-a", "goal-a", 2).run()).rejects.toThrow();
    await env.DB.prepare("INSERT INTO project_tasks (project_id, member_id, task_id, created_at) VALUES (?, ?, ?, ?)").bind("project-a", "member-a", "task-a", 1).run();
    await expect(env.DB.prepare("INSERT INTO project_tasks (project_id, member_id, task_id, created_at) VALUES (?, ?, ?, ?)").bind("project-a", "member-a", "task-a", 2).run()).rejects.toThrow();
  });

  it("rejects invalid project states and progress at the database boundary", async () => {
    await expect(env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("project-invalid", "member-a", "project-invalid", "Bad", "done", 0, 1, 1).run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO projects (id, member_id, client_key, title, status, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind("project-invalid-progress", "member-a", "project-invalid-progress", "Bad", "planned", 101, 1, 1).run()).rejects.toThrow();
  });

  it("seeds the Projects workbench menu with task permission semantics", async () => {
    const menu = await env.DB.prepare("SELECT path, label_key, required_bits, status, visible FROM menus WHERE path = '/projects'").first<{ path: string; label_key: string; required_bits: string; status: string; visible: number }>();
    expect(menu).toEqual({ path: "/projects", label_key: "NAV_PROJECTS", required_bits: "0x100000", status: "active", visible: 1 });
  });
});
