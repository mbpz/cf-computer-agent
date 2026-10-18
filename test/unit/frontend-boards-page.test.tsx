// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import {
  BOARD_STATUSES,
  boardStatusTargets,
  parseBoardSearch,
  writeBoardColumnSearch,
  type BoardColumnStates,
} from "../../frontend/pages/boards/board-model";
import { BoardsPage } from "../../frontend/pages/boards/boards-page";
import { taskStatusKey } from "../../frontend/pages/tasks/tasks-model";
import type { TaskItem } from "../../frontend/lib/tasks-data";
import { chooseValue } from "./helpers/listbox";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// Static import cannot work here: happy-dom must load after the hoisted `node:vm` mock and the InertVmScript class are initialized.
const { Window } = await import("happy-dom");

describe("task-backed board model", () => {
  it("uses the four canonical non-canceled columns and legal task transitions", () => {
    expect(BOARD_STATUSES).toEqual(["todo", "doing", "blocked", "done"]);
    expect(boardStatusTargets("todo")).toEqual(["doing", "done", "canceled"]);
    expect(boardStatusTargets("doing")).toEqual(["todo", "blocked", "done", "canceled"]);
    expect(boardStatusTargets("blocked")).toEqual(["todo", "doing", "done", "canceled"]);
    expect(boardStatusTargets("done")).toEqual(["todo"]);
  });

  it("parses and writes independent bounded pagination for each column", () => {
    const parsed = parseBoardSearch("?todoPage=2&todoPageSize=50&doingPage=3&doingPageSize=100&canceledPage=9");
    expect(parsed).toEqual({
      todo: { page: 2, pageSize: 50 },
      doing: { page: 3, pageSize: 100 },
      blocked: { page: 1, pageSize: 20 },
      done: { page: 1, pageSize: 20 },
    });
    expect(writeBoardColumnSearch("?doingPage=3&doingPageSize=100", "todo", { page: 2, pageSize: 50 }))
      .toBe("?doingPage=3&doingPageSize=100&todoPage=2&todoPageSize=50");
    expect(writeBoardColumnSearch("?todoPage=2&todoPageSize=50&doingPage=3", "todo", { page: 1, pageSize: 20 }))
      .toBe("?doingPage=3");
  });
});

describe("task-backed boards page", () => {
  it("renders four localized columns as independent scroll regions until the route wires page controls", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const columns = readyColumns();
    columns.todo = ready([task("todo", "待办任务", "todo-1"), task("canceled", "不应出现", "canceled-1")], 21);
    const html = renderToStaticMarkup(<BoardsPage locale={locale} columns={columns} onLoadMore={vi.fn()} onStatusChange={vi.fn()} onRetry={vi.fn()} />);

    expect(html).toContain("data-board-columns=");
    expect(BOARD_STATUSES.every((status) => html.includes(`data-board-column="${status}"`))).toBe(true);
    expect(html).toContain(frontendText(locale, "TASKS_STATUS_TODO"));
    expect(html).toContain(frontendText(locale, "TASKS_STATUS_DOING"));
    expect(html).toContain(frontendText(locale, "TASKS_STATUS_BLOCKED"));
    expect(html).toContain(frontendText(locale, "TASKS_STATUS_DONE"));
    expect(html).toContain("待办任务");
    expect(html).not.toContain("不应出现");
    // The board fills the desktop height column by column and keeps the task marker.
    expect(html).toContain("lg:h-full lg:min-h-0");
    expect(html).toContain("lg:min-h-0 lg:flex-1");
    expect(html).toContain("lg:items-stretch");
    expect(BOARD_STATUSES.every((status) => html.includes(`aria-label="${frontendText(locale, "BOARDS_COLUMN_LIST")}: ${frontendText(locale, taskStatusKey(status))}"`))).toBe(true);
    expect(html).toContain('data-board-task="todo-1"');
    expect(html).not.toContain("data-pagination");
  });

  it("keeps one titled h1 above the columns in every column state", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    const columns: BoardColumnStates = { todo: { kind: "loading" }, doing: { kind: "error" }, blocked: ready([]), done: ready([task("done", "Shipped", "done-1")]) };
    const html = renderToStaticMarkup(<BoardsPage locale={locale} columns={columns} onLoadMore={vi.fn()} onStatusChange={vi.fn()} onRetry={vi.fn()} recordBlocked unknownMove={{ task: { id: "task-1", title: "Alpha" }, source: "todo", target: "done" }} />);

    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Boards<\/h1>/u);
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("data-board-move-record-blocked"));
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("data-board-move-unknown"));
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("data-board-columns="));
  });

  it("gives every column its own desktop pager with that column's totals", () => {
    const locale = createLocaleRuntime();
    const columns = readyColumns();
    columns.todo = ready([task("todo", "Alpha", "todo-1")], 41);
    columns.blocked = ready([task("blocked", "Stuck", "blocked-1")], 5);
    const html = renderToStaticMarkup(<BoardsPage locale={locale} columns={columns} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} onStatusChange={vi.fn()} onRetry={vi.fn()} />);

    expect(html.match(/data-pagination-desktop/g)).toHaveLength(4);
    expect(html).toContain("Total");
    expect(html).toContain("41");
    expect(html).toContain("1–20");
    expect(html).not.toContain(frontendText(locale, "LIST_END_OF_LIST"));
  });

  it("renders locale-backed loading, error, and empty states per column", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const columns: BoardColumnStates = {
      todo: { kind: "loading" },
      doing: { kind: "error" },
      blocked: ready([]),
      done: ready([task("done", "完成项", "done-1")]),
    };
    const html = renderToStaticMarkup(<BoardsPage locale={locale} columns={columns} onLoadMore={vi.fn()} onStatusChange={vi.fn()} onRetry={vi.fn()} />);

    expect(html).toContain(frontendText(locale, "BOARDS_COLUMN_LOADING"));
    expect(html).toContain(frontendText(locale, "BOARDS_COLUMN_ERROR"));
    expect(html).toContain(frontendText(locale, "BOARDS_COLUMN_EMPTY"));
    expect(html).toContain(frontendText(locale, "BOARDS_RETRY"));
    expect(html).not.toContain("BOARDS_COLUMN_");
  });

  it("exposes keyboard-operable legal status actions without drag and drop", () => {
    const locale = createLocaleRuntime();
    const columns = readyColumns();
    columns.doing = ready([task("doing", "Alpha", "task-alpha")]);
    const html = renderToStaticMarkup(<BoardsPage locale={locale} columns={columns} actionPendingId="task-alpha" onLoadMore={vi.fn()} onStatusChange={vi.fn()} onRetry={vi.fn()} />);

    expect(html).toContain('aria-label="Move Alpha from Doing"');
    // Each legal target is a beUI listbox option carrying both its value hook and its label.
    expect(html).toMatch(/data-value="todo"[^>]*>To do<\/button>/);
    expect(html).toMatch(/data-value="blocked"[^>]*>Blocked<\/button>/);
    expect(html).toMatch(/data-value="done"[^>]*>Done<\/button>/);
    expect(html).toMatch(/data-value="canceled"[^>]*>Canceled<\/button>/);
    expect(html).toContain("disabled");
    expect(html).not.toContain("draggable=");
  });

  it("keeps the optimistic move marker while the pending column stays writable-blocked", () => {
    const locale = createLocaleRuntime();
    const columns = readyColumns();
    columns.done = { ...ready([task("done", "Shipped", "task-done")]), pending: true };
    const html = renderToStaticMarkup(<BoardsPage locale={locale} columns={columns} actionPendingId="task-other" onLoadMore={vi.fn()} onStatusChange={vi.fn()} onRetry={vi.fn()} />);

    expect(html).toContain('data-board-task="task-done"');
    expect(html).not.toContain("data-optimistic");
    expect(html).toContain("aria-busy");
  });
});

