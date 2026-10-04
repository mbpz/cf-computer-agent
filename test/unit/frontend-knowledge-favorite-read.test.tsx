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

const revision = { id: "revision-a", knowledgeItemId: "knowledge-a", title: "Readable entry", markdown: "Hello", chunks: [{ id: "chunk-a", startLine: 1, endLine: 1, text: "Hello", ordinal: 0, headingPath: [] }] };

describe("knowledge favorite read", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let writes: string[];
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(() => {
    writes = [];
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not present a failed favorite read as not saved", async () => {
    await mount(async (url, init) => {
      if (url.endsWith("/favorite")) {
        if (init?.method && init.method !== "GET") writes.push(init.method);
        return Response.json({ error: { code: "FAVORITE_UNAVAILABLE", message: "Unavailable" } }, { status: 500 });
      }
      return other(url);
    });
    expect(container.textContent).toContain("Readable entry");
    expect(favoriteButton()).toBeUndefined();
    expect(container.textContent).toContain("could not be read");
    expect(writes).toEqual([]);
  });

  it("does not present a non-boolean favorite as not saved", async () => {
    await mount(async (url) => url.endsWith("/favorite") ? Response.json({ favorite: "yes" }) : other(url));
    expect(container.textContent).toContain("Readable entry");
    expect(favoriteButton()).toBeUndefined();
    expect(container.textContent).toContain("could not be read");
  });

  it("shows a real saved favorite from the server", async () => {
    await mount(async (url) => url.endsWith("/favorite") ? Response.json({ favorite: true }) : other(url));
    expect(favoriteButton()?.textContent).toBe("Remove from favorites");
    expect(favoriteButton()?.getAttribute("aria-pressed")).toBe("true");
  });

  async function mount(handler: (url: string, init?: RequestInit) => Promise<Response>) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
    await act(async () => root.render(<KnowledgeReaderRoute locale={locale} memberId="member-a" knowledgeItemId="knowledge-a" />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
  function other(url: string) {
    if (url === "/api/knowledge/knowledge-a") return Response.json({ knowledge: { currentRevision: revision } });
    if (url.endsWith("/note")) return Response.json({ note: null });
    if (url.endsWith("/shares")) return Response.json({ shares: [] });
    return Response.json({ items: [] });
  }
  function favoriteButton() { return [...container.querySelectorAll("button")].find((button) => button.textContent === "Add to favorites" || button.textContent === "Remove from favorites"); }
});
