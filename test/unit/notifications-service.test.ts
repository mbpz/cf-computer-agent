import { describe, expect, it } from "vitest";
import { NotificationsService, type DueNotificationSource, type NotificationTargetAuthorizer } from "../../src/notifications/service";
import type { NotificationsRepositoryPort } from "../../src/notifications/repository";
import type {
  DueNotificationCandidate,
  Notification,
  NotificationBulkReadSelection,
  NotificationEventInput,
  NotificationInsert,
  NotificationListRequest,
  NotificationSummary,
  StoredNotificationPage,
} from "../../src/notifications/types";

const NOW = new Date("2026-08-30T12:00:00.000Z");

describe("NotificationsService", () => {
  it("normalizes event identity and canonicalizes presentation payload before insert", async () => {
    const repository = new FakeNotificationsRepository();
    const service = createService(repository);
    const result = await service.emit({
      recipientMemberId: " member-a ",
      eventType: "task.status_changed",
      actorMemberId: " member-b ",
      targetKind: "task",
      targetId: " task-a ",
      payload: { status: "doing", previousStatus: "todo" },
      deduplicationKey: " task-a:todo:doing ",
    });

    expect(result).toMatchObject({ created: true, suppressed: false, notification: { id: "notification-1" } });
    expect(repository.inserts).toEqual([{
      id: "notification-1",
      recipientMemberId: "member-a",
      eventType: "task.status_changed",
      actorMemberId: "member-b",
      targetKind: "task",
      targetId: "task-a",
      payloadJson: '{"previousStatus":"todo","status":"doing"}',
      deduplicationKey: "task-a:todo:doing",
      createdAt: NOW.getTime(),
    }]);
  });

  it("rejects malformed or oversized normalized event fields and payloads", async () => {
    const service = createService(new FakeNotificationsRepository());
    const valid = eventInput();
    await expect(service.emit({ ...valid, targetId: "bad id" })).rejects.toMatchObject({ code: "NOTIFICATION_EVENT_INVALID", status: 400 });
    await expect(service.emit({ ...valid, payload: { body: "界".repeat(1_400) } })).rejects.toMatchObject({ code: "NOTIFICATION_EVENT_INVALID", status: 400 });
    await expect(service.emit({ ...valid, payload: { count: Number.NaN } })).rejects.toMatchObject({ code: "NOTIFICATION_EVENT_INVALID", status: 400 });
  });

  it("suppresses unauthorized targets without persisting or disclosing them", async () => {
    const repository = new FakeNotificationsRepository();
    const authorizer = new FakeTargetAuthorizer(false);
    const service = createService(repository, { targetAuthorizer: authorizer });

    await expect(service.emit(eventInput())).resolves.toEqual({ notification: null, created: false, suppressed: true });
    expect(authorizer.checks).toEqual([{ recipientMemberId: "member-a", targetKind: "task", targetId: "task-a" }]);
    expect(repository.inserts).toEqual([]);
  });

  it("returns the original notification when the same recipient event is replayed", async () => {
    const repository = new FakeNotificationsRepository();
    const service = createService(repository);
    const first = await service.emit(eventInput());
    const replay = await service.emit({ ...eventInput(), payload: { status: "replayed" } });

    expect(first.created).toBe(true);
    expect(replay).toMatchObject({ created: false, suppressed: false, notification: { id: "notification-1", payload: { status: "doing" } } });
    expect(repository.notifications).toHaveLength(1);
  });

  it("reports recipient unread state and makes single-read replay idempotent", async () => {
    const repository = new FakeNotificationsRepository();
    const service = createService(repository);
    const emitted = await service.emit(eventInput());
    const id = emitted.notification!.id;

    await expect(service.summary("member-a")).resolves.toEqual({ unread: 1 });
    const first = await service.markRead("member-a", id);
    const replay = await service.markRead("member-a", id);
    expect(first.readAt).toBe(NOW.toISOString());
    expect(replay).toEqual(first);
    await expect(service.markRead("member-b", id)).rejects.toMatchObject({ code: "NOTIFICATION_NOT_FOUND", status: 404 });
    await expect(service.summary("member-a")).resolves.toEqual({ unread: 0 });
  });

  it("keeps notification history but redacts target capability after access is revoked", async () => {
    const repository = new FakeNotificationsRepository();
    const authorizer = new FakeTargetAuthorizer(true);
    const service = createService(repository, { targetAuthorizer: authorizer });
    const emitted = await service.emit(eventInput());
    authorizer.allowed = false;

    const page = await service.list("member-a", {}, { page: 1, pageSize: 20 });
    expect(page.items).toEqual([{
      ...emitted.notification,
      targetKind: null,
      targetId: null,
    }]);
    await expect(service.summary("member-a")).resolves.toEqual({ unread: 1 });
    await expect(service.markRead("member-a", emitted.notification!.id)).resolves.toMatchObject({
      id: emitted.notification!.id,
      targetKind: null,
      targetId: null,
      readAt: NOW.toISOString(),
    });
  });

  it("bounds visible-id and filtered bulk reads before repository access", async () => {
    const repository = new FakeNotificationsRepository();
    const service = createService(repository);
    await expect(service.markManyRead("member-a", { ids: Array.from({ length: 101 }, (_, index) => `notification-${index}`) }))
      .rejects.toMatchObject({ code: "NOTIFICATION_BULK_INVALID", status: 400 });
    await expect(service.markManyRead("member-a", { eventType: "task.due", limit: 101 }))
      .rejects.toMatchObject({ code: "NOTIFICATION_BULK_INVALID", status: 400 });
    expect(repository.bulkSelections).toEqual([]);

    await expect(service.markManyRead("member-a", {
      ids: ["notification-a", "notification-a", "notification-b"],
      eventType: "task.status_changed",
      createdBefore: "2026-08-30T13:00:00.000Z",
      limit: 20,
    })).resolves.toEqual({ marked: 0 });
    expect(repository.bulkSelections).toEqual([{
      ids: ["notification-a", "notification-b"],
      eventType: "task.status_changed",
      createdBefore: Date.parse("2026-08-30T13:00:00.000Z"),
      limit: 20,
    }]);
  });

  it("lazily materializes bounded due and overdue observations before reads", async () => {
    const repository = new FakeNotificationsRepository();
    const dueSource = new FakeDueSource([
      { taskId: "due-task", dueAt: Date.parse("2026-08-30T18:00:00.000Z") },
      { taskId: "overdue-task", dueAt: Date.parse("2026-08-29T18:00:00.000Z") },
    ]);
    const service = createService(repository, { dueSource });

    const page = await service.list("member-a", {}, { page: 1, pageSize: 20 });
    expect(page.items.map(({ eventType }) => eventType).sort()).toEqual(["task.due", "task.overdue"]);
    expect(repository.inserts.map(({ deduplicationKey }) => deduplicationKey).sort()).toEqual([
      `task:due-task:due:${Date.parse("2026-08-30T18:00:00.000Z")}`,
      `task:overdue-task:overdue:${Date.parse("2026-08-29T18:00:00.000Z")}`,
    ]);
    await expect(service.summary("member-a")).resolves.toEqual({ unread: 2 });
    expect(dueSource.requests).toEqual([
      { memberId: "member-a", observedAt: NOW.getTime(), limit: 10 },
      { memberId: "member-a", observedAt: NOW.getTime(), limit: 10 },
    ]);
    expect(repository.notifications).toHaveLength(2);
  });

  it("rejects invalid list input before lazy materialization can write", async () => {
    const repository = new FakeNotificationsRepository();
    const dueSource = new FakeDueSource([{ taskId: "due-task", dueAt: NOW.getTime() }]);
    const service = createService(repository, { dueSource });

    await expect(service.list("member-a", {}, { page: 1, pageSize: 10 as never }))
      .rejects.toMatchObject({ code: "NOTIFICATION_PAGE_INVALID", status: 400 });
    expect(dueSource.requests).toEqual([]);
    expect(repository.inserts).toEqual([]);
  });
});

