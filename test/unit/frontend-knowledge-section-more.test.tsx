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

const favorite = (id: string, title: string) => ({ knowledgeItemId: id, title, createdAt: "2026-10-01T00:00:00.000Z", completed: false, visibility: "shared" });
const note = (id: string, title: string) => ({ id, knowledgeItemId: `knowledge-${id}`, title, body: "Body", visibility: "private", access: "owner", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" });
const run = (id: string, goal: string) => ({
  id, knowledgeItemId: `knowledge-${id}`, goal, status: "completed", quotaState: "available", quotaDeferredUntil: null,
  plan: { spaceIds: [], collectionIds: [], knowledgeItemIds: [], completion: [], steps: [], subquestions: [{ id: "sub-1", question: "Why", status: "completed" }] },
  checkpoint: { nextStep: 1, completedSubquestionIds: ["sub-1"] }, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
});

describe("knowledge side panel continuation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  let calls: string[]; let appendFails: boolean;
  beforeEach(async () => {
    calls = []; appendFails = false;
    browser = new Window({ url: "https://app.test/knowledge" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const cursor = new URL(url, "https://app.test").searchParams.get("cursor");
      if (url.includes("/api/knowledge/favorites")) {
        if (cursor && appendFails) return Response.json({ error: { code: "FAVORITES_UNAVAILABLE", message: "Unavailable" } }, { status: 500 });
        return Response.json(cursor ? { items: [favorite("knowledge-2", "Second favorite")], nextCursor: null } : { items: [favorite("knowledge-1", "First favorite")], nextCursor: "favorites-page" });
      }
      if (url.includes("/api/knowledge/notes")) {
        if (cursor && appendFails) return Response.json({ error: { code: "NOTES_UNAVAILABLE", message: "Unavailable" } }, { status: 500 });
        return Response.json(cursor ? { items: [note("note-2", "Second note")], nextCursor: null } : { items: [note("note-1", "First note")], nextCursor: "notes-page" });
      }
      if (url.includes("/api/knowledge/research-runs")) {
        if (cursor && appendFails) return Response.json({ error: { code: "RESEARCH_UNAVAILABLE", message: "Unavailable" } }, { status: 500 });
        return Response.json(cursor ? { items: [run("run-2", "Second run")], nextCursor: null } : { items: [run("run-1", "First run")], nextCursor: "research-page" });
      }
      if (url.includes("/api/knowledge/recent")) return Response.json({ items: [] });
      return Response.json({ items: [], nextCursor: null, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("appends the next page of every cursor panel without dropping loaded rows", async () => {
    await render();
    expect(container.textContent).toContain("First favorite");
    expect(container.textContent).toContain("First note");
    expect(container.textContent).toContain("First run");

    for (const [section, cursor, appended, kept] of [["favorites", "favorites-page", "Second favorite", "First favorite"], ["research", "research-page", "Second run", "First run"], ["notes", "notes-page", "Second note", "First note"]] as const) {
      await act(async () => (container.querySelector(`[data-knowledge-more="${section}"]`) as HTMLButtonElement).click());
      await flush();
      expect(calls.some((url) => url.includes(`cursor=${cursor}`))).toBe(true);
      expect(container.textContent).toContain(appended);
      expect(container.textContent).toContain(kept);
    }
    // The server's missing cursor is the end of the list: no control is left to press.
    for (const section of ["favorites", "research", "notes"] as const) expect(container.querySelector(`[data-knowledge-more="${section}"]`)).toBeNull();
  });

  it("keeps the loaded rows and retries the same cursor after a failed append", async () => {
    await render();
    appendFails = true;
    await act(async () => (container.querySelector('[data-knowledge-more="favorites"]') as HTMLButtonElement).click());
    await flush();
    expect(container.querySelector('[data-knowledge-more-error="favorites"]')).not.toBeNull();
    expect(container.textContent).toContain("First favorite");
    expect(container.textContent).not.toContain("Second favorite");
    expect(container.querySelector('[data-knowledge-more="favorites"]')).toBeNull();

    appendFails = false;
    await act(async () => (container.querySelector('[data-knowledge-more-error="favorites"] button') as HTMLButtonElement).click());
    await flush();
    expect(container.querySelector('[data-knowledge-more-error="favorites"]')).toBeNull();
    expect(container.textContent).toContain("Second favorite");
    expect(calls.filter((url) => url.includes("cursor=favorites-page"))).toHaveLength(2);
  });

  async function render() {
    await act(async () => root.render(<KnowledgeRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    await flush();
  }
});

async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
