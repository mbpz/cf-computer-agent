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

const note = {
  id: "note-a",
  knowledgeItemId: "knowledge-a",
  title: "Launch note",
  body: "Keep this private",
  visibility: "private",
  createdAt: "2026-10-04T00:00:00.000Z",
  updatedAt: "2026-10-04T00:01:00.000Z",
  access: undefined as "owner" | "shared" | undefined,
};

describe("knowledge note access read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let notes: unknown; let urls: string[];
  beforeEach(async () => {
    note.access = undefined;
    notes = undefined;
    urls = [];
    browser = new Window({ url: "https://app.test/knowledge" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not hide a missing note access as an owned note", async () => {
    await mount();
    expect(container.querySelector("[data-knowledge-section-error='notes']")).not.toBeNull();
    expect(container.textContent).toContain("This section could not be read. It is not an empty list.");
    expect(container.textContent).not.toContain("Launch note");
    expect(container.querySelector("[data-private-notes]")).toBeNull();
  });

  it("shows a note that is explicitly shared", async () => {
    note.access = "shared";
    await mount();
    expect(container.textContent).toContain("Launch note");
    expect(container.textContent).toContain("Shared with you");
    expect(container.querySelector("[data-knowledge-section-error='notes']")).toBeNull();
  });

  it("shows an owned note without a shared badge", async () => {
    note.access = "owner";
    await mount();
    expect(container.textContent).toContain("Launch note");
    expect(container.textContent).not.toContain("Shared with you");
    expect(container.querySelector("[data-knowledge-section-error='notes']")).toBeNull();
  });

  it("keeps an explicit empty note list empty", async () => {
    notes = { items: [] };
    await mount();
    expect(container.querySelector("[data-private-notes]")).toBeNull();
    expect(container.querySelector("[data-knowledge-section-error='notes']")).toBeNull();
    expect(container.textContent).toContain("No published knowledge");
  });

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/api/knowledge/notes")) {
        if (notes) return Response.json(notes);
        const item = { ...note };
        if (!item.access) delete item.access;
        return Response.json({ items: [item] });
      }
      if (url.startsWith("/api/knowledge?")) return Response.json({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
      if (url.includes("/api/knowledge/review")) return Response.json({ period: "daily", from: "2026-10-04T00:00:00.000Z", to: "2026-10-05T00:00:00.000Z", items: [] });
      return Response.json({ items: [], nextCursor: null });
    });
    await act(async () => root.render(<KnowledgeRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    for (let attempt = 0; attempt < 12 && !urls.some((url) => url.includes("/api/knowledge/notes")); attempt += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
});
