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

const revision = { id: "revision-a", knowledgeItemId: "knowledge-a", title: "Readable entry", markdown: "Hello", publishedAt: "2026-10-04T00:00:00.000Z", isCurrent: true, sourceVersionId: "source-a", indexStatus: "indexed", chunks: [] };
const relatedItem: { id: string; title: string; publishedAt: string; reasonFields?: unknown } = {
  id: "knowledge-b",
  title: "Related guide",
  publishedAt: "2026-10-04T00:00:00.000Z",
  reasonFields: ["title"],
};

describe("related knowledge reason read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => {
    relatedItem.reasonFields = ["title"];
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not label a missing reason list as not provided", async () => {
    delete relatedItem.reasonFields;
    await mount();
    const related = text();
    expect(related).toContain("Related knowledge could not be read. This is not an empty list.");
    expect(related).not.toContain("Related guide");
    expect(related).not.toContain("Not provided");
  });

  it.each([null, "title", [42], ["not-a-field"], ["title", 42], ["title", "not-a-field"]].map((value) => [value]))("rejects invalid reasonFields: %j", async (value) => {
    relatedItem.reasonFields = value;
    await mount();
    expect(text()).toContain("Related knowledge could not be read. This is not an empty list.");
    expect(text()).not.toContain("Related guide");
  });

  it("preserves every supported matched field", async () => {
    relatedItem.reasonFields = ["title", "summary", "tags", "body", "code"];
    await mount();
    expect(text()).toContain("Related guide");
    for (const field of relatedItem.reasonFields as string[]) expect(text()).toContain(field);
    expect(text()).not.toContain("could not be read");
  });

  it("shows an explicit empty reason list without calling it unavailable", async () => {
    relatedItem.reasonFields = [];
    await mount();
    const related = text();
    expect(related).toContain("Related guide");
    expect(related).not.toContain("Not provided");
    expect(related).not.toContain("could not be read");
  });

  it("shows an explicit matched field", async () => {
    await mount();
    const related = text();
    expect(related).toContain("Related guide");
    expect(related).toContain("Matched in");
    expect(related).toContain("title");
    expect(related).not.toContain("Not provided");
    expect(related).not.toContain("could not be read");
  });

  function text() { return container.querySelector("[data-related-knowledge]")?.textContent ?? ""; }

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/knowledge/knowledge-a") return Response.json({ knowledge: { currentRevision: revision } });
      if (url.endsWith("/favorite")) return Response.json({ favorite: false });
      if (url.endsWith("/related")) return Response.json({ related: { items: [{ ...relatedItem }] } });
      if (url.endsWith("/backlinks")) return Response.json({ backlinks: { items: [] } });
      if (url.endsWith("/note")) return Response.json({ note: null });
      return Response.json({ items: [], shares: [] });
    });
    await act(async () => root.render(<KnowledgeReaderRoute locale={createLocaleRuntime({ navigatorLanguage: "en" })} memberId="member-a" knowledgeItemId="knowledge-a" />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (text().includes("Related guide") || text().includes("could not be read")) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
