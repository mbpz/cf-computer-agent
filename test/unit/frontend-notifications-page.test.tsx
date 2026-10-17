// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import {
  notificationEventKey,
  notificationTargetHref,
  parseNotificationSearch,
  writeNotificationSearch,
} from "../../frontend/pages/notifications/notification-model";
import { NotificationsPage, type NotificationsPageState } from "../../frontend/pages/notifications/notifications-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// Static import cannot work here: happy-dom must load after the hoisted `node:vm` mock and the InertVmScript class are initialized.
const { Window } = await import("happy-dom");

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
    expect(notificationTargetHref({ targetKind: "submission", targetId: "submission-1" })).toBe("/my-submissions");
    expect(notificationTargetHref({ targetKind: "submission", targetId: "submission-1" }, true)).toBe("/admin/submissions/submission-1");
    for (const event of ["submission.published", "submission.rejected", "submission.revision_requested"] as const) {
      for (const language of ["en", "zh-CN"] as const) {
        const key = notificationEventKey(event);
        expect(key).toBeTruthy();
        expect(frontendText(createLocaleRuntime({ navigatorLanguage: language }), key)).not.toBe(key);
      }
    }
    expect(notificationTargetHref({ targetKind: "knowledge_item", targetId: "knowledge-1" })).toBe("/knowledge/knowledge-1");
    expect(notificationTargetHref({ targetKind: "discussion_thread", targetId: "thread-1" })).toBe("/messages/thread-1");
    expect(notificationTargetHref({ targetKind: "knowledge_item", targetId: "javascript:alert(1)" })).toBeNull();
    expect(notificationTargetHref({ targetKind: null, targetId: null })).toBeNull();
  });

  it("keeps inaccessible notification history visible without an actionable target link", () => {
    const locale = createLocaleRuntime();
    const html = renderToStaticMarkup(<NotificationsPage
      locale={locale}
      state={{ kind: "ready", items: [notification({ targetKind: null, targetId: null })], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }}
      summary={{ unread: 1 }}
      filters={{}}
      onRetry={vi.fn()}
      onFilterChange={vi.fn()}
      onLoadMore={vi.fn()}
      onMarkRead={vi.fn()}
      onMarkVisibleRead={vi.fn()}
      onOpen={vi.fn()}
    />);
    expect(html).toContain("Due soon");
    expect(html).not.toContain(frontendText(locale, "NOTIFICATIONS_OPEN"));
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
        onLoadMore={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkVisibleRead={vi.fn()}
        onOpen={vi.fn()}
      />);
      expect(html).toContain(`${frontendText(locale, "NOTIFICATIONS_UNREAD_COUNT")} 17`);
      expect(html).toContain(frontendText(locale, "NOTIFICATIONS_UNREAD"));
      expect(html).toContain(frontendText(locale, "NOTIFICATIONS_READ"));
      expect(html).not.toContain('href="/knowledge/knowledge-1"');
      expect(html).toContain(frontendText(locale, "NOTIFICATIONS_OPEN"));
      expect(html).not.toContain("javascript:");
      expect(html).toContain('data-notification-id="notification-1" data-read="false"');
      expect(html).toContain('data-notification-id="read-1" data-read="true"');
    }
  });

  it("explains read-only recovery in both locales without exposing stale summaries or actions", () => {
    for (const language of ["en", "zh-CN"] as const) {
      const locale = createLocaleRuntime({ navigatorLanguage: language });
      const html = renderToStaticMarkup(<NotificationsPage locale={locale} state={{ kind: "recovery" }} summary={{ unread: 9 }} filters={{}} onRetry={vi.fn()} onFilterChange={vi.fn()} onLoadMore={vi.fn()} onMarkRead={vi.fn()} onMarkVisibleRead={vi.fn()} onOpen={vi.fn()} />);
      expect(html).toContain(frontendText(locale, "NOTIFICATIONS_RECOVERY_DESCRIPTION"));
      expect(html).toContain(frontendText(locale, "NOTIFICATIONS_RETRY"));
      expect(html).not.toContain(frontendText(locale, "NOTIFICATIONS_MARK_VISIBLE_READ"));
      expect(html).not.toContain(`${frontendText(locale, "NOTIFICATIONS_UNREAD_COUNT")} 9`);
    }
  });

  it("renders localized loading, error, and empty recovery states", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const base = { locale, summary: null, filters: {}, onRetry: vi.fn(), onFilterChange: vi.fn(), onLoadMore: vi.fn(), onMarkRead: vi.fn(), onMarkVisibleRead: vi.fn(), onOpen: vi.fn() };
    const loading = renderToStaticMarkup(<NotificationsPage {...base} state={{ kind: "loading" }} />);
    const error = renderToStaticMarkup(<NotificationsPage {...base} state={{ kind: "error" }} />);
    const empty = renderToStaticMarkup(<NotificationsPage {...base} summary={{ unread: 0 }} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }} />);
    expect(loading).toContain(frontendText(locale, "NOTIFICATIONS_LOADING"));
    expect(error).toContain(frontendText(locale, "NOTIFICATIONS_ERROR"));
    expect(error).toContain(frontendText(locale, "NOTIFICATIONS_RETRY"));
    expect(empty).toContain(frontendText(locale, "NOTIFICATIONS_EMPTY"));
  });

  it("marks only visible unread IDs and leaves the desktop footer to the route's page controls", () => {
    const locale = createLocaleRuntime();
    const markVisible = vi.fn();
    const props = {
      locale,
      summary: { unread: 9 },
      filters: {},
      onRetry: vi.fn(),
      onFilterChange: vi.fn(),
      onLoadMore: vi.fn(),
      onMarkRead: vi.fn(),
      onMarkVisibleRead: markVisible,
      onOpen: vi.fn(),
      state: { kind: "ready" as const, items: [notification(), notification({ id: "read-1", readAt: "2026-08-30T01:00:00.000Z" })], pagination: { page: 2, pageSize: 20 as const, total: 41, totalPages: 3 } },
    };
    const html = renderToStaticMarkup(<NotificationsPage {...props} />);
    expect(html).toContain(frontendText(locale, "NOTIFICATIONS_MARK_VISIBLE_READ"));
    expect(html).toContain(frontendText(locale, "NOTIFICATIONS_MARK_READ"));
    // Unwired routes keep the desktop footer hidden and leak no feed copy into the desktop surface.
    expect(html).not.toContain("data-pagination-desktop");
    expect(html).not.toContain('aria-label="Page 3"');
    expect(html).not.toContain(frontendText(locale, "LIST_END_OF_LIST"));

    const paged = renderToStaticMarkup(<NotificationsPage {...props} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(paged).toContain("data-pagination-desktop");
    expect(paged).toContain("Total");
    expect(paged).toContain("21–40");
    expect(paged).toContain('aria-label="Page 3"');
    expect(paged).toContain("lg:h-full lg:min-h-0");
    expect(paged).not.toContain(frontendText(locale, "LIST_END_OF_LIST"));
  });
});

