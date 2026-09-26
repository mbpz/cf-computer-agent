// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

vi.mock("../../frontend/lib/markdown-renderer", () => ({ renderSafeMarkdown: (text: string) => <div data-test-markdown>{text}</div> }));

describe("agent request cancellation route", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const language = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(() => { browser = new Window({ url: "https://app.test/agent" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("leaves loading on Stop without claiming server cancellation and ignores a late answer", async () => {
    const late = deferred<Response>(); let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => { signal = init?.signal ?? undefined; return late.promise; });
    await render(); await question("First question"); await submit();
    await click("Stop");
    expect(signal?.aborted).toBe(true);
    expect(container.textContent).toContain("Server cancellation is not confirmed");
    expect(container.querySelector('[data-page-state="loading"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    await act(async () => late.resolve(answer("Late answer", "old-conversation"))); await flush();
    expect(container.textContent).not.toContain("Late answer");
  });

  it("does not create concurrent turns on double submit", async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => { requests.push(init!); return new Promise<Response>(() => undefined); });
    await render(); await question("First question");
    await act(async () => { const form = container.querySelector("form")!; form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); });
    expect(requests).toHaveLength(1);
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  });

  it("starts a fresh conversation after Stop even if remote cancellation fails", async () => {
    const bodies: Array<Record<string, unknown>> = []; const cancellations: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/cancel")) { cancellations.push(url); return new Response(null, { status: 503 }); }
      bodies.push(JSON.parse(String(init?.body)));
      if (bodies.length === 2) return new Promise<Response>(() => undefined);
      return answer(bodies.length === 1 ? "First answer" : "Fresh answer", bodies.length === 1 ? "conversation-1" : "conversation-2");
    });
    await render(); await question("First"); await submit();
    await question("Second"); await submit(); await click("Stop"); await submit();
    expect(bodies).toHaveLength(3);
    expect(bodies[1]).toMatchObject({ conversationId: "conversation-1" });
    expect(bodies[2]).not.toHaveProperty("conversationId");
    expect(cancellations).toEqual(["/api/knowledge/chat/conversations/conversation-1/cancel"]);
    expect(container.textContent).toContain("Fresh answer");
  });

  it("blocks an invalid source link instead of asking across all sources", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<AgentRoute locale={language} search="?scope=items" />)); await flush();
    expect(container.textContent).toContain("Invalid source scope");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled ?? true).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("restores authorized history and follows up using its server scope and id", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "GET") return new Response(JSON.stringify({ conversation: { id: "conv-1", scope: { kind: "space", spaceId: "s-1" } }, messages: [{ role: "user", content: "Previous question", citationIds: [] }, { role: "assistant", content: "Previous answer", citationIds: [] }], sources: [] }));
      bodies.push(JSON.parse(String(init?.body))); return answer("Follow-up answer", "conv-1");
    });
    await act(async () => root.render(<AgentRoute locale={language} search="?conversationId=conv-1" />)); await flush();
    expect(container.textContent).toContain("Previous question"); expect(container.textContent).toContain("Previous answer");
    await question("Next"); await submit();
    expect(bodies).toEqual([{ question: "Next", scope: { kind: "space", spaceId: "s-1" }, conversationId: "conv-1" }]);
  });

  it("keeps failed recovery read-only and suppresses late history after navigation", async () => {
    const late = deferred<Response>(); const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => { calls.push(init!); return late.promise; });
    await act(async () => root.render(<AgentRoute locale={language} search="?conversationId=conv-1" />)); await flush();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled ?? true).toBe(true);
    await act(async () => root.render(<AgentRoute locale={language} search="?scope=items&knowledgeItemId=k-2" />)); await flush();
    await act(async () => late.resolve(new Response(JSON.stringify({ conversation: { id: "conv-1", scope: { kind: "all" } }, messages: [{ role: "user", content: "Old private history", citationIds: [] }], sources: [] })))); await flush();
    expect(container.textContent).not.toContain("Old private history");
    expect(calls.every((call) => call.method === "GET")).toBe(true);
  });

  it("applies explicit source choices in a fresh conversation without a scope mutation", async () => {
    const bodies: unknown[] = []; const methods: string[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => { methods.push(init?.method ?? "GET"); bodies.push(JSON.parse(String(init?.body))); return answer("Answer", "conv-existing"); });
    await render(); await question("First"); await submit();
    const select = container.querySelector<HTMLSelectElement>("#agent-scope-kind")!;
    expect(select).toBeTruthy();
    await act(async () => { select.value = "items"; select.dispatchEvent(new browser.Event("change", { bubbles: true }) as unknown as Event); });
    const ids = container.querySelector<HTMLInputElement>("#agent-scope-ids")!;
    await act(async () => {
      ids.value = "k-1, k-2";
      const key = Object.keys(ids).find((name) => name.startsWith("__reactProps$"))!;
      (ids as unknown as Record<string, { onChange: (event: { currentTarget: HTMLInputElement }) => void }>)[key]!.onChange({ currentTarget: ids });
    });
    await click("Start with these sources");
    expect(browser.location.search).toBe("?scope=items&knowledgeItemId=k-1&knowledgeItemId=k-2");
    await question("Scoped"); await submit();
    expect(methods).toEqual(["POST", "POST"]);
    expect(bodies[1]).toEqual({ question: "Scoped", scope: { kind: "items", knowledgeItemIds: ["k-1", "k-2"] } });
  });

  it("keeps recovery failures locked and retries only the GET", async () => {
    const methods: string[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => { methods.push(init?.method ?? "GET"); return new Response(null, { status: 503 }); });
    await act(async () => root.render(<AgentRoute locale={language} search="?conversationId=conv-1" />)); await flush();
    expect(container.textContent).toContain("Conversation could not be restored");
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    await click("Try again");
    expect(methods).toEqual(["GET", "GET"]);
  });

  it("shows insufficient evidence without broadening sources and retries only the uncertain feedback", async () => {
    const bodies: Array<{ url: string; body: unknown }> = []; let feedbackCalls = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); const body = JSON.parse(String(init?.body)); bodies.push({ url, body });
      if (url.endsWith("/feedback")) {
        if (++feedbackCalls === 1) return new Response(null, { status: 503 });
        return new Response(JSON.stringify({ feedback: { conversationId: "conv-1", ...body } }));
      }
      return new Response(JSON.stringify({ answer: "Not enough grounded evidence", conversationId: "conv-1", citations: [], messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT", suggestedActionKeys: ["KNOWLEDGE_CHAT_REWRITE_QUESTION", "KNOWLEDGE_CHAT_EXPAND_SCOPE"] }));
    });
    await act(async () => root.render(<AgentRoute locale={language} search="?scope=items&knowledgeItemId=k-1" />)); await flush();
    await question("Unclear question"); await submit();
    expect(container.textContent).toContain("Not enough evidence");
    expect(container.textContent).toContain("Rewrite the question");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.body).toMatchObject({ scope: { kind: "items", knowledgeItemIds: ["k-1"] } });
    await click("Not useful");
    expect(container.textContent).toContain("Feedback delivery is not confirmed");
    await click("Retry the same feedback");
    expect(container.textContent).toContain("Feedback saved");
    expect(bodies.slice(1)).toEqual(Array(2).fill({ url: "/api/knowledge/chat/conversations/conv-1/feedback", body: { rating: "not_useful", citationIds: [] } }));
  });

  it("prevents concurrent feedback writes and ignores receipt from a replaced conversation", async () => {
    const late = deferred<Response>(); let writes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/feedback")) { writes++; return late.promise; }
      return answer("Answer", "conv-1");
    });
    await render(); await question("Question"); await submit();
    const useful = [...container.querySelectorAll("button")].find((button) => button.textContent === "Useful")!;
    expect(useful).toBeTruthy();
    await act(async () => { useful.click(); useful.click(); });
    expect(writes).toBe(1);
    await act(async () => root.render(<AgentRoute locale={language} search="?scope=items&knowledgeItemId=k-2" />)); await flush();
    await act(async () => late.resolve(new Response(JSON.stringify({ feedback: { conversationId: "conv-1", rating: "useful", citationIds: [] } })))); await flush();
    expect(container.textContent).not.toContain("Feedback saved");
  });

  it("opens history explicitly, pages and retries the same read without asking", async () => {
    const urls: string[] = []; let fail = true;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input)); expect(init?.method).toBe("GET");
      if (String(input).includes("cursor=")) {
        if (fail) return new Response(null, { status: 503 });
        return Response.json({ items: [{ id: "older", createdAt: "2026-09-25T00:00:00.000Z" }] });
      }
      return Response.json({ items: [{ id: "newer", createdAt: "2026-09-26T00:00:00.000Z" }], nextCursor: "opaque_123" });
    });
    await render(); expect(urls).toEqual([]);
    await click("Conversation history");
    expect(container.querySelector('a[href="/agent?conversationId=newer"]')).not.toBeNull();
    await click("Older conversations");
    expect(container.querySelector('a[href="/agent?conversationId=newer"]')).toBeNull();
    expect(container.textContent).toContain("Conversation history could not be loaded");
    fail = false; await click("Retry history");
    expect(urls.at(-1)).toBe(urls.at(-2));
    expect(container.querySelector('a[href="/agent?conversationId=older"]')).not.toBeNull();
    await click("Newer conversations");
    expect(container.querySelector('a[href="/agent?conversationId=newer"]')).not.toBeNull();
  });

  it("ignores a late conversation list after route replacement", async () => {
    const late = deferred<Response>(); let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", (_input: RequestInfo | URL, init?: RequestInit) => { signal = init?.signal ?? undefined; return late.promise; });
    await render(); await click("Conversation history");
    await act(async () => root.render(<AgentRoute locale={language} search="?scope=space&spaceId=other" />));
    expect(signal?.aborted).toBe(true);
    await act(async () => late.resolve(Response.json({ items: [{ id: "old-private-list", createdAt: "2026-09-26T00:00:00.000Z" }] }))); await flush();
    expect(container.textContent).not.toContain("old-private-list");
  });

  async function render() { await act(async () => root.render(<AgentRoute locale={language} />)); await flush(); }
  async function question(value: string) {
    const input = container.querySelector<HTMLInputElement>("#agent-question")!;
    await act(async () => {
      input.value = value;
      const key = Object.keys(input).find((name) => name.startsWith("__reactProps$"));
      const props = key ? (input as unknown as Record<string, { onChange?: (event: { currentTarget: HTMLInputElement }) => void }>)[key] : undefined;
      expect(props?.onChange).toBeTypeOf("function");
      props!.onChange!({ currentTarget: input });
    });
  }
  async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event)); await flush(); }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label); expect(button).toBeTruthy(); await act(async () => button!.click()); await flush(); }
});
function answer(text: string, conversationId: string) { return new Response(JSON.stringify({ answer: text, conversationId, evidenceConfidence: 0.3, citations: [], sources: [] }), { headers: { "content-type": "application/json" } }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index++) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