function eventInput(): NotificationEventInput {
  return {
    recipientMemberId: "member-a",
    eventType: "task.status_changed",
    actorMemberId: "member-a",
    targetKind: "task",
    targetId: "task-a",
    payload: { previousStatus: "todo", status: "doing" },
    deduplicationKey: "task-a:todo:doing",
  };
}

function createService(
  repository: FakeNotificationsRepository,
  overrides: { targetAuthorizer?: NotificationTargetAuthorizer; dueSource?: DueNotificationSource } = {},
): NotificationsService {
  let nextId = 0;
  return new NotificationsService(repository, {
    id: () => `notification-${++nextId}`,
    now: () => NOW,
    targetAuthorizer: overrides.targetAuthorizer ?? new FakeTargetAuthorizer(true),
    ...(overrides.dueSource ? { dueSource: overrides.dueSource } : {}),
  });
}

class FakeTargetAuthorizer implements NotificationTargetAuthorizer {
  readonly checks: Array<{ recipientMemberId: string; targetKind: string; targetId: string }> = [];
  constructor(public allowed: boolean) {}
  async canReadTarget(recipientMemberId: string, targetKind: string, targetId: string): Promise<boolean> {
    this.checks.push({ recipientMemberId, targetKind, targetId });
    return this.allowed;
  }
}

