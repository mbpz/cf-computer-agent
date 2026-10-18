// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { KnowledgePage } from "../../frontend/pages/knowledge-page";
import { SearchPage } from "../../frontend/pages/search-page";
import { chooseValue } from "./helpers/listbox";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// Static import cannot work here: happy-dom must load after the hoisted `node:vm` mock and the InertVmScript class are initialized.
const { Window } = await import("happy-dom");

const en = createLocaleRuntime({ navigatorLanguage: "en" });
let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;

beforeEach(() => {
  browser = new Window({ url: "https://app.test/search" });
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, HTMLElement: browser.HTMLElement, navigator: browser.navigator, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
  setViewport(true);
  container = browser.document.createElement("div") as unknown as HTMLElement;
  browser.document.body.append(container as unknown as Node);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

// The shared table switches surface on Tailwind's `lg` edge.
function setViewport(desktop: boolean) {
  Object.defineProperty(browser, "matchMedia", {
    configurable: true,
    value: (query: string) => ({ matches: desktop && query === "(min-width: 1024px)", media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false }),
  });
}

// A cramped strip is simulated: happy-dom has no layout, so the view tags report
// more content than the clamp can show, exactly what the real row measures.
function setStripMeasure(scrollHeight: number, clientHeight: number) {
  for (const [name, value] of [["scrollHeight", scrollHeight], ["clientHeight", clientHeight]] as const) {
    Object.defineProperty(browser.HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) { return this.hasAttribute("data-saved-view-list") ? value : 0; },
    });
  }
}

const searchState = (page: number, count = 20) => ({
  kind: "ready" as const,
  query: "docs",
  degraded: false,
  results: Array.from({ length: count }, (_, index) => ({ id: `result-${index + 1}`, knowledgeItemId: `knowledge-${index + 1}`, title: `Guide ${index + 1}`, snippet: "A match", href: `/knowledge/result-${index + 1}`, matchedFields: ["body"] })),
  pagination: { page, pageSize: 20 as const, total: 41, totalPages: 3 },
});

const knowledgeState = (page: number, count = 20) => ({
  kind: "ready" as const,
  items: Array.from({ length: count }, (_, index) => ({ id: `knowledge-${index + 1}`, title: `Guide ${index + 1}`, summary: "Short", publishedAt: "2026-08-25", tags: ["cf"] })),
  pagination: { page, pageSize: 20 as const, total: 41, totalPages: 3 },
});

// The saved views ride the same control row as the query input, so every search
// surface case renders them together.
async function renderSearch(onLoadMore = vi.fn(), count = 2) {
  const onPageChange = vi.fn(); const onPageSizeChange = vi.fn();
  await act(async () => root.render(<SearchPage
    locale={en}
    state={searchState(1, count)}
    query="docs"
    savedViews={["Platform docs", "Release notes", "Onboarding"].map((name, index) => ({ id: `view-${index + 1}`, name, updatedAt: "", filters: { v: 1 as const, q: "docs", spaceId: null, collectionId: null, tagIds: [], tagMode: "or" as const } }))}
    onSaveView={() => undefined}
    onApplyView={() => undefined}
    onDeleteView={() => undefined}
    onPageChange={onPageChange}
    onPageSizeChange={onPageSizeChange}
    onLoadMore={onLoadMore}
  />));
  return { onPageChange, onPageSizeChange, onLoadMore };
}

