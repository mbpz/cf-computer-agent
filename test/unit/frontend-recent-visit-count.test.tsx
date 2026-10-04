// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const item: { knowledgeItemId: string; title: string; lastVisitedAt: string; visitCount?: number } = {
  knowledgeItemId: "knowledge-a",
  title: "Visited guide",
  lastVisitedAt: "2026-10-04T00:00:00.000Z",
  visitCount: 4,
};

describe("recent visit count read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    item.visitCount = 4;
    browser = new Window({ url: "https://app.test/knowledge" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not invent one visit when the count is missing", async () => {
    delete item.visitCount;
    await mount();
    expect(container.querySelector("[data-knowledge-section-error='recent']")).not.toBeNull();
    expect(container.textContent).toContain("This section could not be read. It is not an empty list.");
    expect(container.textContent).not.toContain("Visited guide");
    expect(container.textContent).not.toContain("Visits 1");
  });

  it("does not invent one visit when the count is zero", async () => {
    item.visitCount = 0;
    await mount();
    expect(container.querySelector("[data-knowledge-section-error='recent']")).not.toBeNull();
    expect(container.textContent).not.toContain("Visited guide");
    expect(container.textContent).not.toContain("Visits 1");
  });

  it("shows an explicit visit count", async () => {
    await mount();
    expect(container.textContent).toContain("Visited guide");
    expect(container.textContent).toContain("Visits 4");
    expect(container.querySelector("[data-knowledge-section-error='recent']")).toBeNull();
    expect(container.textContent).not.toContain("This section could not be read. It is not an empty list.");
  });

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/knowledge/recent")) return Response.json({ items: [{ ...item }] });
      if (url.includes("/api/knowledge/review")) return Response.json({ period: "daily", from: "2026-10-04T00:00:00.000Z", to: "2026-10-05T00:00:00.000Z", items: [] });
      return Response.json({ items: [], nextCursor: null, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
    await act(async () => root.render(<KnowledgeRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("Visited guide") || text.includes("This section could not be read")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
