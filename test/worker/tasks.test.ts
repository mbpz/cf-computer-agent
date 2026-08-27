/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TasksRepository } from "../../src/tasks/repository";
import type { TaskCreate, TaskLinkInsert } from "../../src/tasks/types";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = 1_777_777_000_000; // 2026-05-02T00:30:00.000Z (固定值,due 过滤断言用)
const DAY = 86_400_000;

describe("tasks repository", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'contributor', 'active', ?, ?), (?, ?, ?, 'contributor', 'active', ?, ?)",
    ).bind(
      "member-a", "subject-a", "a@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
      "member-b", "subject-b", "b@example.test", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z",
    ).run();
    // The due filter derives day boundaries from the wall clock; pin it to NOW
    // so the "today"/"overdue" assertions are deterministic.
    vi.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("inserts once, treats duplicate ids as ignored, and keeps owners isolated", async () => {
    const repository = new TasksRepository(env.DB);
    const input = taskCreate({ id: "task-a", memberId: "member-a" });
    expect(await repository.insert(input)).toBe(true);
    expect(await repository.insert(taskCreate({ id: "task-a", memberId: "member-a", title: "replay" }))).toBe(false);
    expect((await repository.findOwned("member-a", "task-a"))?.title).toBe("Test task");
    expect(await repository.findOwned("member-b", "task-a")).toBeNull();
    expect(await repository.countByMember("member-a")).toBe(1);
  });

  it("lists with status/tag/due/q filters and a stable cursor", async () => {
    const repository = new TasksRepository(env.DB);
    await seedTasks(repository);
    const all = await repository.list("member-a", { limit: 10, filters: {} });
    expect(all.items).toHaveLength(4);
    expect(all.nextCursor).toBeUndefined();
    const doing = await repository.list("member-a", { limit: 10, filters: { status: "doing" } });
    expect(doing.items.map((task) => task.id)).toEqual(["task-2"]);
    const tagged = await repository.list("member-a", { limit: 10, filters: { tag: "urgent" } });
    expect(tagged.items.map((task) => task.id)).toEqual(["task-1"]);
    const overdue = await repository.list("member-a", { limit: 10, filters: { due: "overdue" } });
    expect(overdue.items.map((task) => task.id)).toEqual(["task-3"]);
    const today = await repository.list("member-a", { limit: 10, filters: { due: "today" } });
    expect(today.items.map((task) => task.id)).toEqual(["task-2"]);
    const noDue = await repository.list("member-a", { limit: 10, filters: { due: "none" } });
    expect(noDue.items.map((task) => task.id)).toEqual(["task-4"]);
    const searched = await repository.list("member-a", { limit: 10, filters: { q: "alpha" } });
    expect(searched.items.map((task) => task.id)).toEqual(["task-1"]);
    const paged = await repository.list("member-a", { limit: 2, filters: {} });
    expect(paged.items.map((task) => task.id)).toEqual(["task-4", "task-3"]);
    const next = await repository.list("member-a", { limit: 2, filters: {}, cursor: paged.nextCursor });
    expect(next.items.map((task) => task.id)).toEqual(["task-2", "task-1"]);
  });

  it("summarizes status counts, due-today and overdue for open tasks only", async () => {
    const repository = new TasksRepository(env.DB);
    await seedTasks(repository);
    const summary = await repository.summary("member-a", new Date(NOW));
    expect(summary).toEqual({ todo: 2, doing: 1, blocked: 0, done: 1, canceled: 0, dueToday: 1, overdue: 1 });
  });

  it("replaces tags, keeps them member-scoped, and cascades on delete", async () => {
    const repository = new TasksRepository(env.DB);
    await repository.insert(taskCreate({ id: "task-1", memberId: "member-a" }));
    await repository.replaceTags("member-a", "task-1", ["urgent", "reading"]);
    await repository.replaceTags("member-a", "task-1", ["urgent"]);
    expect(await repository.listTags("member-a", "task-1")).toEqual(["urgent"]);
    expect(await repository.listTags("member-b", "task-1")).toEqual([]);
    expect(await repository.delete("member-a", "task-1")).toBe(true);
    expect(await repository.countByMember("member-a")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM task_tags").first<{ n: number }>()).toMatchObject({ n: 0 });
  });

  it("inserts links idempotently and resolves knowledge visibility", async () => {
    await seedKnowledge("member-a");
    const repository = new TasksRepository(env.DB);
    await repository.insert(taskCreate({ id: "task-1", memberId: "member-a" }));
    const link = linkInsert({ id: "link-1", taskId: "task-1", memberId: "member-a", knowledgeItemId: "knowledge-a" });
    expect(await repository.insertLink(link)).toBe(true);
    expect(await repository.insertLink(linkInsert({ id: "link-2", taskId: "task-1", memberId: "member-a", knowledgeItemId: "knowledge-a" }))).toBe(false);
    expect(await repository.countLinks("member-a", "task-1")).toBe(1);
    expect(await repository.findLink("member-a", "task-1", "knowledge-a")).toMatchObject({ id: "link-1", knowledgeTitle: "Alpha Guide" });
    expect(await repository.listLinks("member-a", "task-1")).toHaveLength(1);
    expect(await repository.isKnowledgeVisible("member-a", "knowledge-a")).toBe(true);
    expect(await repository.isKnowledgeVisible("member-b", "knowledge-a")).toBe(true); // shared 对所有成员可见
    expect(await repository.isKnowledgeVisible("member-a", "knowledge-missing")).toBe(false);
    expect(await repository.deleteLink("member-a", "task-1", "link-1")).toBe(true);
    expect(await repository.deleteLink("member-a", "task-1", "link-1")).toBe(false);
  });
});

