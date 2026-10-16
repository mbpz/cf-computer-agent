/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS } from "../fixtures/d1";
import { ProjectsRepository } from "../../src/projects/repository";
import { ProjectsService } from "../../src/projects/service";
import { GoalsRepository } from "../../src/goals/repository";
import { GoalsService } from "../../src/goals/service";
import { TasksRepository } from "../../src/tasks/repository";
import { TasksService } from "../../src/tasks/service";
import { ProjectTimelineRepository } from "../../src/project-timeline/repository";
import { ProjectTimelineService } from "../../src/project-timeline/service";
import type { Project } from "../../src/projects/types";

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

  it("reconciles real D1 task links, status changes, unlink and cascading deletion", async () => {
    const { projects, tasks } = services();
    await projects.create("member-a", { id: "project-a", clientKey: "p-a", title: "A", progress: 37 });
    await tasks.create("member-a", { id: "task-a", title: "A" });
    await tasks.create("member-a", { id: "task-b", title: "B" });
    expect((await projects.linkTask("member-a", "project-a", "task-a", (await projects.get("member-a", "project-a")).updatedAt)).linked).toBe(true);
    expect((await projects.linkTask("member-a", "project-a", "task-a", (await projects.get("member-a", "project-a")).updatedAt)).linked).toBe(false);
    await projects.linkTask("member-a", "project-a", "task-b", (await projects.get("member-a", "project-a")).updatedAt);
    expect(await projects.summary("member-a", "project-a")).toMatchObject({ taskCount: 2, completedTaskCount: 0 });
    await tasks.setStatus("member-a", "task-a", "done", "todo");
    expect(await projects.summary("member-a", "project-a")).toMatchObject({ taskCount: 2, completedTaskCount: 1 });
    await tasks.setStatus("member-a", "task-a", "todo", "done");
    await tasks.setStatus("member-a", "task-b", "canceled", "todo");
    expect(await projects.summary("member-a", "project-a")).toMatchObject({ taskCount: 2, completedTaskCount: 0 });
    await projects.unlinkTask("member-a", "project-a", "task-a", (await projects.get("member-a", "project-a")).updatedAt);
    await projects.unlinkTask("member-a", "project-a", "task-a", (await projects.get("member-a", "project-a")).updatedAt);
    expect(await projects.summary("member-a", "project-a")).toMatchObject({ taskCount: 1, completedTaskCount: 0 });
    await tasks.delete("member-a", "task-b", (await tasks.get("member-a", "task-b")).task.updatedAt);
    expect(await projects.summary("member-a", "project-a")).toMatchObject({ taskCount: 0, completedTaskCount: 0 });
    // Project progress is an explicit field, not an invented task-completion percentage.
    expect((await projects.get("member-a", "project-a")).progress).toBe(37);
  });

  it("keeps goal totals authoritative beyond the ten-item preview and denies foreign relations", async () => {
    const { projects, goals, tasks } = services();
    await projects.create("member-a", { id: "project-a", clientKey: "p-a", title: "A" });
    await projects.create("member-b", { id: "project-b", clientKey: "p-b", title: "B" });
    for (let index = 0; index < 12; index += 1) {
      const id = `goal-${index}`;
      await goals.create("member-a", { id, clientKey: id, title: id });
      await projects.linkGoal("member-a", "project-a", id, (await projects.get("member-a", "project-a")).updatedAt);
    }
    const summary = await projects.summary("member-a", "project-a");
    expect(summary.goalCount).toBe(12); expect(summary.goals).toHaveLength(10);
    expect(new Set(summary.goals.map((goal) => goal.id)).size).toBe(10);
    expect((await projects.linkGoal("member-a", "project-a", "goal-0", (await projects.get("member-a", "project-a")).updatedAt)).linked).toBe(false);
    await goals.create("member-b", { id: "foreign-goal", clientKey: "foreign", title: "Secret" });
    await tasks.create("member-b", { id: "foreign-task", title: "Secret" });
    await expect(projects.linkGoal("member-a", "project-a", "foreign-goal", (await projects.get("member-a", "project-a")).updatedAt)).rejects.toMatchObject({ status: 404 });
    await expect(projects.linkTask("member-a", "project-a", "foreign-task", (await projects.get("member-a", "project-a")).updatedAt)).rejects.toMatchObject({ status: 404 });
    await expect(projects.summary("member-b", "project-a")).rejects.toMatchObject({ status: 404 });
    expect(await projects.summary("member-b", "project-b")).toEqual({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
    await projects.unlinkGoal("member-a", "project-a", "goal-0", (await projects.get("member-a", "project-a")).updatedAt);
    expect((await projects.summary("member-a", "project-a")).goalCount).toBe(11);
  });

  it("keeps timeline items separate from task counts and binds timeline cursors to the owned project", async () => {
    const { projects, timeline } = services();
    await projects.create("member-a", { id: "project-a", clientKey: "p-a", title: "A" });
    await projects.create("member-a", { id: "project-a2", clientKey: "p-a2", title: "A2" });
    for (let index = 0; index < 3; index += 1) {
      await timeline.create("member-a", "project-a", { id: `item-${index}`, clientKey: `item-${index}`, kind: "action_item", title: `Action ${index}` });
    }
    expect((await timeline.create("member-a", "project-a", { id: "replayed", clientKey: "item-0", kind: "action_item", title: "Action 0" })).created).toBe(false);
    await timeline.setStatus("member-a", "project-a", "item-0", "done", (await timeline.get("member-a", "project-a", "item-0")).updatedAt);
    const first = await timeline.list("member-a", "project-a", { limit: 2 });
    expect(first.items).toHaveLength(2); expect(first.nextCursor).toBeTruthy();
    const second = await timeline.list("member-a", "project-a", { limit: 2, cursor: first.nextCursor });
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeUndefined();
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(3);
    await expect(timeline.list("member-a", "project-a2", { limit: 2, cursor: first.nextCursor })).rejects.toThrow();
    await expect(timeline.list("member-b", "project-a")).rejects.toMatchObject({ status: 404 });
    expect(await projects.summary("member-a", "project-a")).toEqual({ goalCount: 0, taskCount: 0, completedTaskCount: 0, goals: [] });
  });

  it("seeds the Projects workbench menu with task permission semantics", async () => {
    const menu = await env.DB.prepare("SELECT path, label_key, required_bits, status, visible FROM menus WHERE path = '/projects'").first<{ path: string; label_key: string; required_bits: string; status: string; visible: number }>();
    expect(menu).toEqual({ path: "/projects", label_key: "NAV_PROJECTS", required_bits: "0x100000", status: "active", visible: 1 });
  });
});

