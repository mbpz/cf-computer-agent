// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const hit: { knowledgeItemId: string; citationId: string; matchedFields: string[]; title?: string; excerpt?: string } = {
  knowledgeItemId: "knowledge-a",
  citationId: "citation-a",
  title: "Launch guide",
  excerpt: "The launch window",
  matchedFields: [],
};

describe("search title and excerpt read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    hit.title = "Launch guide";
    hit.excerpt = "The launch window";
    browser = new Window({ url: "https://app.test/search?q=launch" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not label a missing title as an untitled result", async () => {
    delete hit.title;
    await mount();
    expect(container.textContent).toContain("Search is unavailable.");
    expect(container.textContent).not.toContain("Untitled result");
    expect(container.textContent).not.toContain("The launch window");
  });

  it("does not label a missing excerpt as no excerpt", async () => {
    delete hit.excerpt;
    await mount();
    expect(container.textContent).toContain("Search is unavailable.");
    expect(container.textContent).not.toContain("No excerpt available.");
    expect(container.textContent).not.toContain("Launch guide");
  });

  it("shows a result with an explicit title and excerpt", async () => {
    await mount();
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).toContain("The launch window");
    expect(container.textContent).not.toContain("Search is unavailable.");
    expect(container.textContent).not.toContain("Untitled result");
    expect(container.textContent).not.toContain("No excerpt available.");
  });

  it("keeps a blank title and a blank excerpt as blank", async () => {
    hit.title = "";
    hit.excerpt = "";
    await mount();
    expect(container.textContent).toContain("Untitled result");
    expect(container.textContent).toContain("No excerpt available.");
    expect(container.textContent).not.toContain("Search is unavailable.");
  });

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/saved-views")) return Response.json({ items: [] });
      return Response.json({ items: [{ ...hit }], degraded: false, pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    await act(async () => root.render(<SearchRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="?q=launch" />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("Launch guide") || text.includes("Untitled result") || text.includes("Search is unavailable.")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
