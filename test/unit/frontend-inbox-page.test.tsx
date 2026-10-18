// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { saveInboxIntent } from "../../frontend/lib/inbox-create-intent";
import { InboxPage } from "../../frontend/pages/inbox-page";
import { chooseValue } from "./helpers/listbox";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// happy-dom loads only after the vm doubles above are registered: its ESM entry pulls in node:vm.
const { Window } = await import("happy-dom");

const paging = { onFilterChange: vi.fn(), onLoadMore: vi.fn() };
describe("Inbox page", () => {
  it("renders bilingual recovery, archive and promotion affordances without undefined", async () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    // The capture surface is a portalled dialog (`DialogContent` now always
    // portals and renders after its mount effect), so static markup cannot see
    // it. Mount the page in a DOM and read the same copy from the document.
    const browser = new Window({ url: "https://app.test/inbox" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    const container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<InboxPage {...paging} locale={locale} state={{ kind: "ready", items: [{
          id: "inbox-1", clientKey: "capture-1", kind: "text", content: "整理首页信息架构", sourceUrl: null,
          status: "inbox", promotedTaskId: null, promotedSubmissionId: null,
          createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z",
        }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }} onCreate={vi.fn()} onStatusChange={vi.fn()} onPromoteTask={vi.fn()} />);
      });
      const html = browser.document.body.textContent ?? "";
      expect(html).toContain(frontendText(locale, "INBOX_TITLE"));
      expect(html).toContain(frontendText(locale, "INBOX_CAPTURE_TITLE"));
      // SSR without a member/storage must not offer an unsafe fresh POST.
      expect(html).toContain(frontendText(locale, "INBOX_CREATE_STORAGE_BLOCKED"));
      expect(html).toContain(frontendText(locale, "INBOX_PROMOTE_TASK"));
      expect(html).toContain(frontendText(locale, "INBOX_STATUS_FILTER"));
      expect(html).not.toContain("undefined");
    } finally {
      await act(async () => root.unmount());
      browser.close();
      vi.unstubAllGlobals();
    }
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<InboxPage {...paging} locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<InboxPage {...paging} locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain("Try again");
    expect(renderToStaticMarkup(<InboxPage {...paging} locale={locale} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }} />)).toContain(frontendText(locale, "INBOX_EMPTY"));
  });
});

