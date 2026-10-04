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

const revision = { id: "revision-a", knowledgeItemId: "knowledge-a", title: "Readable entry", markdown: "Hello", sourceVersionId: "source-a", indexStatus: "indexed", chunks: [{ id: "chunk-a", startLine: 1, endLine: 1, text: "Hello", ordinal: 0, headingPath: [] }] };

describe("knowledge reader link read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let related: unknown; let backlinks: unknown;
  beforeEach(() => {
    related = {}; backlinks = {};
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not hide a failed related or backlink read", async () => {
    await mount();
    expect(text("[data-related-knowledge]")).toContain("Related knowledge could not be read.");
    expect(text("[data-related-knowledge]")).not.toContain("No related knowledge found.");
    expect(text("[data-backlinks]")).toContain("Backlinks could not be read.");
    expect(text("[data-backlinks]")).not.toContain("No visible knowledge links here yet.");
  });

  it("shows an explicit empty related list and empty backlinks", async () => {
    related = { related: { items: [] } };
    backlinks = { backlinks: { items: [] } };
    await mount();
    expect(text("[data-related-knowledge]")).toContain("No related knowledge found.");
    expect(text("[data-related-knowledge]")).not.toContain("could not be read");
    expect(text("[data-backlinks]")).toContain("No visible knowledge links here yet.");
    expect(text("[data-backlinks]")).not.toContain("could not be read");
  });

  function text(selector: string) { return container.querySelector(selector)?.textContent ?? ""; }

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/knowledge/knowledge-a") return Response.json({ knowledge: { currentRevision: revision } });
      if (url.endsWith("/favorite")) return Response.json({ favorite: false });
      if (url.endsWith("/related")) return Response.json(related);
      if (url.endsWith("/backlinks")) return Response.json(backlinks);
      if (url.endsWith("/note")) return Response.json({ note: null });
      return Response.json({ items: [], shares: [] });
    });
    await act(async () => root.render(<KnowledgeReaderRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} memberId="member-a" knowledgeItemId="knowledge-a" />));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (container.querySelector("[data-related-knowledge]") && container.querySelector("[data-backlinks]")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
