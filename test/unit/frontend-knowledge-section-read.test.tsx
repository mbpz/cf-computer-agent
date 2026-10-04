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

describe("knowledge section read failures", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let recentFails: boolean;
  beforeEach(async () => {
    recentFails = true;
    browser = new Window({ url: "https://app.test/knowledge" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/knowledge/recent")) {
        if (recentFails) return Response.json({ error: { code: "RECENT_UNAVAILABLE", message: "Unavailable" } }, { status: 500 });
        return Response.json({ items: [{ knowledgeItemId: "knowledge-1", title: "Visited guide", lastVisitedAt: "2026-10-04T00:00:00.000Z", visitCount: 2 }] });
      }
      if (url.includes("/api/knowledge/favorites")) return Response.json({});
      return Response.json({ items: [], nextCursor: null, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("shows a failed knowledge section instead of an empty list and can read it again", async () => {
    await act(async () => root.render(<KnowledgeRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    await flush();
    expect(container.querySelector("[data-knowledge-section-error='recent']")).not.toBeNull();
    expect(container.querySelector("[data-knowledge-section-error='favorites']")).not.toBeNull();
    expect(container.querySelector("[data-recent-knowledge]")).toBeNull();
    expect(container.querySelector("[data-to-read]")).toBeNull();
    expect(container.querySelector("[data-knowledge-section-error='activity']")).toBeNull();
    recentFails = false;
    const retry = container.querySelector("[data-knowledge-section-error='recent'] button") as HTMLButtonElement;
    await act(async () => retry.click());
    await flush();
    expect(container.textContent).toContain("Visited guide");
    expect(container.querySelector("[data-knowledge-section-error='recent']")).toBeNull();
    expect(container.querySelector("[data-knowledge-section-error='favorites']")).not.toBeNull();
  });
});

async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
