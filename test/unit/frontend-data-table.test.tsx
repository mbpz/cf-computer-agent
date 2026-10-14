// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTable } from "../../frontend/components/data-table";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("shared data table", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const en = createLocaleRuntime({ navigatorLanguage: "en" });
  const zh = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/tasks" });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("HTMLElement", browser.HTMLElement);
    vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("getComputedStyle", browser.getComputedStyle.bind(browser));
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `row-${index + 1}`, title: `Row ${index + 1}` }));
  const columns = [{ key: "title", header: "Title", cell: (row: { id: string; title: string }) => <span data-row-title>{row.title}</span> }];
  const mount = async (props: Partial<Parameters<typeof DataTable<{ id: string; title: string }>>[0]> = {}) => {
    const merged = { locale: en, rows: rows(3), columns, rowId: (row: { id: string }) => row.id, ariaLabel: "Rows", emptyState: <span>Nothing here</span>, ...props } as Parameters<typeof DataTable<{ id: string; title: string }>>[0];
    await act(async () => root.render(<DataTable {...merged} />));
    return merged;
  };

  it("renders every loaded row with the table's accessible name, without virtualizing them away", async () => {
    await mount({ rows: rows(12) });
    expect(container.querySelector("table")?.getAttribute("aria-label")).toBe("Rows");
    expect(container.querySelectorAll("[data-row-title]")).toHaveLength(12);
    expect(container.querySelector("[data-pagination-desktop]")).toBeNull();
  });

  it("shows the empty state node in the body when nothing has loaded", async () => {
    await mount({ rows: [] });
    expect(container.textContent).toContain("Nothing here");
    expect(container.querySelectorAll("[data-row-title]")).toHaveLength(0);
  });

  it("pulls the next page when the loaded window cannot fill the viewport, and leaves a full window alone", async () => {
    const onLoadMore = vi.fn();
    await mount({ rows: rows(1), hasMore: true, onLoadMore });
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    onLoadMore.mockClear();
    await mount({ rows: rows(3), hasMore: true, onLoadMore });
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("asks for the next page from the body's near-bottom scroll, once per dwell and never while loading", async () => {
    const onLoadMore = vi.fn();
    await mount({ rows: rows(12), hasMore: true, onLoadMore });
    const scroller = container.querySelector("table")!.parentElement as HTMLElement;
    const scrollToEnd = () => act(async () => {
      Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true });
      Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true });
      scroller.scrollTop = 500;
      scroller.dispatchEvent(new browser.Event("scroll") as unknown as Event);
    });
    await scrollToEnd();
    await scrollToEnd();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    onLoadMore.mockClear();
    await act(async () => root.render(<DataTable locale={en} rows={rows(12)} columns={columns} rowId={(row) => row.id} ariaLabel="Rows" emptyState={<span>Nothing here</span>} hasMore onLoadMore={onLoadMore} loading />));
    await scrollToEnd();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("announces loading and end of list in the page locale, and stays silent when idle", async () => {
    const status = () => container.querySelector('p[role="status"]')?.textContent;
    await mount({ rows: rows(3), locale: en });
    expect(status()).toBe("No more items");
    await act(async () => root.render(<DataTable locale={zh} rows={rows(3)} columns={columns} rowId={(row) => row.id} ariaLabel="Rows" emptyState={<span>Nothing here</span>} hasMore onLoadMore={() => undefined} loading />));
    expect(status()).toBe("正在加载更多");
    await act(async () => root.render(<DataTable locale={zh} rows={[]} columns={columns} rowId={(row) => row.id} ariaLabel="Rows" emptyState={<span>Nothing here</span>} />));
    expect(status()).toBeUndefined();
  });
});
