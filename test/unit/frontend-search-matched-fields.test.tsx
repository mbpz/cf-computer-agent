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

const hit = {
  knowledgeItemId: "knowledge-a",
  citationId: "citation-a",
  title: "Launch guide",
  excerpt: "The launch window",
  matchedFields: undefined as string[] | undefined,
};

describe("search matched field read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    hit.matchedFields = undefined;
    browser = new Window({ url: "https://app.test/search?q=launch" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not hide a missing matched-field list as no matches", async () => {
    await mount();
    expect(container.textContent).toContain("Search is unavailable.");
    expect(container.textContent).not.toContain("Launch guide");
    expect(container.textContent).not.toContain("Matched:");
  });

  it("shows a result whose matched-field list is explicitly empty", async () => {
    hit.matchedFields = [];
    await mount();
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).not.toContain("Matched:");
    expect(container.textContent).not.toContain("Search is unavailable.");
  });

  it("shows an explicit matched field", async () => {
    hit.matchedFields = ["title"];
    await mount();
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).toContain("Matched: title");
    expect(container.textContent).not.toContain("Search is unavailable.");
  });

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/saved-views")) return Response.json({ items: [] });
      const item = { ...hit };
      if (!item.matchedFields) delete item.matchedFields;
      return Response.json({ items: [item], degraded: false, pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    await act(async () => root.render(<SearchRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="?q=launch" />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("Launch guide") || text.includes("Search is unavailable.")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