class FakeDueSource implements DueNotificationSource {
  readonly requests: Array<{ memberId: string; observedAt: number; limit: number }> = [];
  constructor(private readonly candidates: DueNotificationCandidate[]) {}
  async listDueCandidates(memberId: string, observedAt: number, limit: number): Promise<DueNotificationCandidate[]> {
    this.requests.push({ memberId, observedAt, limit });
    return this.candidates.slice(0, limit);
  }
}

class FakeNotificationsRepository implements NotificationsRepositoryPort {
  readonly inserts: NotificationInsert[] = [];
  readonly notifications: Notification[] = [];
  readonly bulkSelections: NotificationBulkReadSelection[] = [];

  async insert(input: NotificationInsert): Promise<boolean> {
    this.inserts.push(input);
    if (this.notifications.some(({ recipientMemberId, deduplicationKey }) => recipientMemberId === input.recipientMemberId && deduplicationKey === input.deduplicationKey)) return false;
    this.notifications.push({
      id: input.id,
      recipientMemberId: input.recipientMemberId,
      eventType: input.eventType,
      actorMemberId: input.actorMemberId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      payload: JSON.parse(input.payloadJson),
      deduplicationKey: input.deduplicationKey,
      readAt: null,
      createdAt: new Date(input.createdAt).toISOString(),
    });
    return true;
  }
  async findByDeduplicationKey(recipientMemberId: string, deduplicationKey: string) {
    return this.notifications.find((item) => item.recipientMemberId === recipientMemberId && item.deduplicationKey === deduplicationKey) ?? null;
  }
  async findOwned(recipientMemberId: string, id: string) {
    return this.notifications.find((item) => item.recipientMemberId === recipientMemberId && item.id === id) ?? null;
  }
  async list(recipientMemberId: string, request: NotificationListRequest): Promise<StoredNotificationPage> {
    const items = this.notifications.filter((item) => item.recipientMemberId === recipientMemberId
      && (!request.filters.eventType || item.eventType === request.filters.eventType)
      && (request.filters.read === undefined || (item.readAt !== null) === request.filters.read));
    return {
      items: items.slice((request.page - 1) * request.pageSize, request.page * request.pageSize),
      pagination: { page: request.page, pageSize: request.pageSize, total: items.length, totalPages: items.length ? Math.ceil(items.length / request.pageSize) : 0 },
    };
  }
  async summary(recipientMemberId: string): Promise<NotificationSummary> {
    return { unread: this.notifications.filter((item) => item.recipientMemberId === recipientMemberId && item.readAt === null).length };
  }
  async markRead(recipientMemberId: string, id: string, readAt: number): Promise<boolean> {
    const item = await this.findOwned(recipientMemberId, id);
    if (!item || item.readAt !== null) return false;
    item.readAt = new Date(readAt).toISOString();
    return true;
  }
  async markManyRead(_recipientMemberId: string, selection: NotificationBulkReadSelection): Promise<number> {
    this.bulkSelections.push(selection);
    return 0;
  }
}