describe("boards paging surface", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const en = createLocaleRuntime({ navigatorLanguage: "en" });

  // The shared table switches surface on Tailwind's `lg` edge.
  const setViewport = (desktop: boolean) => Object.defineProperty(browser, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: desktop && query === "(min-width: 1024px)", media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
  });

  beforeEach(() => {
    browser = new Window({ url: "https://app.test/boards" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, HTMLElement: browser.HTMLElement, navigator: browser.navigator, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    setViewport(true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  const todoItems = () => Array.from({ length: 4 }, (_, index) => task("todo", `Alpha ${index + 1}`, `todo-${index + 1}`));
  const column = (status: (typeof BOARD_STATUSES)[number]) => container.querySelector(`[data-board-column="${status}"]`) as HTMLElement;

  const render = async (nodes: BoardColumnStates, handlers: Record<string, unknown>) => {
    await act(async () => root.render(<BoardsPage locale={en} columns={nodes} onRetry={() => undefined} onStatusChange={() => undefined} {...handlers} />));
  };

  it("routes each column's page controls with that column's status", async () => {
    const onPageChange = vi.fn(); const onPageSizeChange = vi.fn();
    const columns = readyColumns();
    columns.todo = ready(todoItems(), 41);
    await render(columns, { onLoadMore: vi.fn(), onPageChange, onPageSizeChange });

    const todo = column("todo");
    expect(todo.textContent).toContain("1–20");
    await act(async () => (todo.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click());
    expect(onPageChange).toHaveBeenCalledWith("todo", 2);
    const sizeTrigger = todo.querySelector('button[aria-haspopup="listbox"][aria-label="Rows per page"]');
    await chooseValue(sizeTrigger, "50");
    expect(onPageSizeChange).toHaveBeenCalledWith("todo", 50);
    expect(container.querySelectorAll("[data-pagination-desktop]")).toHaveLength(4);
  });

  it("keeps every column's append feed and hides the pagers on narrow viewports", async () => {
    setViewport(false);
    const onLoadMore = vi.fn(); const onPageChange = vi.fn();
    const columns = readyColumns();
    columns.doing = ready([task("doing", "Beta 1", "doing-1"), task("doing", "Beta 2", "doing-2"), task("doing", "Beta 3", "doing-3"), task("doing", "Beta 4", "doing-4")], 41);
    await render(columns, { onLoadMore, onPageChange, onPageSizeChange: vi.fn() });

    expect(container.querySelector("[data-pagination-desktop]")).toBeNull();
    expect(container.querySelector("[data-pagination-mobile]")).toBeNull();
    const scroller = column("doing").querySelector("table")!.parentElement as HTMLElement;
    await act(async () => scroller.dispatchEvent(new browser.Event("scroll") as unknown as Event));
    expect(onLoadMore).toHaveBeenCalledWith("doing");
    expect(onPageChange).not.toHaveBeenCalled();
  });
});

function readyColumns(): BoardColumnStates {
  return { todo: ready([]), doing: ready([]), blocked: ready([]), done: ready([]) };
}

function ready(items: TaskItem[], total = items.length): BoardColumnStates["todo"] {
  return { kind: "ready", items, pagination: { page: 1, pageSize: 20, total, totalPages: total === 0 ? 0 : Math.ceil(total / 20) }, pending: false };
}

function task(status: TaskItem["status"], title: string, id: string): TaskItem {
  return { id, title, notes: "", status, progress: status === "done" ? 100 : 0, priority: "medium", dueAt: null, completedAt: null, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:00:00.000Z" };
}