function services() {
  const projectsRepository = new ProjectsRepository(env.DB);
  const goalsRepository = new GoalsRepository(env.DB);
  const tasksRepository = new TasksRepository(env.DB);
  return {
    projects: new ProjectsService(projectsRepository, { goals: goalsRepository, tasks: tasksRepository }),
    goals: new GoalsService(goalsRepository), tasks: new TasksService(tasksRepository),
    timeline: new ProjectTimelineService(new ProjectTimelineRepository(env.DB), projectsRepository),
  };
}

describe("workbench-projects query/idempotency convergence", () => {
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

  it("workbench-projects:query_or_idempotency:create-project — 重复创建及断线重试只有一个项目，键冲突可见且其他成员无法读取该项目。", async () => {
    const projects = new ProjectsService(new ProjectsRepository(env.DB));

    const [first, second] = await Promise.all([
      projects.create("member-a", { id: "project-1", clientKey: "p-key", title: "Original" }),
      projects.create("member-a", { id: "project-2", clientKey: "p-key", title: "Original" }),
    ]);
    expect(first.project.id).toBe(second.project.id);
    expect([first.created, second.created].filter(Boolean)).toHaveLength(1);

    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM projects WHERE member_id = ?").bind("member-a").first<{ total: number }>();
    expect(count?.total).toBe(1);
    const stored = await env.DB.prepare("SELECT id, title FROM projects WHERE member_id = ? AND client_key = ?").bind("member-a", "p-key").first<{ id: string; title: string }>();
    expect(stored).toMatchObject({ id: first.project.id, title: "Original" });

    // Lost-response retry with the same key resolves to the original receipt, not a second row.
    const lostRetry = await projects.create("member-a", { id: "project-3", clientKey: "p-key", title: "Original" });
    expect(lostRetry.created).toBe(false);
    expect(lostRetry.project.id).toBe(first.project.id);

    // Reusing the key with a different id and title must neither insert nor modify anything.
    const conflict = await projects.create("member-a", { id: "project-else", clientKey: "p-key", title: "Different" });
    expect(conflict.created).toBe(false);
    expect(conflict.project.id).toBe(first.project.id);
    expect(conflict.project.title).toBe("Original");
    const afterConflict = await env.DB.prepare("SELECT COUNT(*) AS total FROM projects WHERE member_id = ?").bind("member-a").first<{ total: number }>();
    expect(afterConflict?.total).toBe(1);
    const storedAfter = await env.DB.prepare("SELECT id, title FROM projects WHERE member_id = ? AND client_key = ?").bind("member-a", "p-key").first<{ id: string; title: string }>();
    expect(storedAfter).toMatchObject({ id: first.project.id, title: "Original" });

    // The key is scoped to the member: another member gets an independent project.
    const other = await projects.create("member-b", { id: "project-b", clientKey: "p-key", title: "Member B" });
    expect(other.created).toBe(true);
    expect(other.project.id).toBe("project-b");

    // Member B cannot read member A's project.
    await expect(projects.get("member-b", first.project.id)).rejects.toMatchObject({ status: 404, code: "PROJECT_NOT_FOUND" });
    expect((await projects.get("member-a", first.project.id)).title).toBe("Original");
  });

  it("workbench-projects:query_or_idempotency:transition-project-status — 并发归档与激活出现明确冲突，刷新取得权威状态且重复请求不覆盖更新结果。", async () => {
    const projects = new ProjectsService(new ProjectsRepository(env.DB));
    await projects.create("member-a", { id: "project-a", clientKey: "p-a", title: "A" });
    const v0 = (await projects.get("member-a", "project-a")).updatedAt;

    const results = await Promise.allSettled([
      projects.setStatus("member-a", "project-a", "archived", v0),
      projects.setStatus("member-a", "project-a", "active", v0),
    ]);
    const fulfilled = results.filter((result): result is PromiseFulfilledResult<Project> => result.status === "fulfilled");
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ status: 409, code: "PROJECT_VERSION_CONFLICT" });

    // A fresh read returns the winner's status as the authoritative state.
    const winner = fulfilled[0]!.value;
    const authoritative = await projects.get("member-a", "project-a");
    expect(authoritative.status).toBe(winner.status);
    expect(authoritative.updatedAt).toBe(winner.updatedAt);

    // Retrying the loser with the ORIGINAL version still conflicts and must not overwrite.
    const loserStatus = winner.status === "archived" ? "active" : "archived";
    await expect(projects.setStatus("member-a", "project-a", loserStatus, v0)).rejects.toMatchObject({ status: 409, code: "PROJECT_VERSION_CONFLICT" });
    expect((await projects.get("member-a", "project-a")).status).toBe(winner.status);

    // Retrying the same target status from the winner's version converges without double-applying.
    const converged = await projects.setStatus("member-a", "project-a", winner.status, authoritative.updatedAt);
    expect(converged.status).toBe(winner.status);
    expect((await projects.get("member-a", "project-a")).status).toBe(winner.status);
  });
});