function taskCreate(overrides: Partial<TaskCreate> = {}): TaskCreate {
  return {
    id: "task-default", memberId: "member-a", title: "Test task", notes: "", priority: "medium",
    dueAt: null, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function linkInsert(overrides: Partial<TaskLinkInsert> = {}): TaskLinkInsert {
  return { id: "link-default", taskId: "task-1", memberId: "member-a", knowledgeItemId: "knowledge-a", createdAt: NOW, ...overrides };
}

async function seedTasks(repository: TasksRepository): Promise<void> {
  await repository.insert(taskCreate({ id: "task-1", memberId: "member-a", title: "Alpha review", createdAt: NOW - 4 * 1000, updatedAt: NOW - 4 * 1000 }));
  await repository.insert(taskCreate({ id: "task-2", memberId: "member-a", title: "Beta draft", createdAt: NOW - 3 * 1000, updatedAt: NOW - 3 * 1000 }));
  await repository.insert(taskCreate({ id: "task-3", memberId: "member-a", title: "Gamma", createdAt: NOW - 2 * 1000, updatedAt: NOW - 2 * 1000 }));
  await repository.insert(taskCreate({ id: "task-4", memberId: "member-a", title: "Delta", createdAt: NOW - 1 * 1000, updatedAt: NOW - 1 * 1000 }));
  await env.DB.prepare("UPDATE tasks SET status = 'doing', due_at = ? WHERE id = 'task-2'").bind(NOW).run();
  await env.DB.prepare("UPDATE tasks SET status = 'done', progress = 100, completed_at = ? WHERE id = 'task-4'").bind(NOW).run(); // done,无 due date(due:"none" 用例)
  await env.DB.prepare("UPDATE tasks SET due_at = ? WHERE id = 'task-1'").bind(NOW + 5 * DAY).run();
  await env.DB.prepare("UPDATE tasks SET due_at = ? WHERE id = 'task-3'").bind(NOW - DAY).run();
  await env.DB.prepare("INSERT INTO task_tags (task_id, member_id, tag) VALUES ('task-1', 'member-a', 'urgent')").run();
}

async function seedKnowledge(ownerId: string): Promise<void> {
  const hash = "c".repeat(64);
  const now = "2026-01-01T00:00:00.000Z";
  await env.DB.prepare("INSERT INTO submissions (id, submitter_id, requested_space_id, kind, status, title, content, created_at, updated_at) VALUES ('task-submission', ?, 'default', 'markdown', 'published', 'Alpha Guide', '# Alpha', ?, ?)").bind(ownerId, now, now).run();
  await env.DB.prepare("INSERT INTO sources (id, owner_id, space_id, kind, title, created_at, updated_at) VALUES ('task-source', ?, 'default', 'markdown', 'Alpha Guide', ?, ?)").bind(ownerId, now, now).run();
  await env.DB.prepare("INSERT INTO source_versions (id, source_id, submission_id, ordinal, content, content_sha256, parser_version, created_at) VALUES ('task-source-version', 'task-source', 'task-submission', 1, '# Alpha', ?, 'm1-v1', ?)").bind(hash, now).run();
  await env.DB.prepare("INSERT INTO knowledge_items (id, space_id, current_revision_id, status, search_status, created_at, updated_at) VALUES ('knowledge-a', 'default', NULL, 'active', 'indexed', ?, ?)").bind(now, now).run();
  await env.DB.prepare("INSERT INTO revisions (id, knowledge_item_id, source_version_id, normalized_path, content_sha256, title, tags_json, visibility, published_by, published_at) VALUES ('task-revision', 'knowledge-a', 'task-source-version', '/workspace/published/default/knowledge-a/revision.md', ?, 'Alpha Guide', '[]', 'shared', ?, ?)").bind(hash, ownerId, now).run();
  await env.DB.prepare("UPDATE knowledge_items SET current_revision_id = 'task-revision' WHERE id = 'knowledge-a'").run();
}
