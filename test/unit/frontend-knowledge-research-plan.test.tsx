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

const run = {
  id: "run-1", knowledgeItemId: "knowledge-1", goal: "Compare launch options", status: "paused", quotaState: "available", quotaDeferredUntil: null,
  plan: { spaceIds: ["space-1"], collectionIds: [], knowledgeItemIds: [], completion: ["Decision"], steps: ["Read"], subquestions: [{ id: "q1", question: "What changed?", status: "pending" }] },
  checkpoint: { nextStep: 0, completedSubquestionIds: [] }, createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-04T00:01:00.000Z",
};

describe("knowledge research plan read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let research: unknown; let urls: string[];
  beforeEach(async () => {
    research = { items: [{ ...run, plan: { ...run.plan, subquestions: undefined } }] };
    urls = [];
    browser = new Window({ url: "https://app.test/knowledge" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input); urls.push(url);
      if (url.includes("/api/knowledge/research-runs")) return Response.json(research);
      if (url.startsWith("/api/knowledge?")) return Response.json({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
      if (url.includes("/api/knowledge/review")) return Response.json({ period: "daily", from: "2026-10-04T00:00:00.000Z", to: "2026-10-05T00:00:00.000Z", items: [] });
      return Response.json({ items: [], nextCursor: null });
    });
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not show a research run without subquestions as zero progress", async () => {
    await mount();
    expect(container.querySelector("[data-knowledge-section-error='research']")).not.toBeNull();
    expect(container.textContent).toContain("This section could not be read. It is not an empty list.");
    expect(container.textContent).not.toContain("Subquestions: 0/0");
    expect(container.querySelector("[data-recent-research]")).toBeNull();
  });

  it("keeps an explicit empty research list hidden", async () => {
    research = { items: [] };
    await mount();
    expect(container.querySelector("[data-knowledge-section-error='research']")).toBeNull();
    expect(container.querySelector("[data-recent-research]")).toBeNull();
  });

  it("shows a readable research plan", async () => {
    research = { items: [run] };
    await mount();
    expect(container.textContent).toContain("Compare launch options");
    expect(container.textContent).toContain("Subquestions: 0/1");
    expect(container.querySelector("[data-knowledge-section-error='research']")).toBeNull();
  });

  async function mount() {
    await act(async () => root.render(<KnowledgeRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    await flushUntil(() => urls.some((url) => url.includes("/research-runs")));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
});

async function flushUntil(done: () => boolean) {
  for (let attempt = 0; attempt < 12 && !done(); attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
}
