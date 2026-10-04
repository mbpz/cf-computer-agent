// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeReaderRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("../../frontend/lib/markdown-renderer", () => ({ renderSafeMarkdown: (text: string) => <div data-test-markdown>{text}</div> }));
const { Window } = await import("happy-dom");

const revision: { id: string; knowledgeItemId: string; title?: string; markdown: string; publishedAt?: string; isCurrent?: boolean; sourceVersionId: string; indexStatus: string; chunks: unknown[] } = {
  id: "revision-a",
  knowledgeItemId: "knowledge-a",
  title: "Launch guide",
  markdown: "Hello",
  publishedAt: "2026-10-04T00:00:00.000Z",
  isCurrent: true,
  sourceVersionId: "source-a",
  indexStatus: "indexed",
  chunks: [],
};

describe("knowledge revision identity read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => {
    revision.title = "Launch guide";
    revision.publishedAt = "2026-10-04T00:00:00.000Z";
    revision.isCurrent = true;
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not label a missing title as untitled", async () => {
    delete revision.title;
    await mount();
    expect(container.textContent).toContain("Unable to load this knowledge entry.");
    expect(container.textContent).not.toContain("Untitled knowledge");
    expect(container.textContent).not.toContain("2026-10-04T00:00:00.000Z");
  });

  it("does not hide a missing publish time", async () => {
    delete revision.publishedAt;
    await mount();
    expect(container.textContent).toContain("Unable to load this knowledge entry.");
    expect(container.textContent).not.toContain("Launch guide");
    expect(container.textContent).not.toContain("Hello");
  });

  it("does not treat a missing current flag as a historical revision", async () => {
    delete revision.isCurrent;
    await mount();
    expect(container.textContent).toContain("Unable to load this knowledge entry.");
    expect(container.textContent).not.toContain("Historical revision");
    expect(container.textContent).not.toContain("Launch guide");
  });

  it("shows an explicit current revision", async () => {
    await mount();
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).toContain("2026-10-04T00:00:00.000Z");
    expect(container.textContent).toContain("Hello");
    expect(container.textContent).not.toContain("Historical revision");
    expect(container.textContent).not.toContain("Untitled knowledge");
    expect(container.textContent).not.toContain("Unable to load this knowledge entry.");
  });

  it("shows an explicit historical revision", async () => {
    revision.isCurrent = false;
    await mount();
    expect(container.textContent).toContain("Launch guide");
    expect(container.textContent).toContain("Historical revision");
    expect(container.textContent).not.toContain("Unable to load this knowledge entry.");
  });

  it("keeps a blank title untitled when the time and current flag are explicit", async () => {
    revision.title = "";
    await mount();
    expect(container.textContent).toContain("Untitled knowledge");
    expect(container.textContent).toContain("2026-10-04T00:00:00.000Z");
    expect(container.textContent).not.toContain("Unable to load this knowledge entry.");
  });

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = { ...revision };
      if (url === "/api/knowledge/knowledge-a") return Response.json({ knowledge: { currentRevision: body } });
      if (url.endsWith("/favorite")) return Response.json({ favorite: false });
      if (url.endsWith("/related")) return Response.json({ related: { items: [] } });
      if (url.endsWith("/backlinks")) return Response.json({ backlinks: { items: [] } });
      if (url.endsWith("/note")) return Response.json({ note: null });
      return Response.json({ items: [], shares: [] });
    });
    await act(async () => root.render(<KnowledgeReaderRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} memberId="member-a" knowledgeItemId="knowledge-a" />));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("Unable to load this knowledge entry.") || text.includes("Launch guide") || text.includes("Untitled knowledge")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
