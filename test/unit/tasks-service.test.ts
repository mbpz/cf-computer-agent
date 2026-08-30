import { describe, expect, it } from "vitest";
import type { CreateAuditEvent } from "../../src/audit/types";
import { TasksService } from "../../src/tasks/service";
import type { TasksRepositoryPort } from "../../src/tasks/repository";
import type { Task, TaskCreate, TaskLink, TaskLinkInsert, TaskListRequest, TaskPage, TaskSummary, TaskUpdate } from "../../src/tasks/types";
import type { PageRequest } from "../../src/pagination";
import type { NotificationEventInput } from "../../src/notifications/types";

const NOW = new Date("2026-08-26T00:00:00.000Z");

describe("TasksService", () => {
  it("returns member-scoped numbered totals for task filters", async () => {
    const repository = new FakeTasksRepository();
    const service = createService(repository);
    await service.create("member-a", { id: "task-a-1", title: "A1" });
    await service.create("member-a", { id: "task-a-2", title: "A2" });
    await service.create("member-b", { id: "task-b-1", title: "B1" });
    await service.setStatus("member-a", "task-a-1", "doing");
    await service.setStatus("member-a", "task-a-2", "doing");
    await service.setStatus("member-b", "task-b-1", "doing");
    const page = await service.list("member-a", { status: "doing" }, { page: 1, pageSize: 20 });
    expect(page.pagination.total).toBe(2);
    expect(page.items.every((task) => task.memberId === "member-a")).toBe(true);
  });

  it.each([{ page: 1.5, pageSize: 20 }, { page: 1, pageSize: 10 }, { page: 501, pageSize: 20 }])(
    "rejects invalid numbered pagination before repository access",
    async (pagination) => {
      await expect(createService(new FakeTasksRepository()).list("member-a", {}, pagination as never))
        .rejects.toMatchObject({ code: "TASK_PAGE_INVALID", status: 400 });
    },
  );
  it("creates with a client id, replays the same id idempotently, and audits once", async () => {
    const repository = new FakeTasksRepository();
    const audit = new FakeAudit();
    const service = createService(repository, audit);
    const first = await service.create("member-a", { id: "task-1", title: "  Alpha  ", notes: "note", priority: "high", dueAt: "2026-08-30T00:00:00.000Z" });
    expect(first.created).toBe(true);
    expect(first.task.title).toBe("Alpha");
    const replay = await service.create("member-a", { id: "task-1", title: "Alpha", priority: "medium" });
    expect(replay.created).toBe(false);
    expect((await service.list("member-a")).items).toHaveLength(1);
    // Task 3 不接审计(Task 4 接入):断言至多一次,Task 4 后保持通过。
    expect(audit.events.filter((event) => event.action === "task.created").length).toBeLessThan(2);
  });

  it("validates fields and enforces the member task limit", async () => {
    const repository = new FakeTasksRepository();
    repository.count = 500;
    const service = createService(repository);
    await expect(service.create("member-a", { title: "x".repeat(201) })).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
    await expect(service.create("member-a", { title: "ok", priority: "urgent" })).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
    await expect(service.create("member-a", { title: "ok", dueAt: "not-a-date" })).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
    await expect(service.create("member-a", { id: "task-limit", title: "ok" })).rejects.toMatchObject({ code: "TASK_LIMIT_REACHED", status: 409 });
  });

  it("enforces the status machine, terminal behavior, and idempotent re-sends", async () => {
    const repository = new FakeTasksRepository();
    const service = createService(repository);
    const created = (await service.create("member-a", { id: "task-1", title: "Alpha" })).task;
    await expect(service.setStatus("member-a", "task-1", "blocked")).rejects.toMatchObject({ code: "TASK_TRANSITION_INVALID", status: 422 });
    await expect(service.setStatus("member-a", "task-1", "doing")).resolves.toMatchObject({ status: "doing" });
    await expect(service.setStatus("member-a", "task-1", "doing")).resolves.toMatchObject({ status: "doing" }); // 幂等重发
    const done = await service.setStatus("member-a", "task-1", "done");
    expect(done.progress).toBe(100);
    expect(done.completedAt).toBe(NOW.toISOString());
    await expect(service.setProgress("member-a", "task-1", 40)).rejects.toMatchObject({ code: "TASK_PROGRESS_INVALID", status: 400 });
    await expect(service.setStatus("member-a", "task-1", "doing")).rejects.toMatchObject({ code: "TASK_TRANSITION_INVALID", status: 422 });
    const reopened = await service.setStatus("member-a", "task-1", "todo");
    expect(reopened.completedAt).toBeNull();
    expect(reopened.progress).toBe(100); // 重开不回退进度
    void created;
  });

  it("emits one recipient-owned notification only after a real status transition", async () => {
    const repository = new FakeTasksRepository();
    const notifications = new FakeNotificationSink();
    const service = createService(repository, undefined, notifications);
    await service.create("member-a", { id: "task-1", title: "Alpha" });

    await service.setStatus("member-a", "task-1", "doing");
    await service.setStatus("member-a", "task-1", "doing");

    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]).toMatchObject({
      recipientMemberId: "member-a",
      eventType: "task.status_changed",
      actorMemberId: "member-a",
      targetKind: "task",
      targetId: "task-1",
      payload: { previousStatus: "todo", status: "doing" },
    });
    expect(notifications.events[0]?.deduplicationKey).toMatch(/^task:task-1:status:todo:doing:generated-\d+$/u);
  });

  it("validates progress bounds, non-terminal states, and idempotent updates", async () => {
    const service = createService(new FakeTasksRepository());
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    await expect(service.setProgress("member-a", "task-1", 101)).rejects.toMatchObject({ code: "TASK_PROGRESS_INVALID", status: 400 });
    await expect(service.setProgress("member-a", "task-1", 2.5)).rejects.toMatchObject({ code: "TASK_PROGRESS_INVALID", status: 400 });
    await expect(service.setProgress("member-a", "task-1", 40)).resolves.toMatchObject({ progress: 40 });
    await expect(service.setProgress("member-a", "task-1", 40)).resolves.toMatchObject({ progress: 40 });
  });

  it("replaces tags with dedupe and limits, keeps owner isolation on every path", async () => {
    const repository = new FakeTasksRepository();
    const service = createService(repository);
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    await expect(service.replaceTags("member-a", "task-1", ["urgent", "urgent", "reading"])).resolves.toEqual(["reading", "urgent"]);
    const tooMany = Array.from({ length: 11 }, (_, index) => `tag-${index}`);
    await expect(service.replaceTags("member-a", "task-1", tooMany)).rejects.toMatchObject({ code: "TASK_TAG_LIMIT", status: 409 });
    await expect(service.replaceTags("member-a", "task-1", ["x".repeat(33)])).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
    await expect(service.get("member-b", "task-1")).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
    await expect(service.update("member-b", "task-1", { title: "hacked" })).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
    await expect(service.setStatus("member-b", "task-1", "doing")).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
    await expect(service.delete("member-b", "task-1")).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
  });

  it("links only visible knowledge, idempotently, and under the link limit", async () => {
    const repository = new FakeTasksRepository();
    repository.visibleKnowledge.add("knowledge-a");
    const service = createService(repository);
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    const link = await service.addLink("member-a", "task-1", "knowledge-a");
    expect(link.knowledgeItemId).toBe("knowledge-a");
    await expect(service.addLink("member-a", "task-1", "knowledge-a")).resolves.toMatchObject({ id: link.id }); // 幂等回读
    await expect(service.addLink("member-a", "task-1", "knowledge-b")).rejects.toMatchObject({ code: "TASK_KNOWLEDGE_NOT_FOUND", status: 404 });
    repository.visibleKnowledge.add("knowledge-c");
    repository.linkCount = 5;
    await expect(service.addLink("member-a", "task-1", "knowledge-c")).rejects.toMatchObject({ code: "TASK_LINK_LIMIT", status: 409 });
  });

  it("writes audit events for every mutation and skips idempotent replays", async () => {
    const repository = new FakeTasksRepository();
    repository.visibleKnowledge.add("knowledge-a");
    const audit = new FakeAudit();
    const service = createService(repository, audit);
    await service.create("member-a", { id: "task-1", title: "Alpha", knowledgeItemId: "knowledge-a" });
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    await service.setProgress("member-a", "task-1", 40);
    await service.setProgress("member-a", "task-1", 40);
    await service.setStatus("member-a", "task-1", "doing");
    await service.setStatus("member-a", "task-1", "doing");
    await service.replaceTags("member-a", "task-1", ["urgent"]);
    await service.replaceTags("member-a", "task-1", ["urgent"]);
    await service.update("member-a", "task-1", { title: "Alpha v2", priority: "high" });
    await service.addLink("member-a", "task-1", "knowledge-a");
    const done = await service.setStatus("member-a", "task-1", "done");
    await service.delete("member-a", "task-1");
    expect(audit.events.map((event) => event.action)).toEqual([
      "task.created", "task.linked", "task.progress_changed", "task.status_changed", "task.tags_replaced",
      "task.updated", "task.status_changed", "task.deleted",
    ]);
    expect(audit.events[0]?.metadata).toEqual({ status: "todo", priority: "medium" });
    expect(audit.events.at(-1)?.metadata).toEqual({ status: done.status });
    expect(audit.events.find((event) => event.action === "task.status_changed" && event.metadata.previousStatus === "doing")?.metadata)
      .toEqual({ previousStatus: "doing", status: "done" });
  });

  it("audits unlinks with the knowledge item id", async () => {
    const repository = new FakeTasksRepository();
    const audit = new FakeAudit();
    const service = createService(repository, audit);
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    const link = await service.addLink("member-a", "task-1", "knowledge-a");
    await service.removeLink("member-a", "task-1", link.id);
    expect(audit.events.map((event) => event.action)).toEqual(["task.created", "task.linked", "task.unlinked"]);
    expect(audit.events[2]?.metadata).toEqual({ knowledgeItemId: "knowledge-a" });
  });
});