describe("notification inbox paging surface", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const en = createLocaleRuntime({ navigatorLanguage: "en" });

  // The shared table switches surface on Tailwind's `lg` edge.
  const setViewport = (desktop: boolean) => Object.defineProperty(browser, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: desktop && query === "(min-width: 1024px)", media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
  });

  beforeEach(() => {
    browser = new Window({ url: "https://app.test/notifications" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, HTMLElement: browser.HTMLElement, navigator: browser.navigator, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    setViewport(true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  const props = {
    locale: en,
    summary: { unread: 9 },
    filters: {},
    onRetry: () => undefined,
    onFilterChange: () => undefined,
    onMarkRead: () => undefined,
    onMarkVisibleRead: () => undefined,
    onOpen: () => undefined,
  };
  const readyState = (page: number, count = 20) => ({ kind: "ready" as const, items: Array.from({ length: count }, (_, index) => notification({ id: `notification-${index + 1}` })), pagination: { page, pageSize: 20 as const, total: 41, totalPages: 3 } });

  it("invokes the route page controls on desktop without pulling the append feed", async () => {
    const onPageChange = vi.fn(); const onPageSizeChange = vi.fn(); const onLoadMore = vi.fn();
    await act(async () => root.render(<NotificationsPage {...props} state={readyState(2)} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} onLoadMore={onLoadMore} />));
    expect(container.textContent).toContain("21–40");
    await act(async () => (container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click());
    expect(onPageChange).toHaveBeenCalledWith(3);
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Rows per page"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLSelectElement.prototype, "value")!.set!.call(select, "100"); select.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event); });
    expect(onPageSizeChange).toHaveBeenCalledWith(100);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("keeps the append feed and hides the pager on narrow viewports", async () => {
    setViewport(false);
    const onLoadMore = vi.fn(); const onPageChange = vi.fn();
    await act(async () => root.render(<NotificationsPage {...props} state={readyState(1, 12)} onPageChange={onPageChange} onPageSizeChange={vi.fn()} onLoadMore={onLoadMore} />));
    expect(container.querySelector("[data-pagination-desktop]")).toBeNull();
    expect(container.querySelector("[data-pagination-mobile]")).toBeNull();
    const scroller = container.querySelector("[data-notification-feed]") as HTMLElement;
    await act(async () => scroller.dispatchEvent(new browser.Event("scroll") as unknown as Event));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onPageChange).not.toHaveBeenCalled();

    await act(async () => root.render(<NotificationsPage {...props} state={readyState(3, 12)} onPageChange={onPageChange} onPageSizeChange={vi.fn()} onLoadMore={onLoadMore} />));
    expect(container.querySelector('p[role="status"]')?.textContent).toBe(frontendText(en, "LIST_END_OF_LIST"));
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

describe("notification inbox shell", () => {
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const base = { locale, summary: { unread: 3 }, filters: {}, onRetry: vi.fn(), onFilterChange: vi.fn(), onLoadMore: vi.fn(), onMarkRead: vi.fn(), onMarkVisibleRead: vi.fn(), onOpen: vi.fn() };
  const states: readonly [string, NotificationsPageState][] = [
    ["loading", { kind: "loading" }],
    ["recovery", { kind: "recovery" }],
    ["error", { kind: "error" }],
    ["forbidden", { kind: "forbidden" }],
    ["ready", { kind: "ready", items: [notification()], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }],
  ];

  it.each(states)("renders exactly one titled h1 and the beUI filters in the %s state", (_name, state) => {
    const html = renderToStaticMarkup(<NotificationsPage {...base} state={state} />);
    expect([...html.matchAll(/<h1[ >]/g)]).toHaveLength(1);
    expect(html).toContain(`>${frontendText(locale, "NOTIFICATIONS_TITLE")}</h1>`);
    // Both filters are beUI listboxes now; the native select and its aria-label are gone.
    expect(html).not.toContain("<select");
    expect(html).not.toContain('aria-label="Read status"');
    expect([...html.matchAll(/aria-haspopup="listbox"/g)]).toHaveLength(2);
    expect(html).toContain(frontendText(locale, "NOTIFICATIONS_READ_FILTER"));
    expect(html).toContain(frontendText(locale, "NOTIFICATIONS_TYPE_FILTER"));
  });

  it("surfaces an applied read condition as removable text whose clear-all resets every filter", () => {
    const html = renderToStaticMarkup(<NotificationsPage {...base} filters={{ read: "unread", eventType: "task.overdue" }} state={{ kind: "ready", items: [notification()], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }} />);
    expect(html).toContain("data-applied-filters");
    expect(html).toContain(`${frontendText(locale, "NOTIFICATIONS_READ_FILTER")}: ${frontendText(locale, "NOTIFICATIONS_FILTER_UNREAD")}`);
    expect(html).toContain(`${frontendText(locale, "NOTIFICATIONS_TYPE_FILTER")}: ${frontendText(locale, "NOTIFICATIONS_EVENT_TASK_OVERDUE")}`);
    expect(html).toContain("data-filters-clear");
    expect(html).toContain(frontendText(locale, "COMMON_CLEAR_FILTERS"));
  });
});
