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

const item: { id: string; title: string; publishedAt: string; tagIds?: unknown; tags?: unknown } = {
  id: "knowledge-a",
  title: "Launch guide",
  publishedAt: "2026-10-04",
  tagIds: ["launch-tag"],
};

describe("knowledge list tag read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    item.tagIds = ["launch-tag"];
    delete item.tags;
    browser = new Window({ url: "https://app.test/knowledge" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not hide a missing tag list", async () => {
    delete item.tagIds;
    await mount();
    expect(container.textContent).toContain("Unable to load knowledge.");
    expect(container.textContent).not.toContain("Launch guide");
  });

  it("does not drop a tag that is not text", async () => {
    item.tagIds = [42];
    await mount();
    expect(container.textContent).toContain("Unable to load knowledge.");
    expect(container.textContent).not.toContain("Launch guide");
  });

  it.each([null, "launch-tag", {}, ["launch-tag", 42]].map((value) => [value]))("rejects invalid tagIds: %j", async (value) => {
    item.tagIds = value;
    await mount();
    expect(container.textContent).toContain("Unable to load knowledge.");
    expect(container.textContent).not.toContain("Launch guide");
  });

  it.each([null, "launch-tag", {}, [42], ["launch-tag", 42]].map((value) => [value]))("does not hide invalid tags behind valid tagIds: %j", async (value) => {
    item.tags = value;
    await mount();
    expect(container.textContent).toContain("Unable to load knowledge.");
    expect(container.textContent).not.toContain("Launch guide");
  });

  it("accepts a valid tags alias without tagIds", async () => {
    delete item.tagIds;
    item.tags = ["alias-tag"];
    await mount();
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).toContain("alias-tag");
    expect(container.textContent).not.toContain("Unable to load knowledge.");
  });

  it("shows an explicit empty tag list", async () => {
    item.tagIds = [];
    await mount();
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).not.toContain("launch-tag");
    expect(container.textContent).not.toContain("Unable to load knowledge.");
  });

  it("shows an explicit tag", async () => {
    await mount();
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).toContain("launch-tag");
    expect(container.textContent).not.toContain("Unable to load knowledge.");
  });

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/knowledge?")) return Response.json({ items: [{ ...item }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      if (url.includes("/api/knowledge/review")) return Response.json({ period: "daily", from: "2026-10-04T00:00:00.000Z", to: "2026-10-05T00:00:00.000Z", items: [] });
      return Response.json({ items: [], nextCursor: null });
    });
    await act(async () => root.render(<KnowledgeRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} search="" />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("Launch guide") || text.includes("Unable to load knowledge.")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
