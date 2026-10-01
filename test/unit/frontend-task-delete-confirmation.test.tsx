// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { TasksPage, type TasksPageState } from "../../frontend/pages/tasks/tasks-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("task deletion confirmation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const task = { id: "task-one", title: "Same title", notes: "", status: "todo" as const, progress: 0, priority: "medium" as const, dueAt: null, completedAt: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
  const ready: TasksPageState = { kind: "ready", items: [task, { ...task, id: "task-two" }], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } };
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/tasks" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(props: Partial<React.ComponentProps<typeof TasksPage>> = {}) { await act(async () => root.render(<TasksPage locale={locale} filters={{}} state={ready} {...props} />)); }
  const button = (selector: string) => { const found = container.querySelector(selector) as HTMLButtonElement; expect(found, selector).not.toBeNull(); return found; };
  async function click(selector: string) { const target = button(selector); await act(async () => target.click()); return target; }
  const trigger = '[aria-label="Delete: Same title (task-two)"]';
  it("names the exact task, explains permanent deletion, and consumes confirmation once", async () => {
    const remove = vi.fn(); await mount({ onDelete: remove }); button(trigger).focus(); await click(trigger);
    expect(remove).not.toHaveBeenCalled(); const dialog = container.querySelector('[role="alertdialog"]'); expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Same title (task-two)"); expect(dialog?.textContent).toContain("cannot be undone"); expect(dialog?.textContent).toContain("Linked knowledge is not deleted");
    expect(browser.document.activeElement?.hasAttribute("data-cancel-action")).toBe(true); expect(container.querySelector("section")?.hasAttribute("inert")).toBe(true);
    const confirm = button('[data-confirm-action]'); await act(async () => { confirm.click(); confirm.click(); });
    expect(remove).toHaveBeenCalledExactlyOnceWith("task-two"); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it.each(["cancel", "escape", "overlay"])("%s cancels without deletion and restores focus", async (kind) => {
    const remove = vi.fn(); await mount({ onDelete: remove }); const origin = button(trigger); origin.focus(); await click(trigger);
    const dialog = container.querySelector('[role="alertdialog"]'); expect(dialog).not.toBeNull();
    if (kind === "cancel") await click('[data-cancel-action]');
    else if (kind === "escape") await act(async () => dialog!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    else await act(async () => (container.querySelector('[data-dialog-open="true"] > [aria-hidden="true"]') as HTMLElement).click());
    expect(remove).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull(); expect(browser.document.activeElement).toBe(origin);
  });
  it.each(["new list", "removed target", "page", "page size", "draft filter", "read pending", "editor", "read error", "denied", "loading", "handler removed"])("invalidates on %s and never revives an old confirmation", async (change) => {
    const remove = vi.fn(); await mount({ onDelete: remove }); await click(trigger); const confirm = button('[data-confirm-action]');
    const extra: Partial<React.ComponentProps<typeof TasksPage>> = change === "new list" ? { state: { ...ready, items: ready.items.map(item => ({ ...item })) } }
      : change === "removed target" ? { state: { ...ready, items: [task] } }
      : change === "page" ? { state: { ...ready, pagination: { ...ready.pagination, page: 2 } } }
      : change === "page size" ? { state: { ...ready, pagination: { ...ready.pagination, pageSize: 50 } } }
      : change === "draft filter" ? { filters: { q: "unsent filter" } }
      : change === "read pending" ? { pending: true } : change === "editor" ? { actionPendingId: "editor" }
      : change === "read error" ? { localLoadError: "Could not refresh" } : change === "denied" ? { state: { kind: "error", message: "Denied" } }
      : change === "loading" ? { state: { kind: "loading" } } : { onDelete: undefined };
    await mount({ onDelete: remove, ...extra }); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => confirm.click()); expect(remove).not.toHaveBeenCalled();
    await mount({ onDelete: remove }); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it.each([{ pending: true }, { actionPendingId: "other-task" }, { localLoadError: "Read failed" }, { onDelete: undefined }])("cannot start deletion from an unavailable view %j", async (extra) => {
    const remove = vi.fn(); await mount({ onDelete: remove, ...extra }); expect(button(trigger).disabled).toBe(true); await click(trigger);
    expect(remove).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("does not replace a target or run a status write from same-tick underlying actions", async () => {
    const remove = vi.fn(); const status = vi.fn(); await mount({ onDelete: remove, onStatusChange: status });
    const first = button('[aria-label="Delete: Same title (task-one)"]'); const second = button(trigger); const complete = button('[aria-label="Complete: Same title (task-two)"]');
    await act(async () => { first.click(); second.click(); complete.click(); });
    expect(remove).not.toHaveBeenCalled(); expect(status).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[role="alertdialog"]')).toHaveLength(1); expect(container.querySelector('[role="alertdialog"]')?.textContent).toContain("task-one");
    await click('[data-confirm-action]'); expect(remove).toHaveBeenCalledExactlyOnceWith("task-one");
  });
  it("uses an ID fallback, Chinese impact, and trapped keyboard focus", async () => {
    const remove = vi.fn(); await mount({ locale: createLocaleRuntime({ navigatorLanguage: "zh-CN" }), state: { ...ready, items: [{ ...task, title: "  " }] }, onDelete: remove });
    await click('[aria-label="删除: task-one"]'); const dialog = container.querySelector('[role="alertdialog"]'); expect(dialog).not.toBeNull(); expect(dialog?.textContent).toContain("无法撤销"); expect(dialog?.textContent).toContain("task-one");
    await act(async () => dialog!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }) as unknown as Event));
    expect(browser.document.activeElement?.hasAttribute("data-confirm-action")).toBe(true);
    await act(async () => dialog!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Tab", bubbles: true }) as unknown as Event));
    expect(browser.document.activeElement?.hasAttribute("data-cancel-action")).toBe(true);
  });
  it("preserves a confirmation on unrelated rerenders but clears it on unmount", async () => {
    const remove = vi.fn(); await mount({ onDelete: remove }); await click(trigger); await mount({ onDelete: remove, actionError: "Old action failed" });
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull(); const old = button('[data-confirm-action]');
    await act(async () => root.render(<p>Other route</p>)); await act(async () => old.click()); await mount({ onDelete: remove });
    expect(remove).not.toHaveBeenCalled(); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
