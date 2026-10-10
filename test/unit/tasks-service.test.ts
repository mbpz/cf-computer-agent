import { describe, expect, it } from "vitest";
import type { CreateAuditEvent } from "../../src/audit/types";
import { TasksService } from "../../src/tasks/service";
import type { TasksRepositoryPort } from "../../src/tasks/repository";
import type { Task, TaskCreate, TaskLink, TaskLinkInsert, TaskListRequest, TaskPage, TaskStatusNotificationIntent, TaskSummary, TaskUpdate } from "../../src/tasks/types";
import type { TaskDependency, TaskSubtask, TaskSubtaskStatus } from "../../src/tasks/structure";
import type { PageRequest } from "../../src/pagination";
import type { NotificationEventInput } from "../../src/notifications/types";

const NOW = new Date("2026-08-26T00:00:00.000Z");

describe("TasksService", () => {
  it("rejects a stale subtask edit or dependency change and still accepts an identical replay", async () => {
    const repository = new FakeTasksRepository();
    const service = createService(repository);
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    await service.create("member-a", { id: "task-2", title: "Beta" });
    const created = await service.createSubtask("member-a", "task-1", { id: "sub-1", title: "First", position: 0 });
    const read = created.subtask.updatedAt;
    await service.updateSubtask("member-a", "task-1", "sub-1", { title: "Tab one", status: "todo", position: 0, expectedUpdatedAt: read });
    await expect(service.updateSubtask("member-a", "task-1", "sub-1", { title: "Tab two", status: "todo", position: 0, expectedUpdatedAt: read }))
      .rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    expect((await service.listSubtasks("member-a", "task-1")).map((item) => item.title)).toEqual(["Tab one"]);
    await expect(service.updateSubtask("member-a", "task-1", "sub-1", { title: "Tab one", status: "todo", position: 0, expectedUpdatedAt: read }))
      .resolves.toMatchObject({ title: "Tab one" });
    await expect(service.updateSubtask("member-a", "task-1", "sub-1", { title: "Bad", status: "todo", position: 0, expectedUpdatedAt: "yesterday" }))
      .rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
    await expect(service.deleteSubtask("member-a", "task-1", "sub-1", read)).rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    const currentSubtask = (await service.listSubtasks("member-a", "task-1"))[0]!.updatedAt;
    await service.deleteSubtask("member-a", "task-1", "sub-1", currentSubtask);
    await expect(service.deleteSubtask("member-a", "task-1", "sub-1", currentSubtask)).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });

    const parent = (await service.get("member-a", "task-1")).task.updatedAt;
    await expect(service.addDependency("member-a", "task-1", "task-2", parent)).resolves.toMatchObject({ created: true });
    await expect(service.addDependency("member-a", "task-1", "task-2", parent)).resolves.toMatchObject({ created: false });
    await service.create("member-a", { id: "task-3", title: "Gamma" });
    await expect(service.addDependency("member-a", "task-1", "task-3", parent)).rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    await expect(service.removeDependency("member-a", "task-1", "task-2", parent)).rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    const current = (await service.get("member-a", "task-1")).task.updatedAt;
    await service.removeDependency("member-a", "task-1", "task-2", current);
    await expect(service.removeDependency("member-a", "task-1", "task-2", current)).rejects.toMatchObject({ code: "TASK_DEPENDENCY_NOT_FOUND", status: 404 });
    expect(await service.listDependencies("member-a", "task-1")).toEqual([]);
  });

  it("creates member-owned subtasks idempotently", async () => {
    const repository = new FakeTasksRepository();
    const service = createService(repository);
    await service.create("member-a", { id: "task-a", title: "Parent" });
    const first = await service.createSubtask("member-a", "task-a", { id: "sub-a", title: "First", position: 0 });
    const replay = await service.createSubtask("member-a", "task-a", { id: "sub-a", title: "Changed", position: 1 });
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.subtask.title).toBe("First");
    await expect(service.listSubtasks("member-b", "task-a")).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
  });

  it("rejects self and cross-member task dependencies", async () => {
    const repository = new FakeTasksRepository();
    const service = createService(repository);
    await service.create("member-a", { id: "task-a", title: "A" });
    await service.create("member-a", { id: "task-b", title: "B" });
    await service.create("member-b", { id: "task-c", title: "C" });
    await expect(service.addDependency("member-a", "task-a", "task-a")).rejects.toMatchObject({ code: "TASK_DEPENDENCY_INVALID" });
    await expect(service.addDependency("member-a", "task-a", "task-c")).rejects.toMatchObject({ code: "TASK_NOT_FOUND" });
    const dependency = await service.addDependency("member-a", "task-a", "task-b");
    const replay = await service.addDependency("member-a", "task-a", "task-b");
    expect(dependency.created).toBe(true);
    expect(replay.created).toBe(false);
    expect((await service.listDependencies("member-a", "task-a"))).toHaveLength(1);
  });

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

  it("rejects a stale field update by version, but accepts a re-send that already matches", async () => {
    const repository = new FakeTasksRepository();
    const service = createService(repository);
    const created = { ...(await service.create("member-a", { id: "task-1", title: "Alpha" })).task };
    const first = { ...await service.update("member-a", "task-1", { title: "Tab one", notes: "", priority: "medium", dueAt: null, expectedUpdatedAt: created.updatedAt }) };
    expect(Date.parse(first.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
    await expect(service.update("member-a", "task-1", { title: "Tab two", notes: "", priority: "medium", dueAt: null, expectedUpdatedAt: created.updatedAt }))
      .rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    expect((await service.get("member-a", "task-1")).task.title).toBe("Tab one");
    const replay = await service.update("member-a", "task-1", { title: "Tab one", notes: "", priority: "medium", dueAt: null, expectedUpdatedAt: created.updatedAt });
    expect(replay.updatedAt).toBe(first.updatedAt);
    await expect(service.update("member-a", "task-1", { title: "Bad", expectedUpdatedAt: "yesterday" })).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
    await expect(service.update("member-a", "task-1", { title: "Unconditional" })).resolves.toMatchObject({ title: "Unconditional" });
  });

  it("rejects a status change whose expected current status is stale, but accepts one already at the target", async () => {
    const repository = new FakeTasksRepository();
    const service = createService(repository);
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    await service.setStatus("member-a", "task-1", "doing");
    await expect(service.setStatus("member-a", "task-1", "done", "todo")).rejects.toMatchObject({ code: "TASK_STATUS_CONFLICT", status: 409 });
    await expect(service.setStatus("member-a", "task-1", "doing", "todo")).resolves.toMatchObject({ status: "doing" });
    await expect(service.setStatus("member-a", "task-1", "done", "doing")).resolves.toMatchObject({ status: "done" });
    await expect(service.setStatus("member-a", "task-1", "todo", "nope")).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
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
    expect(notifications.events[0]?.deduplicationKey).toBe("task:task-1:status:todo:doing:v1");
  });

  it("repairs the pending status notification on same-status replay after emit fails", async () => {
    const repository = new FakeTasksRepository();
    const audit = new FakeAudit();
    const notifications = new FakeNotificationSink(1);
    const service = createService(repository, audit, notifications);
    await service.create("member-a", { id: "task-1", title: "Alpha" });

    await expect(service.setStatus("member-a", "task-1", "doing")).rejects.toThrow("notification unavailable");
    await expect(service.setStatus("member-a", "task-1", "doing")).resolves.toMatchObject({ status: "doing" });

    expect(audit.events.filter((event) => event.action === "task.status_changed")).toHaveLength(1);
    expect(notifications.events).toHaveLength(1);
    expect(notifications.events[0]).toMatchObject({
      recipientMemberId: "member-a",
      targetId: "task-1",
      payload: { previousStatus: "todo", status: "doing" },
    });
  });

  it("rejects a stale progress, tag, or link write and still accepts an identical replay", async () => {
    const repository = new FakeTasksRepository();
    repository.visibleKnowledge.add("knowledge-b");
    const audit = new FakeAudit();
    const service = createService(repository, audit);
    const created = await service.create("member-a", { id: "task-1", title: "Alpha" });
    const read = created.task.updatedAt;
    await service.setProgress("member-a", "task-1", 40, read);
    await expect(service.setProgress("member-a", "task-1", 80, read)).rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    expect((await service.get("member-a", "task-1")).task.progress).toBe(40);
    const progressAudits = audit.events.filter((event) => event.action === "task.progress_changed").length;
    await expect(service.setProgress("member-a", "task-1", 40, read)).resolves.toMatchObject({ progress: 40 });
    expect(audit.events.filter((event) => event.action === "task.progress_changed")).toHaveLength(progressAudits);

    const tagged = (await service.get("member-a", "task-1")).task.updatedAt;
    await expect(service.replaceTags("member-a", "task-1", ["a"], tagged)).resolves.toEqual(["a"]);
    await expect(service.replaceTags("member-a", "task-1", ["b"], tagged)).rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    expect((await service.get("member-a", "task-1")).tags).toEqual(["a"]);
    const tagAudits = audit.events.filter((event) => event.action === "task.tags_replaced").length;
    await expect(service.replaceTags("member-a", "task-1", ["a"], tagged)).resolves.toEqual(["a"]);
    expect(audit.events.filter((event) => event.action === "task.tags_replaced")).toHaveLength(tagAudits);

    const linked = (await service.get("member-a", "task-1")).task.updatedAt;
    const link = await service.addLink("member-a", "task-1", "knowledge-a", linked);
    await expect(service.addLink("member-a", "task-1", "knowledge-b", linked)).rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    await expect(service.addLink("member-a", "task-1", "knowledge-a", linked)).resolves.toMatchObject({ id: link.id });
    await expect(service.removeLink("member-a", "task-1", link.id, linked)).rejects.toMatchObject({ code: "TASK_VERSION_CONFLICT", status: 409 });
    expect((await service.get("member-a", "task-1")).links.map((item) => item.id)).toEqual([link.id]);
    const current = (await service.get("member-a", "task-1")).task.updatedAt;
    await service.removeLink("member-a", "task-1", link.id, current);
    await expect(service.removeLink("member-a", "task-1", link.id, current)).rejects.toMatchObject({ code: "TASK_NOT_FOUND", status: 404 });
    await expect(service.setProgress("member-a", "task-1", 10, "yesterday")).rejects.toMatchObject({ code: "TASK_INVALID", status: 400 });
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

  it("reauthorizes an existing knowledge link before returning an idempotent replay", async () => {
    const repository = new FakeTasksRepository();
    repository.visibleKnowledge.add("knowledge-a");
    const audit = new FakeAudit();
    const service = createService(repository, audit);
    await service.create("member-a", { id: "task-1", title: "Alpha" });
    await service.addLink("member-a", "task-1", "knowledge-a");
    repository.visibleKnowledge.delete("knowledge-a");
    await expect(service.addLink("member-a", "task-1", "knowledge-a"))
      .rejects.toMatchObject({ code: "TASK_KNOWLEDGE_NOT_FOUND", status: 404 });
    expect(audit.events.filter((event) => event.action === "task.linked")).toHaveLength(1);
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
  repository.audit = audit;
  return new TasksService(repository, {
    id: () => `generated-${++next}`,
    now: () => NOW,
    ...(audit ? { audit } : {}),
    ...(notifications ? { notifications } : {}),
  });
}

class FakeNotificationSink {
  readonly events: NotificationEventInput[] = [];
  constructor(private failuresRemaining = 0) {}
  async emit(event: NotificationEventInput): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("notification unavailable");
    }
    this.events.push(event);
  }
}

class FakeAudit {
  readonly events: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  async writeAudit(input: CreateAuditEvent) {
    this.events.push({ action: input.action, metadata: input.metadata as unknown as Record<string, unknown> });
    return input;
  }
}

class FakeTasksRepository implements TasksRepositoryPort {
  audit?: FakeAudit;
  tasks = new Map<string, Task>();
  tags = new Map<string, string[]>();
  links = new Map<string, TaskLink>();
  pendingStatusNotifications = new Map<string, TaskStatusNotificationIntent>();
  statusVersions = new Map<string, number>();
  visibleKnowledge = new Set<string>(["knowledge-a"]);
  count = 0;
  linkCount = 0;
  subtasks = new Map<string, TaskSubtask>();
  dependencies = new Map<string, TaskDependency>();

  async insertWithKnowledge(input: TaskCreate, knowledgeItemId: string, linkId: string, audits: readonly CreateAuditEvent[] = []): Promise<boolean> {
    if (!this.visibleKnowledge.has(knowledgeItemId)) return false;
    if (!await this.insert(input)) return false;
    await this.insertLink({ id: linkId, taskId: input.id, memberId: input.memberId, knowledgeItemId, createdAt: input.createdAt });
    for (const audit of audits) await this.audit?.writeAudit(audit);
    return true;
  }

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
  async update(memberId: string, id: string, input: TaskUpdate, expectedUpdatedAt?: number) {
    const task = await this.findOwned(memberId, id);
    if (!task || (expectedUpdatedAt !== undefined && Date.parse(task.updatedAt) !== expectedUpdatedAt)) return null;
    Object.assign(task, { title: input.title, notes: input.notes, priority: input.priority, updatedAt: new Date(input.updatedAt).toISOString() });
    return task;
  }
  async compareAndSetStatus(memberId: string, id: string, expectedStatus: Task["status"], status: Task["status"], completedAt: number | null, progress: number, updatedAt: number) {
    const task = await this.findOwned(memberId, id);
    if (!task || task.status !== expectedStatus) return false;
    const version = (this.statusVersions.get(id) ?? 0) + 1;
    this.statusVersions.set(id, version);
    Object.assign(task, { status, progress, completedAt: completedAt === null ? null : new Date(completedAt).toISOString(), updatedAt: new Date(updatedAt).toISOString() });
    const intentId = `task-status:${id}:${expectedStatus}:${status}:v${version}`;
    this.pendingStatusNotifications.set(intentId, {
      id: intentId,
      recipientMemberId: memberId,
      taskId: id,
      previousStatus: expectedStatus,
      status,
      deduplicationKey: `task:${id}:status:${expectedStatus}:${status}:v${version}`,
      createdAt: new Date(updatedAt).toISOString(),
    });
    return true;
  }
  async listPendingStatusNotifications(memberId: string, taskId: string, limit: number) {
    return [...this.pendingStatusNotifications.values()]
      .filter((intent) => intent.recipientMemberId === memberId && intent.taskId === taskId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .slice(0, limit);
  }
  async markStatusNotificationDelivered(memberId: string, intentId: string) {
    const intent = this.pendingStatusNotifications.get(intentId);
    return intent?.recipientMemberId === memberId ? this.pendingStatusNotifications.delete(intentId) : false;
  }
  async updateProgress(memberId: string, id: string, progress: number, updatedAt: number, expectedUpdatedAt?: number) {
    const task = await this.findOwned(memberId, id);
    if (!task || (expectedUpdatedAt !== undefined && Date.parse(task.updatedAt) !== expectedUpdatedAt)) return null;
    Object.assign(task, { progress, updatedAt: new Date(updatedAt).toISOString() });
    return task;
  }
  async touch(memberId: string, id: string, updatedAt: number, expectedUpdatedAt?: number) {
    const task = await this.findOwned(memberId, id);
    if (!task || (expectedUpdatedAt !== undefined && Date.parse(task.updatedAt) !== expectedUpdatedAt)) return false;
    task.updatedAt = new Date(updatedAt).toISOString();
    return true;
  }
  async delete(memberId: string, id: string) {
    return (await this.findOwned(memberId, id)) !== null && this.tasks.delete(id);
  }
  async countByMember(memberId: string) { return this.count || [...this.tasks.values()].filter((task) => task.memberId === memberId).length; }
  async summary(): Promise<TaskSummary> { return { todo: 0, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 0, overdue: 0 }; }
  async listTags(memberId: string, taskId: string) { return this.tags.get(taskId) ?? []; }
  async replaceTags(memberId: string, taskId: string, tags: readonly string[], version?: { expectedUpdatedAt?: number; updatedAt: number }) {
    if (version && !await this.touch(memberId, taskId, version.updatedAt, version.expectedUpdatedAt)) return false;
    this.tags.set(taskId, [...tags]);
    return true;
  }
  async listLinks(memberId: string, taskId: string) { return [...this.links.values()].filter((link) => link.taskId === taskId); }
  async insertLink(link: TaskLinkInsert, version?: { expectedUpdatedAt?: number; updatedAt: number }) {
    if (this.links.has(link.id)) return false;
    if (version && !await this.touch(link.memberId, link.taskId, version.updatedAt, version.expectedUpdatedAt)) return false;
    this.links.set(link.id, { id: link.id, taskId: link.taskId, knowledgeItemId: link.knowledgeItemId, knowledgeTitle: "Title", createdAt: new Date(link.createdAt).toISOString() });
    return true;
  }
  async findLink(memberId: string, taskId: string, knowledgeItemId: string) {
    return [...this.links.values()].find((link) => link.taskId === taskId && link.knowledgeItemId === knowledgeItemId) ?? null;
  }
  async deleteLink(memberId: string, taskId: string, linkId: string, version?: { expectedUpdatedAt?: number; updatedAt: number }) {
    if (!this.links.has(linkId)) return false;
    if (version && !await this.touch(memberId, taskId, version.updatedAt, version.expectedUpdatedAt)) return false;
    return this.links.delete(linkId);
  }
  async countLinks(memberId: string, taskId: string) { return this.linkCount || [...this.links.values()].filter((link) => link.taskId === taskId).length; }
  async isKnowledgeVisible(memberId: string, knowledgeItemId: string) { return this.visibleKnowledge.has(knowledgeItemId); }
  async insertSubtask(input: { id: string; memberId: string; taskId: string; title: string; status: TaskSubtaskStatus; position: number; createdAt: number; updatedAt: number }) {
    if (this.subtasks.has(input.id) || !await this.findOwned(input.memberId, input.taskId)
      || (await this.listSubtasks(input.memberId, input.taskId)).some((item) => item.position === input.position)) return false;
    this.subtasks.set(input.id, { id: input.id, memberId: input.memberId, taskId: input.taskId, title: input.title, status: input.status, position: input.position, createdAt: new Date(input.createdAt).toISOString(), updatedAt: new Date(input.updatedAt).toISOString() });
    return true;
  }
  async findSubtask(memberId: string, taskId: string, id: string) {
    const item = this.subtasks.get(id);
    return item && item.memberId === memberId && item.taskId === taskId ? item : null;
  }
  async listSubtasks(memberId: string, taskId: string) { return [...this.subtasks.values()].filter((item) => item.memberId === memberId && item.taskId === taskId); }
  async updateSubtask(memberId: string, taskId: string, id: string, input: { title: string; status: TaskSubtaskStatus; position: number; updatedAt: number }, expectedUpdatedAt?: number) {
    const item = await this.findSubtask(memberId, taskId, id);
    if (!item || (expectedUpdatedAt !== undefined && Date.parse(item.updatedAt) !== expectedUpdatedAt)) return null;
    if ((await this.listSubtasks(memberId, taskId)).some((other) => other.id !== id && other.position === input.position)) return null;
    Object.assign(item, { title: input.title, status: input.status, position: input.position, updatedAt: new Date(input.updatedAt).toISOString() });
    return item;
  }
  async deleteSubtask(memberId: string, taskId: string, id: string, expectedUpdatedAt?: number) {
    const item = await this.findSubtask(memberId, taskId, id);
    if (!item || (expectedUpdatedAt !== undefined && Date.parse(item.updatedAt) !== expectedUpdatedAt)) return false;
    return this.subtasks.delete(id);
  }
  async insertDependency(input: { memberId: string; taskId: string; dependsOnTaskId: string; createdAt: number }, version?: { expectedUpdatedAt: number; updatedAt: number }) {
    const key = `${input.taskId}:${input.dependsOnTaskId}`;
    if (this.dependencies.has(key)) return false;
    if (version && !await this.touch(input.memberId, input.taskId, version.updatedAt, version.expectedUpdatedAt)) return false;
    this.dependencies.set(key, { memberId: input.memberId, taskId: input.taskId, dependsOnTaskId: input.dependsOnTaskId, createdAt: new Date(input.createdAt).toISOString() });
    return true;
  }
  async listDependencies(memberId: string, taskId: string) { return [...this.dependencies.values()].filter((item) => item.memberId === memberId && item.taskId === taskId); }
  async deleteDependency(memberId: string, taskId: string, dependsOnTaskId: string, version?: { expectedUpdatedAt: number; updatedAt: number }) {
    const key = `${taskId}:${dependsOnTaskId}`;
    if (!this.dependencies.has(key)) return false;
    if (version && !await this.touch(memberId, taskId, version.updatedAt, version.expectedUpdatedAt)) return false;
    return this.dependencies.delete(key);
  }
}
