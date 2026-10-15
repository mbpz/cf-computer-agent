// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import type { TaskItem } from "../../frontend/lib/tasks-data";
import { TasksPage } from "../../frontend/pages/tasks/tasks-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// Static import cannot work here: happy-dom must load after the hoisted `node:vm` mock and the InertVmScript class are initialized.
const { Window } = await import("happy-dom");

function taskItem(id: string, status: TaskItem["status"] = "todo"): TaskItem {
  return { id, title: `Task ${id}`, notes: "", status, progress: status === "done" ? 100 : 0, priority: "medium", dueAt: null, completedAt: null, createdAt: "", updatedAt: "" };
}

describe("private tasks page", () => {
  it("renders filters, accessible actions, and an appended list", () => {
    const html = renderToStaticMarkup(<TasksPage filters={{ status: "doing" }} state={{ kind: "ready", items: [
      { id: "task-1", title: "Alpha", notes: "", status: "doing", progress: 20, priority: "high", dueAt: null, completedAt: null, createdAt: "", updatedAt: "" },
      { id: "task-4", title: "Alpha", notes: "", status: "todo", progress: 0, priority: "low", dueAt: null, completedAt: null, createdAt: "", updatedAt: "" },
      { id: "task-2", title: "Beta", notes: "", status: "done", progress: 100, priority: "medium", dueAt: null, completedAt: null, createdAt: "", updatedAt: "" },
      { id: "task-3", title: "   ", notes: "", status: "todo", progress: 0, priority: "low", dueAt: null, completedAt: null, createdAt: "", updatedAt: "" },
    ], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } }} onDelete={vi.fn()} onStatusChange={vi.fn()} />);
    expect(html).toContain("Alpha"); expect(html).toContain("Beta"); expect(html).toContain('aria-label="Tasks"'); expect(html).toContain('aria-label="Status"');
    expect(html).not.toContain('aria-label="Page '); expect(html).not.toContain("Load more");
    expect(html).toContain('aria-label="Complete: Alpha (task-1)"');
    expect(html).toContain('aria-label="Delete: Alpha (task-1)"');
    expect(html).toContain('aria-label="Complete: Alpha (task-4)"');
    expect(html).toContain('aria-label="Delete: Alpha (task-4)"');
    expect(html).toContain('aria-label="Reopen: Beta (task-2)"');
    expect(html).toContain('aria-label="Delete: Beta (task-2)"');
    expect(html).toContain('aria-label="Complete: task-3"');
    expect(html).toContain('aria-label="Delete: task-3"');
    expect(html).toContain('href="/messages?contextKind=task&amp;contextId=task-1"');
    expect(html).toContain(frontendText(createLocaleRuntime(), "MESSAGES_DISCUSS"));
  });

  it("renders retryable initial and local failures", () => {
    expect(renderToStaticMarkup(<TasksPage filters={{}} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain("Try search again");
    expect(renderToStaticMarkup(<TasksPage filters={{}} state={{ kind: "ready", items: [], pagination: { page: 2, pageSize: 20, total: 0, totalPages: 0 } }} localLoadError="Unable" onRetry={vi.fn()} />)).toContain("Try search again");
    const actionFailure = renderToStaticMarkup(<TasksPage filters={{}} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }} actionError="Unable to update the task." onRetry={vi.fn()} />);
    expect(actionFailure).toContain("Unable to update the task."); expect(actionFailure).not.toContain("Try search again");
  });

  it("renders a semantic loading state and a localized empty state", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const loading = renderToStaticMarkup(<TasksPage locale={locale} filters={{}} state={{ kind: "loading" }} />);
    const empty = renderToStaticMarkup(<TasksPage locale={locale} filters={{}} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }} />);

    expect(loading).toContain('aria-busy="true"');
    expect(empty).toContain(frontendText(locale, "TASKS_EMPTY"));
    expect(empty).not.toContain('aria-label="Page ');
    expect(empty).not.toContain("Load more");
  });
});

describe("tasks page paging surface", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const en = createLocaleRuntime({ navigatorLanguage: "en" });

  // The shared table switches surface on Tailwind's `lg` edge.
  const setViewport = (desktop: boolean) => Object.defineProperty(browser, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: desktop && query === "(min-width: 1024px)", media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
  });

  beforeEach(() => {
    browser = new Window({ url: "https://app.test/tasks" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, HTMLElement: browser.HTMLElement, navigator: browser.navigator, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    setViewport(true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  const readyState = (page: number, count = 20) => ({ kind: "ready" as const, items: Array.from({ length: count }, (_, index) => taskItem(`task-${index + 1}`)), pagination: { page, pageSize: 20 as const, total: 41, totalPages: 3 } });

  it("renders the desktop footer pager with the window metadata once the route wires page controls", () => {
    const html = renderToStaticMarkup(<TasksPage locale={en} filters={{}} state={readyState(2)} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} onLoadMore={vi.fn()} />);
    expect(html).toContain("data-pagination-desktop");
    expect(html).toContain("Total");
    expect(html).toContain("41");
    expect(html).toContain("21–40");
    expect(html).toContain('aria-label="Next page"');
    expect(html).toContain('aria-label="Page 3"');
    expect(html).not.toContain(frontendText(en, "LIST_END_OF_LIST"));
    // Desktop fills the page height instead of a capped inner viewport.
    expect(html).toContain("lg:h-full lg:min-h-0");
  });

  it("invokes the route page controls on desktop without pulling the append feed", async () => {
    const onPageChange = vi.fn(); const onPageSizeChange = vi.fn(); const onLoadMore = vi.fn();
    await act(async () => root.render(<TasksPage locale={en} filters={{}} state={readyState(2)} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} onLoadMore={onLoadMore} />));
    expect(container.textContent).toContain("21–40");
    await act(async () => (container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click());
    expect(onPageChange).toHaveBeenCalledWith(3);
    const select = container.querySelector<HTMLSelectElement>('select[aria-label="Rows per page"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLSelectElement.prototype, "value")!.set!.call(select, "50"); select.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event); });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("keeps the append feed and hides the pager on narrow viewports", async () => {
    setViewport(false);
    const onLoadMore = vi.fn(); const onPageChange = vi.fn();
    await act(async () => root.render(<TasksPage locale={en} filters={{}} state={readyState(1, 12)} onPageChange={onPageChange} onPageSizeChange={vi.fn()} onLoadMore={onLoadMore} />));
    expect(container.querySelector("[data-pagination-desktop]")).toBeNull();
    expect(container.querySelector("[data-pagination-mobile]")).toBeNull();
    const scroller = container.querySelector("table")!.parentElement as HTMLElement;
    await act(async () => scroller.dispatchEvent(new browser.Event("scroll") as unknown as Event));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onPageChange).not.toHaveBeenCalled();

    await act(async () => root.render(<TasksPage locale={en} filters={{}} state={readyState(3, 12)} onPageChange={onPageChange} onPageSizeChange={vi.fn()} onLoadMore={onLoadMore} />));
    expect(container.querySelector('p[role="status"]')?.textContent).toBe(frontendText(en, "LIST_END_OF_LIST"));
  });
});
