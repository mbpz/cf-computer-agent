// @vitest-environment node
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { ProjectsPage } from "../../frontend/pages/projects-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const project = { id: "project-1", clientKey: "project-1", title: "发布 2.0", description: "完成工作台聚合", status: "active" as const, progress: 55, targetAt: null, createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z" };
const summary = { goalCount: 2, taskCount: 4, completedTaskCount: 1, goals: [{ id: "goal-1", title: "稳定发布" }] };

describe("Projects page", () => {
  it("renders project summary controls without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "ready", items: [project], summaries: { "project-1": summary }, nextCursor: "cursor-2" }} onCreate={vi.fn()} onStatusChange={vi.fn()} onLoadMore={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "PROJECTS_TITLE"));
    expect(html).toContain(frontendText(locale, "PROJECTS_CREATE"));
    expect(html).toContain(frontendText(locale, "PROJECTS_TASKS"));
    expect(html).toContain(frontendText(locale, "PROJECTS_COLUMN_PROJECT"));
    expect(html).toContain('data-project-id="project-1"');
    expect(html).not.toContain("undefined");
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain(frontendText(locale, "PROJECTS_RETRY"));
    expect(renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "ready", items: [], summaries: {} }} />)).toContain(frontendText(locale, "PROJECTS_EMPTY"));
  });

  it("keeps one titled header with its private status through loading and a read failure", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    const loading = renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "loading" }} />);
    expect([...loading.matchAll(/<h1[ >]/g)]).toHaveLength(1);
    expect(loading).toContain(frontendText(locale, "PROJECTS_TITLE"));
    expect(loading).toContain(frontendText(locale, "PROJECTS_PRIVATE_BADGE"));
    expect(loading).toContain('data-page-state="loading"');
    expect(loading).toContain("data-projects-create-open");
    expect(loading).not.toContain('aria-haspopup="listbox"');
    const failed = renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "error", message: "Denied" }} onRetry={vi.fn()} />);
    expect([...failed.matchAll(/<h1[ >]/g)]).toHaveLength(1);
    expect(failed).toContain(frontendText(locale, "PROJECTS_TITLE"));
    expect(failed).toContain('data-page-state="error"');
    expect(failed).toContain("data-projects-create-open");
    expect(failed).toContain("Denied");
  });

  it("keeps a per-row summary retry and pages the window from the footer pager", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<ProjectsPage locale={locale} state={{ kind: "ready", items: [project], summaries: {}, pagination: { page: 1, pageSize: 20, total: 40, totalPages: 2 } }} onRetrySummary={vi.fn()} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(html).toContain('data-summary-retry');
    expect(html).toContain(frontendText(locale, "PROJECTS_SUMMARY_FAILED"));
    expect(html).toContain("data-pagination-desktop");
    expect(html).toContain("data-pagination-mobile");
    expect(html).toContain(frontendText(locale, "PAGINATION_TOTAL"));
    expect(html).not.toContain(frontendText(locale, "PROJECTS_LOAD_MORE"));
  });

  it("follows the requested window and keeps the pager off without page controls", () => {
    const locale = createLocaleRuntime();
    const base = { kind: "ready", items: [project], summaries: { "project-1": summary } } as const;
    const first = renderToStaticMarkup(<ProjectsPage locale={locale} state={{ ...base, pagination: { page: 1, pageSize: 20, total: 40, totalPages: 2 } }} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} onLoadMore={vi.fn()} />);
    expect(first).toContain("data-pagination-desktop");
    expect(first).toContain("1–20");
    expect(first).toContain(">40<");
    const last = renderToStaticMarkup(<ProjectsPage locale={locale} state={{ ...base, pagination: { page: 2, pageSize: 20, total: 40, totalPages: 2 } }} onLoadMore={vi.fn()} />);
    expect(last).not.toContain("data-pagination-desktop");
    expect(last).not.toContain(frontendText(locale, "LIST_END_OF_LIST"));
    const appended = renderToStaticMarkup(<ProjectsPage locale={locale} state={{ ...base, pagination: { page: 1, pageSize: 20, total: 40, totalPages: 2 } }} onLoadMore={vi.fn()} />);
    expect(appended).not.toContain("data-pagination-desktop");
  });
});

describe("Projects create dialog", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const ready = { kind: "ready" as const, items: [], summaries: {} };
  const intentKey = "memory-garden:planning-create:v1:alice:PROJECTS";
  const unresolved = JSON.stringify({ version: 1, memberId: "alice", module: "PROJECTS", intent: { id: "intent-1", clientKey: "client-1", title: "Durable original", description: null }, acknowledged: false });
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/projects" });
    for (const [name, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(name, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  const dialog = () => container.querySelector("[data-projects-create-dialog]");
  const trigger = () => container.querySelector<HTMLButtonElement>("[data-projects-create-open]")!;
  const title = () => container.querySelector<HTMLInputElement>(`input[aria-label="${frontendText(locale, "PROJECTS_TITLE_FIELD")}"]`)!;
  const submit = () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === frontendText(locale, "PROJECTS_CREATE"))!;
  async function mount(props: Record<string, unknown> = {}) { await act(async () => root.render(<ProjectsPage locale={locale} state={ready} createMemberId="alice" {...props} />)); }
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
    expect(dialog()?.textContent).toContain(frontendText(locale, "PROJECTS_CREATE_TITLE"));
    expect(title()).not.toBeNull(); expect(open.getAttribute("aria-expanded")).toBe("true");
    await click(container.querySelector<HTMLButtonElement>("[data-projects-create-cancel]")!);
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
    await type("Ship the projects dialog");
    await click(submit());
    await act(async () => { await vi.waitFor(() => expect(dialog()).toBeNull()); });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({ title: "Ship the projects dialog" });
    expect(dialog()).toBeNull(); expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });
});
