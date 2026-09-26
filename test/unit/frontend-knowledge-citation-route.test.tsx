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
const { Window } = await import("happy-dom");

vi.mock("../../frontend/lib/markdown-renderer", () => ({ renderSafeMarkdown: (text: string) => <div data-test-markdown>{text}</div> }));

describe("reader exact citation route", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const language = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(() => { browser = new Window({ url: "https://app.test/knowledge/knowledge-1#citation-old" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("renders the historical text and selects the bound source on arrival", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); urls.push(url); return fixture(url); });
    await render();
    expect(container.querySelector("[data-test-markdown]")?.textContent).toBe("Historical body");
    expect(container.querySelector('[data-source-selected="true"]')).not.toBeNull();
    expect(urls).toContain("/api/knowledge/knowledge-1/revisions/revision-old");
    expect(urls).not.toContain("/api/knowledge/knowledge-1");
  });

  it("clears old content on hash navigation and retries the exact failed citation", async () => {
    let denied = true; const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); urls.push(url); if (url.endsWith("/citation-next") && denied) return new Response(null, { status: 403 }); return fixture(url); });
    await render();
    await act(async () => { browser.history.pushState({}, "", "#citation-next"); browser.dispatchEvent(new browser.HashChangeEvent("hashchange")); }); await flush();
    expect(container.textContent).not.toContain("Historical body");
    denied = false;
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Try again")) as HTMLButtonElement;
    expect(retry).toBeTruthy(); await act(async () => retry.click()); await flush();
    expect(container.querySelector("[data-test-markdown]")?.textContent).toBe("Next historical body");
    expect(urls.filter((url) => url.endsWith("/citation-next"))).toHaveLength(2);
    expect(urls).not.toContain("/api/knowledge/knowledge-1");
  });

  it("ignores an old exact revision arriving after a hash change", async () => {
    const late = deferred<Response>(); let oldSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/revisions/revision-old")) { oldSignal = init?.signal ?? undefined; return late.promise; }
      return fixture(url);
    });
    await render();
    await act(async () => { browser.history.pushState({}, "", "#citation-next"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => late.resolve(fixture("/api/knowledge/knowledge-1/revisions/revision-old"))); await flush();
    expect(container.querySelector("[data-test-markdown]")?.textContent).toBe("Next historical body");
  });

  async function render() { await act(async () => root.render(<KnowledgeReaderRoute locale={language} knowledgeItemId="knowledge-1" />)); await flush(); }
});
function fixture(url: string): Response {
  if (url.includes("/citations/")) {
    const next = url.endsWith("citation-next");
    return json({ citation: { knowledgeItemId: "knowledge-1", title: "History", revisionId: next ? "revision-next" : "revision-old", chunkId: next ? "chunk-next" : "chunk-old", headingPath: [], startLine: 1, endLine: 2 } });
  }
  if (url.includes("/revisions/")) {
    const next = url.endsWith("revision-next");
    return json({ revision: { id: next ? "revision-next" : "revision-old", knowledgeItemId: "knowledge-1", title: "History", markdown: next ? "Next historical body" : "Historical body", isCurrent: false, publishedAt: "2026-09-01", chunks: [{ id: next ? "chunk-next" : "chunk-old", citationId: next ? "citation-next" : "citation-old", text: "Source excerpt", startLine: 1, endLine: 2 }] } });
  }
  if (url.endsWith("/related")) return json({ related: { items: [] } });
  if (url.endsWith("/backlinks")) return json({ backlinks: { items: [] } });
  if (url.endsWith("/favorite")) return json({ favorite: false });
  return json({ note: null, items: [] });
}
function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index++) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