function createService(repository: FakeTasksRepository, audit?: FakeAudit, notifications?: FakeNotificationSink): TasksService {
  let next = 0;
  return new TasksService(repository, {
    id: () => `generated-${++next}`,
    now: () => NOW,
    ...(audit ? { audit } : {}),
    ...(notifications ? { notifications } : {}),
  });
}

class FakeNotificationSink {
  readonly events: NotificationEventInput[] = [];
  async emit(event: NotificationEventInput): Promise<void> { this.events.push(event); }
}

class FakeAudit {
  readonly events: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  async writeAudit(input: CreateAuditEvent) {
    this.events.push({ action: input.action, metadata: input.metadata as unknown as Record<string, unknown> });
    return input;
  }
}

class FakeTasksRepository implements TasksRepositoryPort {
  tasks = new Map<string, Task>();
  tags = new Map<string, string[]>();
  links = new Map<string, TaskLink>();
  visibleKnowledge = new Set<string>(["knowledge-a"]);
  count = 0;
  linkCount = 0;

  async insert(input: TaskCreate): Promise<boolean> {
    if (this.tasks.has(input.id)) return false;
    this.tasks.set(input.id, {
      id: input.id, memberId: input.memberId, title: input.title, notes: input.notes, status: "todo", progress: 0,
      priority: input.priority, dueAt: input.dueAt === null ? null : new Date(input.dueAt).toISOString(),
      completedAt: null, createdAt: new Date(input.createdAt).toISOString(), updatedAt: new Date(input.updatedAt).toISOString(),
    });
    return true;
  }
  async findOwned(memberId: string, id: string) {
    const task = this.tasks.get(id);
    return task && task.memberId === memberId ? task : null;
  }
  async list(memberId: string, request: TaskListRequest): Promise<TaskPage> {
    const items = [...this.tasks.values()].filter((task) => task.memberId === memberId
      && (!request.filters.status || task.status === request.filters.status)
      && (!request.filters.priority || task.priority === request.filters.priority)
      && (!request.filters.q || task.title.toLowerCase().includes(request.filters.q.toLowerCase())));
    return { items: items.slice((request.page - 1) * request.pageSize, request.page * request.pageSize), pagination: { page: request.page, pageSize: request.pageSize, total: items.length, totalPages: items.length ? Math.ceil(items.length / request.pageSize) : 0 } };
  }
  async update(memberId: string, id: string, input: TaskUpdate) {
    const task = await this.findOwned(memberId, id);
    if (!task) return null;
    Object.assign(task, { title: input.title, notes: input.notes, priority: input.priority, updatedAt: new Date(input.updatedAt).toISOString() });
    return task;
  }
  async updateStatus(memberId: string, id: string, status: Task["status"], completedAt: number | null, progress: number, updatedAt: number) {
    const task = await this.findOwned(memberId, id);
    if (!task) return null;
    Object.assign(task, { status, progress, completedAt: completedAt === null ? null : new Date(completedAt).toISOString(), updatedAt: new Date(updatedAt).toISOString() });
    return task;
  }
  async updateProgress(memberId: string, id: string, progress: number, updatedAt: number) {
    const task = await this.findOwned(memberId, id);
    if (!task) return null;
    Object.assign(task, { progress, updatedAt: new Date(updatedAt).toISOString() });
    return task;
  }
  async delete(memberId: string, id: string) {
    return (await this.findOwned(memberId, id)) !== null && this.tasks.delete(id);
  }
  async countByMember(memberId: string) { return this.count || [...this.tasks.values()].filter((task) => task.memberId === memberId).length; }
  async summary(): Promise<TaskSummary> { return { todo: 0, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 0, overdue: 0 }; }
  async listTags(memberId: string, taskId: string) { return this.tags.get(taskId) ?? []; }
  async replaceTags(memberId: string, taskId: string, tags: readonly string[]) { this.tags.set(taskId, [...tags]); }
  async listLinks(memberId: string, taskId: string) { return [...this.links.values()].filter((link) => link.taskId === taskId); }
  async insertLink(link: TaskLinkInsert) {
    if (this.links.has(link.id)) return false;
    this.links.set(link.id, { id: link.id, taskId: link.taskId, knowledgeItemId: link.knowledgeItemId, knowledgeTitle: "Title", createdAt: new Date(link.createdAt).toISOString() });
    return true;
  }
  async findLink(memberId: string, taskId: string, knowledgeItemId: string) {
    return [...this.links.values()].find((link) => link.taskId === taskId && link.knowledgeItemId === knowledgeItemId) ?? null;
  }
  async deleteLink(memberId: string, taskId: string, linkId: string) { return this.links.delete(linkId); }
  async countLinks(memberId: string, taskId: string) { return this.linkCount || [...this.links.values()].filter((link) => link.taskId === taskId).length; }
  async isKnowledgeVisible(memberId: string, knowledgeItemId: string) { return this.visibleKnowledge.has(knowledgeItemId); }
}
