// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeDerivativesPanel } from "../../frontend/components/knowledge/knowledge-derivatives-panel";
import { KnowledgeReaderPage } from "../../frontend/pages/knowledge-reader-page";
import { useKnowledgeDerivatives } from "../../frontend/lib/use-knowledge-derivatives";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const citation = { citationId: "citation-a", title: "Doc", headingPath: ["H"], startLine: 1, endLine: 2 };
const revision = {
  id: "revision-a",
  knowledgeItemId: "knowledge-a",
  title: "Readable entry",
  markdown: "Article body",
  publishedAt: "2026-10-04T00:00:00.000Z",
  isCurrent: true,
  sourceVersionId: "source-a",
  indexStatus: "indexed",
  chunks: [{ id: "chunk-a", startLine: 1, endLine: 2, text: "Article body", ordinal: 0, headingPath: [], citationId: "citation-a" }],
};

function Harness({ knowledgeItemId, revisionId, citationIds }: { knowledgeItemId: string; revisionId: string; citationIds: string[] }) {
  const derivatives = useKnowledgeDerivatives({ knowledgeItemId, revisionId, citationIds });
  return <KnowledgeDerivativesPanel knowledgeItemId={knowledgeItemId} derivatives={derivatives} runningRunId={null} renderMarkdown={(text) => <div data-test-markdown>{text}</div>} />;
}

