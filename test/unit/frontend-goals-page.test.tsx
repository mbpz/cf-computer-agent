// @vitest-environment node
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { GoalsPage } from "../../frontend/pages/goals-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("Goals page", () => {
  it("renders goal controls without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "ready", items: [{
      id: "goal-1", clientKey: "goal-1", title: "发布 2.0", description: "完成目标切片", status: "active", progress: 40,
      targetAt: null, createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z",
    }], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } }} onCreate={vi.fn()} onManageTasks={vi.fn()} onStatusChange={vi.fn()} onProgressChange={vi.fn()} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "GOALS_TITLE"));
    expect(html).toContain(frontendText(locale, "GOALS_CREATE"));
    expect(html).toContain(frontendText(locale, "GOALS_PROGRESS"));
    expect(html).toContain('id="manage-goal-tasks-goal-1"');
    expect(html).not.toContain("undefined");
  });

  it("renders the desktop pager over the loaded window and retires the scroll label", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } }} onCreate={vi.fn()} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(html).toContain("data-pagination-desktop");
    expect(html).toContain("data-pagination-mobile");
    expect(html).toContain(frontendText(locale, "PAGINATION_TOTAL"));
    expect(html).toContain(frontendText(locale, "PAGINATION_VISIBLE"));
    expect(html).toContain(frontendText(locale, "PAGINATION_ROWS_PER_PAGE"));
    expect(html).not.toContain(frontendText(locale, "GOALS_LOAD_MORE"));
  });

  it("leaves the pager out when the route supplies no page controls", () => {
    const locale = createLocaleRuntime();
    const html = renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } }} />);
    expect(html).not.toContain("data-pagination-desktop");
    expect(html).not.toContain("data-pagination-mobile");
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain(frontendText(locale, "GOALS_RETRY"));
    expect(renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "ready", items: [] }} />)).toContain(frontendText(locale, "GOALS_EMPTY"));
  });
});

describe("Goals create dialog", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const ready = { kind: "ready" as const, items: [] };
  const intentKey = "memory-garden:planning-create:v1:alice:GOALS";
  const unresolved = JSON.stringify({ version: 1, memberId: "alice", module: "GOALS", intent: { id: "intent-1", clientKey: "client-1", title: "Durable original", description: null }, acknowledged: false });
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/goals" });
    for (const [name, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(name, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  const dialog = () => container.querySelector("[data-goals-create-dialog]");
  const trigger = () => container.querySelector<HTMLButtonElement>("[data-goals-create-open]")!;
  const title = () => container.querySelector<HTMLInputElement>(`input[aria-label="${frontendText(locale, "GOALS_TITLE_FIELD")}"]`)!;
  const submit = () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === frontendText(locale, "GOALS_CREATE"))!;
  async function mount(props: Record<string, unknown> = {}) { await act(async () => root.render(<GoalsPage locale={locale} state={ready} createMemberId="alice" {...props} />)); }
  async function click(node: HTMLElement) { await act(async () => node.click()); }
  async function type(value: string) {
    const node = title(); const key = Object.keys(node).find(candidate => candidate.startsWith("__reactProps$"))!;
    await act(async () => { (node as unknown as Record<string, { onChange: (event: unknown) => void }>)[key].onChange({ currentTarget: { value } }); });
  }
  it("stays closed on a plain visit, opens from the add control, and closes on cancel or Escape", async () => {
    await mount();
    expect(dialog()).toBeNull();
    const open = trigger();
    expect(open.getAttribute("aria-haspopup")).toBe("dialog"); expect(open.getAttribute("aria-expanded")).toBe("false"); expect(open.disabled).toBe(false);
    await click(open);
    expect(dialog()?.getAttribute("role")).toBe("dialog");
    expect(dialog()?.textContent).toContain(frontendText(locale, "GOALS_CREATE_TITLE"));
    expect(title()).not.toBeNull(); expect(open.getAttribute("aria-expanded")).toBe("true");
    await click(container.querySelector<HTMLButtonElement>("[data-goals-create-cancel]")!);
    expect(dialog()).toBeNull();
    await click(trigger());
    expect(dialog()).not.toBeNull(); expect(title()).not.toBeNull();
    await act(async () => dialog()!.dispatchEvent(new browser.KeyboardEvent("keydown", { key: "Escape", bubbles: true }) as unknown as Event));
    expect(dialog()).toBeNull();
  });
  it("auto-opens only for an unresolved stored record and closes once it resolves", async () => {
    browser.sessionStorage.setItem(intentKey, unresolved);
    const create = vi.fn().mockResolvedValue({});
    await mount({ onCreate: create, onCreateReadback: async () => true });
    expect(dialog()).not.toBeNull();
    expect(title().value).toBe("Durable original"); expect(title().disabled).toBe(true);
    await click(container.querySelector<HTMLButtonElement>("[data-create-retry]")!);
    await act(async () => { await vi.waitFor(() => expect(dialog()).toBeNull()); });
    expect(create).toHaveBeenCalledTimes(1);
    expect(browser.sessionStorage.getItem(intentKey)).toBeNull();
    expect(dialog()).toBeNull();
  });
  it("posts exactly one create from inside the dialog and closes it on success", async () => {
    const create = vi.fn().mockResolvedValue({});
    await mount({ onCreate: create, onCreateReadback: async () => true });
    await click(trigger());
    await type("Ship the goals dialog");
    await click(submit());
    await act(async () => { await vi.waitFor(() => expect(dialog()).toBeNull()); });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({ title: "Ship the goals dialog" });
    expect(dialog()).toBeNull(); expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });
});
