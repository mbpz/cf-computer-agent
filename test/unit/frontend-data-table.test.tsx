// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "../../frontend/components/data-table";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { chooseValue } from "./helpers/listbox";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

type Row = { id: string; title: string };

describe("shared data table", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const en = createLocaleRuntime({ navigatorLanguage: "en" });
  const zh = createLocaleRuntime({ navigatorLanguage: "zh-CN" });

  // The table switches surface on Tailwind's `lg` edge, so the viewport decides
  // whether the pager or the feed is present.
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

  const rows = (count: number): Row[] => Array.from({ length: count }, (_, index) => ({ id: `row-${index + 1}`, title: `Row ${index + 1}` }));
  const columns = [{ key: "title", header: "Title", cell: (row: Row) => <span data-row-title>{row.title}</span> }];
  const page = { page: 1, pageSize: 20 as const, total: 45, totalPages: 3 };
  const mount = async (props: Record<string, unknown> = {}) => {
    await act(async () => root.render(<DataTable locale={en} rows={rows(3)} columns={columns} rowId={(row: Row) => row.id} ariaLabel="Rows" emptyState={<span>Nothing here</span>} pagination={page} onPageChange={() => undefined} onPageSizeChange={() => undefined} hasMore onLoadMore={() => undefined} {...props} />));
  };
  const scroller = () => container.querySelector("table")!.parentElement as HTMLElement;

  it("renders every loaded row with the table's accessible name, never virtualizing them away", async () => {
    await mount({ rows: rows(12) });
    expect(container.querySelector("table")?.getAttribute("aria-label")).toBe("Rows");
    expect(container.querySelectorAll("[data-row-title]")).toHaveLength(12);
  });

  it("shows the empty state node in the body when nothing has loaded", async () => {
    await mount({ rows: [] });
    expect(container.textContent).toContain("Nothing here");
    expect(container.querySelectorAll("[data-row-title]")).toHaveLength(0);
  });

  it("pages through the footer pager on desktop with the server totals", async () => {
    const onPageChange = vi.fn(); const onPageSizeChange = vi.fn();
    await mount({ rows: rows(20), onPageChange, onPageSizeChange });
    expect(container.textContent).toContain("Total");
    expect(container.textContent).toContain("45");
    expect(container.textContent).toContain("1–20");
    await act(async () => (container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click());
    expect(onPageChange).toHaveBeenCalledWith(2);
    const select = container.querySelector<HTMLButtonElement>('button[aria-label="Rows per page"][aria-haspopup="listbox"]')!;
    expect(select).toBeTruthy();
    await chooseValue(select, "50");
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it("disables the pager and keeps the loaded rows while a page is in flight", async () => {
    await mount({ rows: rows(20), loading: true });
    expect(container.querySelectorAll("[data-row-title]")).toHaveLength(20);
    expect((container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps the feed instead of the pager on narrow viewports and appends on scroll", async () => {
    setViewport(false);
    const onLoadMore = vi.fn(); const onPageChange = vi.fn();
    await mount({ rows: rows(12), onLoadMore, onPageChange });
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.textContent).not.toContain("Rows per page");
    await act(async () => scroller().dispatchEvent(new browser.Event("scroll") as unknown as Event));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("announces the feed state in the page locale on narrow viewports only", async () => {
    setViewport(false);
    await act(async () => root.render(<DataTable locale={zh} rows={rows(3)} columns={columns} rowId={(row: Row) => row.id} ariaLabel="行" emptyState={<span>空</span>} hasMore={false} onLoadMore={() => undefined} />));
    expect(container.querySelector('p[role="status"]')?.textContent).toBe("已加载全部");
    setViewport(true);
    await mount({ hasMore: false, rows: rows(3) });
    expect(container.querySelector('p[role="status"]')).toBeNull();
  });

  it("fills its parent on desktop and uses a capped viewport otherwise", async () => {
    await mount({ fill: true, pagination: { page: 1, pageSize: 20, total: 3, totalPages: 1 } });
    expect(scroller().style.height).toBe("");
    expect(scroller().className).toContain("flex-1");
    setViewport(false);
    await mount({ fill: true, rows: rows(3) });
    expect(scroller().style.height).toBe("213px");
  });

  it("localizes the pager labels without leaking English defaults", async () => {
    await act(async () => root.render(<DataTable locale={zh} rows={rows(3)} columns={columns} rowId={(row: Row) => row.id} ariaLabel="行" emptyState={<span>空</span>} pagination={page} onPageChange={() => undefined} onPageSizeChange={() => undefined} />));
    expect(container.textContent).toContain("总计");
    expect(container.querySelector('button[aria-label="下一页"]')).not.toBeNull();
  });
});
