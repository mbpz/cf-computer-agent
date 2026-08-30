import { describe, expect, it } from "vitest";
import {
  createNotificationsRequestController,
  loadNotificationSummary,
  loadNotifications,
  markNotificationRead,
  markVisibleNotificationsRead,
} from "../../frontend/lib/notifications-data";

describe("notifications data layer", () => {
  it("serializes numbered read/type filters and parses canonical rows and summary", async () => {
    const requests: string[] = [];
    const requester = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(input));
      expect(init?.credentials).toBe("same-origin");
      if (String(input) === "/api/notifications/summary") return Response.json({ unread: 7 });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json(notificationPage({ page: 2, pageSize: 50, total: 51, title: "Due soon" }));
    }) as unknown as typeof fetch;

    const page = await loadNotifications(
      { read: "unread", eventType: "task.due" },
      { page: 2, pageSize: 50 },
      requester,
      new AbortController().signal,
    );
    expect(requests[0]).toBe("/api/notifications?page=2&pageSize=50&read=false&type=task.due");
    expect(page.items[0]).toMatchObject({ id: "notification-1", eventType: "task.due", payload: { title: "Due soon" }, readAt: null });
    await expect(loadNotificationSummary(requester)).resolves.toEqual({ unread: 7 });
  });

  it("fails closed for malformed rows and malformed unread summaries", async () => {
    for (const row of [
      notification({ id: "" }),
      notification({ eventType: "task.unknown" }),
      notification({ targetKind: "external_url" }),
      notification({ targetId: "javascript:alert(1)" }),
      notification({ payload: { nested: {} } }),
      notification({ unexpected: true }),
      notification({ readAt: "not-a-date" }),
      notification({ createdAt: "not-a-date" }),
      notification({ targetKind: null, targetId: "knowledge-1" }),
      notification({ targetKind: "knowledge_item", targetId: null }),
    ]) {
      const requester = jsonRequester({ items: [row], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      await expect(loadNotifications({}, { page: 1, pageSize: 20 }, requester)).rejects.toThrow("NUMBERED_PAGE_RESPONSE_INVALID");
    }
    for (const summary of [{}, { unread: -1 }, { unread: 1.5 }, { unread: "1" }]) {
      await expect(loadNotificationSummary(jsonRequester(summary))).rejects.toThrow("NOTIFICATION_SUMMARY_INVALID");
    }
  });

  it("accepts only the canonical null target pair for unavailable targets", async () => {
    const requester = jsonRequester({
      items: [notification({ targetKind: null, targetId: null })],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    await expect(loadNotifications({}, { page: 1, pageSize: 20 }, requester)).resolves.toMatchObject({
      items: [{ targetKind: null, targetId: null }],
    });
  });

  it("aborts both requests and invalidates an older generation", async () => {
    const requester = ((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as unknown as typeof fetch;
    const controller = createNotificationsRequestController(requester);
    const first = controller.request({ filters: {}, page: 1, pageSize: 20 });
    const second = controller.request({ filters: { read: "unread" }, page: 2, pageSize: 20 });
    expect(controller.isCurrent(first.generation)).toBe(false);
    expect(controller.isCurrent(second.generation)).toBe(true);
    await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
    controller.dispose();
    await expect(second.promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("normalizes mark-one and sends only a bounded visible ID body for bulk", async () => {
    const calls: Array<{ path: string; body: string }> = [];
    const requester = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), body: String(init?.body ?? "") });
      if (String(input).endsWith("/read") && String(input) !== "/api/notifications/read") {
        return Response.json(notification({ id: "notification_unsafe", readAt: "2026-08-30T01:00:00.000Z" }));
      }
      return Response.json({ marked: 2 });
    }) as unknown as typeof fetch;

    await expect(markNotificationRead("notification_unsafe", requester)).resolves.toMatchObject({ id: "notification_unsafe" });
    await expect(markVisibleNotificationsRead(["visible-1", "visible-2"], requester)).resolves.toEqual({ marked: 2 });
    expect(calls).toEqual([
      { path: "/api/notifications/notification_unsafe/read", body: "" },
      { path: "/api/notifications/read", body: JSON.stringify({ ids: ["visible-1", "visible-2"] }) },
    ]);
    await expect(markVisibleNotificationsRead([], requester)).rejects.toThrow("NOTIFICATION_BULK_INVALID");
    await expect(markVisibleNotificationsRead(Array.from({ length: 101 }, (_, index) => `visible-${index}`), requester))
      .rejects.toThrow("NOTIFICATION_BULK_INVALID");
  });
});

function jsonRequester(payload: unknown): typeof fetch {
  return (async () => Response.json(payload)) as unknown as typeof fetch;
}

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-1",
    recipientMemberId: "member-1",
    eventType: "task.due",
    actorMemberId: null,
    targetKind: "task",
    targetId: "task-1",
    payload: { title: "Due soon" },
    deduplicationKey: "task:task-1:due:1",
    readAt: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

function notificationPage({ page, pageSize, total, title }: { page: number; pageSize: number; total: number; title: string }) {
  const offset = (page - 1) * pageSize;
  const count = Math.max(0, Math.min(pageSize, total - offset));
  return {
    items: Array.from({ length: count }, (_, index) => notification({ id: `notification-${index + 1}`, payload: { title } })),
    pagination: { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) },
  };
}
