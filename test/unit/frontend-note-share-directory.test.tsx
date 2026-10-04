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

const revision = { id: "revision-a", knowledgeItemId: "knowledge-a", title: "Readable entry", markdown: "Hello", publishedAt: "2026-10-04T00:00:00.000Z", isCurrent: true, sourceVersionId: "source-a", indexStatus: "indexed", chunks: [{ id: "chunk-a", startLine: 1, endLine: 1, text: "Hello", ordinal: 0, headingPath: [] }] };
const note = { id: "note-a", ownerId: "member-a", knowledgeItemId: "knowledge-a", title: "Title", body: "Body", visibility: "private", access: "owner", citations: [{ revisionId: "revision-a", chunkId: "chunk-a", startLine: 1, endLine: 1 }], createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-04T00:00:01.000Z" };

describe("note share member directory", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let members: unknown; let urls: string[];
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(() => {
    members = {}; urls = [];
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("does not treat a missing member directory as nobody to share with", async () => {
    await mount();
    expect(urls.some((url) => url.includes("/api/members/active"))).toBe(true);
    expect(container.querySelector("[data-note-share-retry]")).not.toBeNull();
    expect(container.textContent).toContain("Unable to update note sharing.");
    expect(container.textContent).not.toContain("Not shared with anyone.");
  });

  it("shows an explicit empty directory as not shared", async () => {
    members = { items: [] };
    await mount();
    expect(urls.some((url) => url.includes("/api/members/active"))).toBe(true);
    expect(container.querySelector("[data-note-share-retry]")).toBeNull();
    expect(container.textContent).toContain("Not shared with anyone.");
  });

  async function mount() {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input); urls.push(url);
      if (url === "/api/knowledge/knowledge-a") return Response.json({ knowledge: { currentRevision: revision } });
      if (url.endsWith("/favorite")) return Response.json({ favorite: false });
      if (url.endsWith("/note/shares")) return Response.json({ shares: [] });
      if (url.endsWith("/note")) return Response.json({ note });
      if (url.endsWith("/api/members/active")) return Response.json(members);
      return Response.json({ items: [], related: { items: [] }, backlinks: { items: [] } });
    });
    await act(async () => root.render(<KnowledgeReaderRoute locale={locale} memberId="member-a" knowledgeItemId="knowledge-a" />));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const text = container.textContent ?? "";
      const directoryLoaded = urls.some((url) => url.includes("/api/members/active"));
      if (directoryLoaded && (container.querySelector("[data-note-share-retry]") || text.includes("Not shared with anyone.") || text.includes("Unable to update note sharing."))) break;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
  }
});
