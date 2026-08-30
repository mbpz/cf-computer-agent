/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, env, reset } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { NotificationsRepository } from "../../src/notifications/repository";
import type { NotificationInsert } from "../../src/notifications/types";
import { MIGRATIONS } from "../fixtures/d1";

const NOW = 1_777_777_000_000;

describe("notifications repository", () => {
  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    const timestamp = "2026-08-30T00:00:00.000Z";
    await env.DB.prepare(
      "INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES ('member-a', 'subject-a', 'a@example.test', 'contributor', 'active', ?, ?), ('member-b', 'subject-b', 'b@example.test', 'contributor', 'active', ?, ?)",
    ).bind(timestamp, timestamp, timestamp, timestamp).run();
  });

  it("inserts once per recipient and deduplication key while allowing another recipient", async () => {
    const repository = new NotificationsRepository(env.DB);
    expect(await repository.insert(notificationInsert({ id: "notification-a", recipientMemberId: "member-a", deduplicationKey: "task-a:doing" }))).toBe(true);
    expect(await repository.insert(notificationInsert({ id: "notification-replay", recipientMemberId: "member-a", deduplicationKey: "task-a:doing" }))).toBe(false);
    expect(await repository.insert(notificationInsert({ id: "notification-b", recipientMemberId: "member-b", deduplicationKey: "task-a:doing" }))).toBe(true);
    expect(await repository.findByDeduplicationKey("member-a", "task-a:doing")).toMatchObject({ id: "notification-a", recipientMemberId: "member-a" });
  });

  it("keeps deterministic created-at/id ordering across numbered pages and recipient totals", async () => {
    const repository = new NotificationsRepository(env.DB);
    for (let index = 0; index < 21; index += 1) {
      await repository.insert(notificationInsert({
        id: `notification-${String(index).padStart(2, "0")}`,
        recipientMemberId: "member-a",
        deduplicationKey: `event-${index}`,
      }));
    }
    await repository.insert(notificationInsert({ id: "notification-private", recipientMemberId: "member-b", deduplicationKey: "private" }));

    const first = await repository.list("member-a", { filters: {}, page: 1, pageSize: 20 });
    const second = await repository.list("member-a", { filters: {}, page: 2, pageSize: 20 });
    const ids = [...first.items, ...second.items].map(({ id }) => id);

    expect(first.pagination).toEqual({ page: 1, pageSize: 20, total: 21, totalPages: 2 });
    expect(second.pagination).toEqual({ page: 2, pageSize: 20, total: 21, totalPages: 2 });
    expect(ids).toEqual(Array.from({ length: 21 }, (_unused, index) => `notification-${String(20 - index).padStart(2, "0")}`));
    expect(new Set(ids).size).toBe(21);
  });

  it("scopes filtered lists, unread summaries, and all read updates to the recipient", async () => {
    const repository = new NotificationsRepository(env.DB);
    await repository.insert(notificationInsert({ id: "a-status", recipientMemberId: "member-a", deduplicationKey: "a-status" }));
    await repository.insert(notificationInsert({ id: "a-due", recipientMemberId: "member-a", eventType: "task.due", deduplicationKey: "a-due" }));
    await repository.insert(notificationInsert({ id: "b-status", recipientMemberId: "member-b", deduplicationKey: "b-status" }));

    const due = await repository.list("member-a", { filters: { eventType: "task.due", read: false }, page: 1, pageSize: 20 });
    expect(due.items.map(({ id }) => id)).toEqual(["a-due"]);
    expect(await repository.summary("member-a")).toEqual({ unread: 2 });
    expect(await repository.markRead("member-b", "a-status", NOW + 1)).toBe(false);
    expect(await repository.markRead("member-a", "a-status", NOW + 1)).toBe(true);
    expect(await repository.markRead("member-a", "a-status", NOW + 2)).toBe(false);
    const visibleIds = ["a-due", "b-status", ...Array.from({ length: 98 }, (_, index) => `missing-${index}`)];
    expect(await repository.markManyRead("member-a", { ids: visibleIds, limit: 100 }, NOW + 3)).toBe(1);
    expect(await repository.summary("member-a")).toEqual({ unread: 0 });
    expect(await repository.summary("member-b")).toEqual({ unread: 1 });
  });

  it("selects a bounded recipient-owned set of open tasks for lazy due materialization", async () => {
    const repository = new NotificationsRepository(env.DB);
    const rows = [
      ["due", "member-a", "todo", NOW + 1_000],
      ["overdue", "member-a", "doing", NOW - 86_400_000],
      ["done", "member-a", "done", NOW - 86_400_000],
      ["future", "member-a", "blocked", NOW + 86_400_000],
      ["private", "member-b", "todo", NOW - 86_400_000],
    ] as const;
    for (const [id, memberId, status, dueAt] of rows) {
      await env.DB.prepare(
        `INSERT INTO tasks
         (id, member_id, title, notes, status, progress, priority, due_at, created_at, updated_at)
         VALUES (?, ?, ?, '', ?, 0, 'medium', ?, ?, ?)`,
      ).bind(id, memberId, id, status, dueAt, NOW, NOW).run();
    }

    await expect(repository.listDueCandidates("member-a", NOW, 50)).resolves.toEqual([
      { taskId: "overdue", dueAt: NOW - 86_400_000 },
      { taskId: "due", dueAt: NOW + 1_000 },
    ]);
    await expect(repository.listDueCandidates("member-a", NOW, 1)).resolves.toEqual([
      { taskId: "overdue", dueAt: NOW - 86_400_000 },
    ]);
  });
});

function notificationInsert(overrides: Partial<NotificationInsert> = {}): NotificationInsert {
  return {
    id: "notification-1",
    recipientMemberId: "member-a",
    eventType: "task.status_changed",
    actorMemberId: "member-a",
    targetKind: "task",
    targetId: "task-a",
    payloadJson: '{"previousStatus":"todo","status":"doing"}',
    deduplicationKey: "task-a:status:doing",
    createdAt: NOW,
    ...overrides,
  };
}
