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

const revision = { id: "revision-a", knowledgeItemId: "knowledge-a", title: "Readable entry", markdown: "Hello" };

describe("knowledge revision chunks", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let chunks: unknown;
  beforeEach(() => {
    chunks = undefined;
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not treat a missing chunk list as no source locations", async () => {
    await mount();
    expect(container.textContent).toContain("Unable to load this knowledge entry.");
    expect(container.textContent).not.toContain("No source locations available.");
  });

  it("shows an explicit empty chunk list as no source locations", async () => {
    chunks = [];
    await mount();
    expect(container.textContent).toContain("Readable entry");
    expect(container.textContent).toContain("No source locations available.");
    expect(container.textContent).not.toContain("Unable to load this knowledge entry.");
  });

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/knowledge/knowledge-a") return Response.json({ knowledge: { currentRevision: { ...revision, ...(chunks === undefined ? {} : { chunks }) } } });
      if (url.endsWith("/favorite")) return Response.json({ favorite: false });
      if (url.endsWith("/related")) return Response.json({ related: { items: [] } });
      if (url.endsWith("/backlinks")) return Response.json({ backlinks: { items: [] } });
      if (url.endsWith("/note")) return Response.json({ note: null });
      return Response.json({ items: [], shares: [] });
    });
    await act(async () => root.render(<KnowledgeReaderRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} memberId="member-a" knowledgeItemId="knowledge-a" />));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const text = container.textContent ?? "";
      if (text.includes("Unable to load this knowledge entry.") || text.includes("No source locations available.")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