describe("knowledge reader derivative surface", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    vi.stubGlobal("window", browser);
    vi.stubGlobal("document", browser.document);
    vi.stubGlobal("HTMLElement", browser.HTMLElement);
    vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("history", browser.history);
    vi.stubGlobal("location", browser.location);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    browser.close();
    vi.unstubAllGlobals();
  });
  async function settle() {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  async function click(selector: string) {
    await act(async () => { (container.querySelector(selector) as HTMLButtonElement).click(); });
    await settle();
  }
  function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/note")) return Response.json({ note: null });
      if (url.endsWith("/shares")) return Response.json({ shares: [] });
      return handler(url, init);
    });
  }
  async function renderReader(handler: (url: string, init?: RequestInit) => Response | Promise<Response> = () => Response.json({ items: [] })) {
    stubFetch(handler);
    await act(async () => root.render(<KnowledgeReaderPage memberId="member-a" revision={revision} renderMarkdown={(text) => <div data-test-markdown>{text}</div>} />));
    await settle();
  }
  function article(): HTMLElement | null {
    return container.querySelector("[data-reader-layout] > div > main [data-test-markdown]");
  }

  it("rejects a malformed derivation payload instead of rendering any part of it", async () => {
    await renderReader((url) => url.endsWith("/faq")
      ? Response.json({ items: [{ question: "Smuggled question", answer: 42 }] })
      : Response.json({ items: [] }));
    await click('[data-derivative-action="faq"]');
    expect(container.querySelector("[data-derivative-status='failed']")).not.toBeNull();
    expect(container.querySelector("[data-derivative-code='KNOWLEDGE_FAQ_INVALID']")).not.toBeNull();
    expect(container.querySelector("[data-derivative-panel] [data-derivative-artifact]")).toBeNull();
    // The malformed entry is not rendered anywhere, not even as raw text.
    expect(container.textContent).not.toContain("Smuggled question");
    expect(container.querySelector("[data-derivative-panel] [data-test-markdown]")).toBeNull();
    expect(article()?.textContent).toBe("Article body");
  });

  it("keeps the reader readable while a generation runs, then retries a failure in place", async () => {
    let attempts = 0;
    await renderReader((url) => {
      if (!url.endsWith("/summary")) return Response.json({ items: [] });
      attempts += 1;
      return attempts === 1
        ? Response.json({ error: { code: "SOURCE_SUMMARY_UNGROUNDED", message: "Summary could not be grounded", retryable: false } }, { status: 422 })
        : Response.json({ summary: "Server summary", citations: [citation] });
    });
    await click('[data-derivative-action="summary"]');
    expect(attempts).toBe(1);
    expect(container.querySelector("[data-derivative-status='failed']")).not.toBeNull();
    expect(container.textContent).toContain("SOURCE_SUMMARY_UNGROUNDED");
    expect(container.querySelector("[data-derivative-panel] [data-derivative-artifact]")).toBeNull();
    // A failed generation never stands in for content, and the article is untouched.
    expect(container.querySelector("[data-derivative-panel] [data-test-markdown]")).toBeNull();
    expect(article()?.textContent).toBe("Article body");
    await click('[data-derivative-retry="summary"]');
    expect(attempts).toBe(2);
    expect(container.querySelector("[data-derivative-status='ready']")).not.toBeNull();
    expect(container.querySelector("[data-derivative-artifact='summary']")?.textContent).toContain("Server summary");
    expect(container.querySelector("[data-derivative-citation='citation-a']")).not.toBeNull();
  });

  it("distinguishes a quota deferral from a temporarily unavailable backend, and still shows a running generation", async () => {
    let pending: ((response: Response) => void) | null = null;
    await renderReader((url) => url.endsWith("/timeline")
      ? new Promise<Response>((resolve) => { pending = resolve; })
      : Response.json({ items: [] }));
    await act(async () => { (container.querySelector('[data-derivative-action="timeline"]') as HTMLButtonElement).click(); });
    await settle();
    expect(container.querySelector("[data-derivative-status='generating']")).not.toBeNull();
    expect(container.querySelector('[data-derivative-action="timeline"]')?.getAttribute("data-derivative-state")).toBe("generating");
    expect(article()?.textContent).toBe("Article body");
    await act(async () => { pending!(Response.json({ error: { code: "RESEARCH_QUOTA_DEFERRED", message: "Research quota deferred until 2026-10-17T00:00:00.000Z", retryable: true } }, { status: 429 })); });
    await settle();
    expect(container.querySelector("[data-derivative-status='unavailable-quota']")).not.toBeNull();
    expect(container.textContent).toContain("2026-10-17T00:00:00.000Z");
    await click('[data-derivative-retry="timeline"]');
    expect(container.querySelector("[data-derivative-status='generating']")).not.toBeNull();
  });

  it("closes a result without touching the article, and reports a missing run for the report surface", async () => {
    await renderReader((url) => url.endsWith("/summary")
      ? Response.json({ summary: "Server summary", citations: [] })
      : Response.json({ items: [] }));
    await click('[data-derivative-action="summary"]');
    expect(container.querySelector("[data-derivative-status='ready']")).not.toBeNull();
    await click('[data-derivative-close="summary"]');
    expect(container.querySelector("[data-derivative-panel]")).toBeNull();
    expect(container.querySelector("[data-derivative-idle]")).not.toBeNull();
    expect(article()?.textContent).toBe("Article body");
    await click('[data-derivative-action="report"]');
    expect(container.querySelector("[data-derivative-blocked='missing-run']")).not.toBeNull();
    expect(article()?.textContent).toBe("Article body");
  });

  it("cannot render a response that belongs to a previously viewed item", async () => {
    let resolveFaq: ((response: Response) => void) | null = null;
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => String(input).endsWith("/faq")
      ? new Promise<Response>((resolve) => { resolveFaq = resolve; })
      : Promise.resolve(Response.json({ items: [] })));
    await act(async () => root.render(<Harness knowledgeItemId="knowledge-a" revisionId="revision-a" citationIds={["citation-a"]} />));
    await settle();
    await click('[data-derivative-action="faq"]');
    expect(container.querySelector("[data-derivative-status='generating']")).not.toBeNull();
    await act(async () => root.render(<Harness knowledgeItemId="knowledge-b" revisionId="revision-b" citationIds={["citation-b"]} />));
    await settle();
    expect(resolveFaq).not.toBeNull();
    await act(async () => { resolveFaq!(Response.json({ items: [{ question: "Late question", answer: "Late answer", citations: [citation], gap: false }] })); });
    await settle();
    expect(container.querySelector("[data-derivative-artifact]")).toBeNull();
    expect(container.textContent).not.toContain("Late question");
    expect(container.querySelector("[data-derivative-idle]")).not.toBeNull();
    expect(container.querySelector("[data-derivative-scope]")?.getAttribute("data-derivative-scope")).toBe("1");
  });

  it("generates nothing when the revision exposes no citable chunk", async () => {
    const requests: string[] = [];
    await act(async () => root.render(<Harness knowledgeItemId="knowledge-a" revisionId="revision-a" citationIds={[]} />));
    await settle();
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => { requests.push(String(input)); return Promise.resolve(Response.json({})); });
    expect(container.querySelector("[data-derivative-scope]")?.getAttribute("data-derivative-scope")).toBe("0");
    expect((container.querySelector('[data-derivative-action="summary"]') as HTMLButtonElement).disabled).toBe(true);
    expect(requests).toHaveLength(0);
  });
});
