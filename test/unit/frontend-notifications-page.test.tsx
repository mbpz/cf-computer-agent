// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import {
  notificationEventKey,
  notificationTargetHref,
  parseNotificationSearch,
  writeNotificationSearch,
} from "../../frontend/pages/notifications/notification-model";
import { NotificationsPage } from "../../frontend/pages/notifications/notifications-page";

describe("notification inbox model", () => {
  it("parses canonical URL filters and writes a filter change at page one", () => {
    expect(parseNotificationSearch("?page=2&pageSize=50&read=unread&type=task.due")).toEqual({
      page: 2,
      pageSize: 50,
      filters: { read: "unread", eventType: "task.due" },
    });
    expect(parseNotificationSearch("?page=2&page=3&read=unsafe&type=unknown")).toEqual({
      page: 1,
      pageSize: 20,
      filters: {},
    });
    expect(writeNotificationSearch("?page=9&pageSize=50&read=unread&type=task.due", {
      page: 1,
      pageSize: 50,
      filters: { read: "read", eventType: "task.overdue" },
    })).toBe("?pageSize=50&read=read&type=task.overdue");
  });

  it("maps every event to catalog copy and emits only safe internal targets", () => {
    expect(notificationEventKey("task.status_changed")).toBe("NOTIFICATIONS_EVENT_TASK_STATUS_CHANGED");
    expect(notificationTargetHref({ targetKind: "task", targetId: "task-1" })).toBe("/tasks");
    expect(notificationTargetHref({ targetKind: "knowledge_item", targetId: "knowledge-1" })).toBe("/knowledge/knowledge-1");
    expect(notificationTargetHref({ targetKind: "discussion_thread", targetId: "thread-1" })).toBe("/messages");
    expect(notificationTargetHref({ targetKind: "knowledge_item", targetId: "javascript:alert(1)" })).toBeNull();
  });
});

describe("notification inbox page", () => {
  it("uses server unread totals and visible text semantics for read state in both locales", () => {
    for (const language of ["en", "zh-CN"] as const) {
      const locale = createLocaleRuntime({ navigatorLanguage: language });
      const html = renderToStaticMarkup(<NotificationsPage
        locale={locale}
        state={{ kind: "ready", items: [notification(), notification({ id: "read-1", readAt: "2026-08-30T01:00:00.000Z" })], pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 } }}
        summary={{ unread: 17 }}
        filters={{}}
        onRetry={vi.fn()}
        onFilterChange={vi.fn()}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkVisibleRead={vi.fn()}
      />);
      expect(html).toContain(`${frontendText(locale, "NOTIFICATIONS_UNREAD_COUNT")} 17`);
      expect(html).toContain(frontendText(locale, "NOTIFICATIONS_UNREAD"));
      expect(html).toContain(frontendText(locale, "NOTIFICATIONS_READ"));
      expect(html).toContain('href="/knowledge/knowledge-1"');
      expect(html).not.toContain("javascript:");
    }
  });

  it("renders localized loading, error, and empty recovery states", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const base = { locale, summary: null, filters: {}, onRetry: vi.fn(), onFilterChange: vi.fn(), onPageChange: vi.fn(), onPageSizeChange: vi.fn(), onMarkRead: vi.fn(), onMarkVisibleRead: vi.fn() };
    const loading = renderToStaticMarkup(<NotificationsPage {...base} state={{ kind: "loading" }} />);
    const error = renderToStaticMarkup(<NotificationsPage {...base} state={{ kind: "error" }} />);
    const empty = renderToStaticMarkup(<NotificationsPage {...base} summary={{ unread: 0 }} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }} />);
    expect(loading).toContain(frontendText(locale, "NOTIFICATIONS_LOADING"));
    expect(error).toContain(frontendText(locale, "NOTIFICATIONS_ERROR"));
    expect(error).toContain(frontendText(locale, "NOTIFICATIONS_RETRY"));
    expect(empty).toContain(frontendText(locale, "NOTIFICATIONS_EMPTY"));
  });

  it("marks only visible unread IDs and keeps complete server pagination", () => {
    const locale = createLocaleRuntime();
    const markVisible = vi.fn();
    const html = renderToStaticMarkup(<NotificationsPage
      locale={locale}
      state={{ kind: "ready", items: [notification(), notification({ id: "read-1", readAt: "2026-08-30T01:00:00.000Z" })], pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 } }}
      summary={{ unread: 9 }}
      filters={{}}
      onRetry={vi.fn()}
      onFilterChange={vi.fn()}
      onPageChange={vi.fn()}
      onPageSizeChange={vi.fn()}
      onMarkRead={vi.fn()}
      onMarkVisibleRead={markVisible}
    />);
    expect(html).toContain("Total");
    expect(html).toContain("41");
    expect(html).toContain(frontendText(locale, "NOTIFICATIONS_MARK_VISIBLE_READ"));
    expect(html).toContain('aria-label="Page 3"');
  });
});

function notification(overrides: Record<string, unknown> = {}) {
  return {
    id: "notification-1",
    recipientMemberId: "member-1",
    eventType: "task.due" as const,
    actorMemberId: null,
    targetKind: "knowledge_item" as const,
    targetId: "knowledge-1",
    payload: { title: "Due soon" },
    deduplicationKey: "task:task-1:due:1",
    readAt: null,
    createdAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}