describe("inbox quick capture", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, clientKey: id, kind: "text" as const, content: `Row ${id}`, sourceUrl: null, status: "inbox" as const, promotedTaskId: null, promotedSubmissionId: null, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.001Z", ...extra });
  const ready = (items = [item("one")], pagination = { page: 1, pageSize: 20 as const, total: 1, totalPages: 1 }) => ({ kind: "ready" as const, items, pagination });
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/inbox" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(extra: Record<string, unknown> = {}) {
    await act(async () => root.render(<InboxPage locale={locale} state={ready()} createMemberId="alice" onFilterChange={() => {}} {...extra} />));
  }
  const dialog = () => document.querySelector("[data-inbox-capture-dialog]");
  const trigger = () => container.querySelector<HTMLButtonElement>("[data-inbox-capture-open]")!;
  const composer = () => document.querySelector<HTMLTextAreaElement>("textarea")!;
  const capture = () => [...document.querySelectorAll("button")].find(node => node.textContent === "Add to inbox") as HTMLButtonElement;
  async function click(node: HTMLButtonElement) {
    expect(node).toBeTruthy();
    const { promise, resolve } = Promise.withResolvers<void>();
    await act(async () => { node.click(); setTimeout(resolve, 0); await promise; });
  }
  async function settle(condition: () => boolean) {
    for (let attempt = 0; attempt < 20 && !condition(); attempt += 1) {
      const { promise, resolve } = Promise.withResolvers<void>();
      await act(async () => { setTimeout(resolve, 1); await promise; });
    }
    expect(condition()).toBe(true);
  }
  async function type(value: string) {
    const node = composer();
    const prop = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
    await act(async () => { (node as unknown as Record<string, { onChange: (event: { currentTarget: { value: string } }) => void }>)[prop]!.onChange(({ currentTarget: { value }, target: { value } }) as never); });
  }

  it("opens the composer from the header action and dismisses it after one confirmed creation", async () => {
    const create = vi.fn(async () => ({})); const readback = vi.fn(async () => true);
    await mount({ onCreate: create, onCreateReadback: readback });
    expect(dialog()).toBeNull(); expect(trigger().getAttribute("aria-expanded")).toBe("false");
    await click(trigger());
    expect(dialog()?.getAttribute("role")).toBe("dialog"); expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector("section")?.hasAttribute("inert")).toBe(true);
    await type("File the invoice note");
    await click(capture());
    await settle(() => dialog() === null);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toEqual(expect.objectContaining({ kind: "text", content: "File the invoice note", sourceUrl: null }));
    expect(readback).toHaveBeenCalledTimes(1);
    await click(trigger());
    expect(composer().value).toBe(""); expect(composer().disabled).toBe(false);
  });

  it("reopens an unresolved capture on entry instead of resending it", async () => {
    saveInboxIntent("alice", { id: "capture-1", clientKey: "key-1", kind: "text", content: "Recovered note", sourceUrl: null });
    const create = vi.fn(async () => ({}));
    await mount({ onCreate: create });
    expect(dialog()).not.toBeNull(); expect(composer().value).toBe("Recovered note");
    expect(document.querySelector("[data-create-retry]")).not.toBeNull();
    expect(trigger().hasAttribute("data-inbox-capture-pending")).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it("keeps the status filter and the desktop pager wired to the list query", async () => {
    const filter = vi.fn(); const pageChange = vi.fn(); const sizeChange = vi.fn();
    await mount({ onFilterChange: filter, onPageChange: pageChange, onPageSizeChange: sizeChange, status: "inbox", state: ready([item("one")], { page: 1, pageSize: 20, total: 43, totalPages: 3 }) });
    // The filter is the shared beUI listbox: the native select is gone but the
    // historical accessible name and its place above the table survive.
    expect(container.querySelector('select[aria-label="Inbox status"]')).toBeNull();
    const trigger = container.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!;
    expect(trigger.querySelector(".sr-only")?.textContent).toBe("Inbox status");
    expect(container.querySelector('[role="option"][aria-selected="true"]')?.textContent).toBe("Inbox");
    const section = container.querySelector("section")!;
    const table = section.querySelector("table")!;
    const slots = [...section.children];
    expect(slots.findIndex(child => child.contains(trigger))).toBeLessThan(slots.findIndex(child => child.contains(table)));
    await act(async () => trigger.click());
    const archived = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(node => node.textContent === "Archived")!;
    await act(async () => archived.click());
    expect(filter).toHaveBeenCalledExactlyOnceWith("archived");
    await click(container.querySelector<HTMLButtonElement>('[data-pagination-desktop] button[aria-label="Next page"]')!);
    expect(pageChange).toHaveBeenCalledExactlyOnceWith(2);
    const size = container.querySelector<HTMLButtonElement>('button[aria-label="Rows per page"][aria-haspopup="listbox"]')!;
    expect(size).toBeTruthy();
    await chooseValue(size, "50");
    expect(sizeChange).toHaveBeenCalledExactlyOnceWith(50);
  });

  it("keeps the filter label, row action labels and disabled conditions", async () => {
    const state = ready([item("one"), item("two", { status: "archived" }), item("three", { status: "promoted", promotedTaskId: "task-1" })], { page: 1, pageSize: 20, total: 3, totalPages: 1 });
    await mount({ state, pending: true, actionError: "Nope" });
    expect(container.textContent).toContain("Inbox status");
    expect(container.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Nope");
    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Archive"]')!.disabled).toBe(true);
    expect(container.querySelector('button[aria-label="Restore"]')?.textContent).toBe("Restore");
    expect(container.querySelector('button[aria-label="Turn into task"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Open task"]')).not.toBeNull();
  });

  it("keeps one titled header on first load and after a read failure", async () => {
    await act(async () => root.render(<InboxPage locale={locale} state={{ kind: "loading" }} createMemberId="alice" onFilterChange={() => {}} />));
    const headings = () => [...container.querySelectorAll("h1")];
    expect(headings()).toHaveLength(1);
    expect(headings()[0]!.textContent).toBe(frontendText(locale, "INBOX_TITLE"));
    expect(container.textContent).toContain(frontendText(locale, "INBOX_PRIVATE_BADGE"));
    expect(container.querySelector('[data-page-state="loading"]')).not.toBeNull();
    expect(container.querySelector("[data-inbox-capture-open]")).not.toBeNull();
    expect(container.querySelector('button[aria-haspopup="listbox"]')).not.toBeNull();
    await act(async () => root.render(<InboxPage locale={locale} state={{ kind: "error", message: "Denied" }} createMemberId="alice" onRetry={() => {}} onFilterChange={() => {}} />));
    expect(headings()).toHaveLength(1);
    expect(container.querySelector('[data-page-state="error"]')).not.toBeNull();
    expect(container.textContent).toContain("Denied");
    expect(container.querySelector("[data-inbox-capture-open]")).not.toBeNull();
    expect(container.querySelector('button[aria-haspopup="listbox"]')).not.toBeNull();
    expect(container.querySelector("[data-applied-filters]")).toBeNull();
  });

  it("shows a removable status chip and clear-all while a status filter is active", async () => {
    const filter = vi.fn();
    await mount({ onFilterChange: filter, status: "archived", state: ready([item("one")]) });
    const applied = container.querySelector("[data-applied-filters]")!;
    expect(applied.textContent).toContain("Inbox status: Archived");
    await click(applied.querySelector<HTMLButtonElement>('[aria-label="Clear all: Inbox status: Archived"]')!);
    expect(filter).toHaveBeenCalledExactlyOnceWith(undefined);
    filter.mockClear();
    await click(container.querySelector<HTMLButtonElement>("[data-filters-clear]")!);
    expect(filter).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