describe("search page control row", () => {
  it("holds the query input and the saved views in one row without clamping the input", async () => {
    setStripMeasure(90, 30);
    await renderSearch();
    const row = container.querySelector("[data-search-controls-row]")!;
    expect(row).not.toBeNull();
    expect(row.querySelector("#knowledge-search")).not.toBeNull();
    expect(row.querySelector("[data-saved-view-controls]")).not.toBeNull();
    // Only the view tags fold: the input the member types into is never clamped.
    expect(container.querySelector("[data-saved-view-list] input")).toBeNull();
    expect(row.querySelector("[data-saved-view-list]")).not.toBeNull();
  });

  it("folds the overflowing saved views to one line and expands to two", async () => {
    setStripMeasure(90, 30);
    await renderSearch();
    const strip = container.querySelector("[data-saved-view-list]") as HTMLElement;
    const toggle = container.querySelector("[data-saved-view-toggle]") as HTMLButtonElement;
    expect(strip.className).toContain("line-clamp-1");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe(frontendText(en, "COMMON_EXPAND"));

    await act(async () => toggle.click());
    expect(strip.className).toContain("line-clamp-2");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toBe(frontendText(en, "COMMON_COLLAPSE"));
    expect((container.querySelector("#knowledge-search") as HTMLInputElement).value).toBe("docs");
    expect((container.querySelector("#knowledge-search") as HTMLInputElement).disabled).toBe(false);

    await act(async () => toggle.click());
    expect(strip.className).toContain("line-clamp-1");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toBe(frontendText(en, "COMMON_EXPAND"));
  });

  it("offers no expand control while the saved views fit the row", async () => {
    setStripMeasure(30, 30);
    await renderSearch();
    expect(container.querySelector("[data-saved-view-list]")).not.toBeNull();
    expect(container.querySelector("[data-saved-view-toggle]")).toBeNull();
  });
});

describe("search page paging surface", () => {
  it("invokes the route page controls on desktop without pulling the append feed", async () => {
    const onLoadMore = vi.fn();
    const { onPageChange, onPageSizeChange } = await renderSearch(onLoadMore);
    expect(container.querySelector("[data-pagination-desktop]")).not.toBeNull();
    expect(container.textContent).toContain("1–20");
    await act(async () => (container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click());
    expect(onPageChange).toHaveBeenCalledWith(2);
    const picker = container.querySelector('button[aria-haspopup="listbox"][aria-label="Rows per page"]');
    expect(picker).not.toBeNull();
    await chooseValue(picker, "100");
    expect(onPageSizeChange).toHaveBeenCalledWith(100);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("keeps the append feed and hides the pager on narrow viewports", async () => {
    setViewport(false);
    const onLoadMore = vi.fn();
    const { onPageChange } = await renderSearch(onLoadMore, 20);
    expect(container.querySelector("[data-pagination-desktop]")).toBeNull();
    expect(container.querySelector("[data-pagination-mobile]")).toBeNull();
    const scroller = container.querySelector("table")!.parentElement as HTMLElement;
    await act(async () => scroller.dispatchEvent(new browser.Event("scroll") as unknown as Event));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onPageChange).not.toHaveBeenCalled();
  });
});

describe("knowledge page paging surface", () => {
  const renderKnowledge = async (onLoadMore = vi.fn()) => {
    const onPageChange = vi.fn(); const onPageSizeChange = vi.fn();
    await act(async () => root.render(<KnowledgePage locale={en} state={knowledgeState(1, 2)} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} onLoadMore={onLoadMore} />));
    return { onPageChange, onPageSizeChange, onLoadMore };
  };

  it("invokes the route page controls on desktop without pulling the append feed", async () => {
    const onLoadMore = vi.fn();
    const { onPageChange, onPageSizeChange } = await renderKnowledge(onLoadMore);
    expect(container.textContent).toContain("Guide 1");
    expect(container.querySelector("[data-pagination-desktop]")).not.toBeNull();
    await act(async () => (container.querySelector('button[aria-label="Next page"]') as HTMLButtonElement).click());
    expect(onPageChange).toHaveBeenCalledWith(2);
    const picker = container.querySelector('button[aria-haspopup="listbox"][aria-label="Rows per page"]');
    expect(picker).not.toBeNull();
    await chooseValue(picker, "50");
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("keeps the append feed and hides the pager on narrow viewports", async () => {
    setViewport(false);
    const onLoadMore = vi.fn();
    const { onPageChange } = await renderKnowledge(onLoadMore);
    expect(container.querySelector("[data-pagination-desktop]")).toBeNull();
    const scroller = container.querySelector("table")!.parentElement as HTMLElement;
    await act(async () => scroller.dispatchEvent(new browser.Event("scroll") as unknown as Event));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
