// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { createAgentIntent, saveAgentIntent } from "../../frontend/lib/agent-turn-intent";
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
  beforeEach(() => { browser = new Window({ url: "https://app.test/agent" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
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

  it("reserves feedback navigation synchronously and releases only on its verified receipt", async () => {
    const late = deferred<Response>();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => String(input).endsWith("/feedback") ? late.promise : answer("Answer", "conv-1"));
    await render(); await question("Question"); await submit();
    expect(unloadBlocked()).toBe(false);
    await act(async () => { button("Useful").click(); expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true); });
    await act(async () => late.resolve(Response.json({feedback: {conversationId: "conv-1", rating: "useful", citationIds: []}}))); await flush();
    expect(container.textContent).toContain("Feedback saved"); expect(unloadBlocked()).toBe(false);
    await act(async () => expect(leave()).toBe("committed"));
  });

  it.each([503, 401, 403, "network", "mismatch"])("retains feedback lock after %s and retries only the exact intent", async (failure) => {
    const writes: string[] = []; let calls = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!String(input).endsWith("/feedback")) return answer("Answer", "conv-1");
      writes.push(String(init?.body));
      if (++calls === 1) {
        if (failure === "network") throw new TypeError("Failed to fetch");
        if (failure === "mismatch") return Response.json({feedback: {conversationId: "other", rating: "useful", citationIds: []}});
        return new Response(null, {status: failure});
      }
      return Response.json({feedback: {conversationId: "conv-1", rating: "useful", citationIds: []}});
    });
    await render(); await question("Question"); await submit(); await click("Useful");
    expect(container.textContent).toContain("Feedback delivery is not confirmed");
    expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
    await click("Retry the same feedback");
    expect(writes).toEqual(Array(2).fill(JSON.stringify({rating: "useful", citationIds: []})));
    expect(container.textContent).toContain("Feedback saved"); expect(unloadBlocked()).toBe(false);
  });

  it.each(["pending", "unknown"])("prevents question and source replacement while feedback is %s", async (phase) => {
    let questions = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/feedback")) return phase === "pending" ? new Promise<Response>(() => undefined) : new Response(null, {status: 503});
      questions++; return answer("Answer", "conv-1");
    });
    await render(); await question("Question"); await submit(); await sourceDraft();
    await click("Useful"); await submit(); await click("Start with these sources");
    expect(questions).toBe(1); expect(sourceIds()).toBe("space-a");
    expect(container.textContent).toContain(phase === "pending" ? "Sending feedback" : "Feedback delivery is not confirmed");
    expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
  });

  it.each(["question", "source"])("rejects captured feedback clicks during a %s discard decision", async (draft) => {
    let writes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {if (String(input).endsWith("/feedback")) {writes++; return new Promise<Response>(() => undefined);} return answer("Answer", "conv-1");});
    await render(); await question("Question"); await submit();
    const node = button("Useful"); const key = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
    const send = (node as unknown as Record<string, {onClick: () => void}>)[key].onClick;
    if (draft === "question") await question("Draft"); else await sourceDraft();
    await act(async () => {expect(leave()).toBe("deferred"); send();});
    expect(writes).toBe(0); await decision(false);
    await click("Useful"); expect(writes).toBe(1); expect(leave()).toBe("blocked");
  });

  it.each(["saved", "unmounted"])("rejects captured feedback callbacks after %s", async (phase) => {
    let writes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/feedback")) {writes++; return Response.json({feedback: {conversationId: "conv-1", rating: "useful", citationIds: []}});}
      return answer("Answer", "conv-1");
    });
    await render(); await question("Question"); await submit();
    const node = button("Useful"); const key = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
    const send = (node as unknown as Record<string, {onClick: () => void}>)[key].onClick;
    if (phase === "saved") await click("Useful");
    else await act(async () => root.render(<AgentRoute locale={language} memberId="other-member" />));
    await act(async () => send()); await flush();
    expect(writes).toBe(phase === "saved" ? 1 : 0);
    expect(unloadBlocked()).toBe(false);
  });

  it("keeps unsent drafts dirty after feedback settles", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => String(input).endsWith("/feedback")
      ? Response.json({feedback: {conversationId: "conv-1", rating: "useful", citationIds: []}}) : answer("Answer", "conv-1"));
    await render(); await question("Question"); await submit(); await question("Follow up draft");
    await click("Useful"); expect(container.textContent).toContain("Feedback saved");
    expect(unloadBlocked()).toBe(true); await act(async () => expect(leave()).toBe("deferred"));
    await decision(false); expect(container.querySelector<HTMLInputElement>("#agent-question")!.value).toBe("Follow up draft");
  });

  it("rejects a feedback callback when a question starts in the same event", async () => {
    let questions = 0; let feedback = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/feedback")) {feedback++; return new Response(null, {status: 503});}
      if (++questions > 1) return new Promise<Response>(() => undefined);
      return answer("Answer", "conv-1");
    });
    await render(); await question("Question"); await submit();
    const node = button("Useful"); const key = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
    const send = (node as unknown as Record<string, {onClick: () => void}>)[key].onClick;
    await act(async () => {sendForm(); send();}); await flush();
    expect(questions).toBe(2); expect(feedback).toBe(0); expect(leave()).toBe("blocked");
  });

  it("rejects captured feedback after a source restart commits in the same event", async () => {
    let writes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {if (String(input).endsWith("/feedback")) {writes++; return new Promise<Response>(() => undefined);} return answer("Answer", "conv-1");});
    await render(); await question("Question"); await submit(); await sourceDraft();
    const node = button("Useful"); const key = Object.keys(node).find(key => key.startsWith("__reactProps$"))!;
    const send = (node as unknown as Record<string, {onClick: () => void}>)[key].onClick;
    await act(async () => {button("Start with these sources").click(); send();}); await flush();
    expect(browser.location.search).toBe("?scope=space&spaceId=space-a");
    expect(writes).toBe(0); expect(unloadBlocked()).toBe(false);
  });

  it("keeps a new member feedback lock when the old member receipt arrives", async () => {
    const old = deferred<Response>(); const current = deferred<Response>(); let feedback = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/feedback")) return ++feedback === 1 ? old.promise : current.promise;
      return Response.json({answer: "Answer", conversationId: "conv-1", citations: [], idempotencyKey: new Headers(init?.headers).get("idempotency-key")});
    });
    await render(); await question("Question"); await submit(); await click("Useful");
    await act(async () => root.render(<AgentRoute locale={language} memberId="new-member" />));
    await question("New member question"); await submit(); await click("Useful");
    await act(async () => old.resolve(Response.json({feedback: {conversationId: "conv-1", rating: "useful", citationIds: []}}))); await flush();
    expect(container.textContent).not.toContain("Feedback saved"); expect(leave()).toBe("blocked");
    await act(async () => current.resolve(Response.json({feedback: {conversationId: "conv-1", rating: "useful", citationIds: []}}))); await flush();
    expect(unloadBlocked()).toBe(false); expect(container.textContent).toContain("Feedback saved");
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

  it("persists an unknown member intent across remount and retries the original payload and key only explicitly", async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init!);
      if (requests.length === 1) throw new Error("response lost");
      return Response.json({ answer: "Recovered answer", conversationId: "recovered-turn", idempotencyKey: new Headers(init?.headers).get("idempotency-key"), citations: [], sources: [] });
    });
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-a" />));
    await question("Original question"); await submit();
    expect(new Headers(requests[0]?.headers).get("idempotency-key")).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    await act(async () => root.render(<div />));
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-a" search="?scope=space&spaceId=other-scope" />)); await flush();
    expect(requests).toHaveLength(1);
    expect(container.textContent).toContain("Original question");
    expect(container.textContent).toContain("Unconfirmed question");
    await click("Retry original question");
    expect(requests).toHaveLength(2);
    expect(requests[1]?.body).toBe(requests[0]?.body);
    expect(new Headers(requests[1]?.headers).get("idempotency-key")).toBe(new Headers(requests[0]?.headers).get("idempotency-key"));
    expect(container.textContent).toContain("Recovered answer");
    await act(async () => root.render(<div />));
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-a" />)); await flush();
    expect(container.textContent).not.toContain("Unconfirmed question");
  });

  it("does not expose another member's unconfirmed intent or accept a mismatched receipt", async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init!); return Response.json({ answer: "Wrong receipt answer", conversationId: "conv-wrong", idempotencyKey: "different-key-0001", citations: [] });
    });
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-a" />));
    await question("Private pending question"); await submit();
    expect(container.textContent).not.toContain("Wrong receipt answer");
    expect(container.textContent).toContain("Unconfirmed question");
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-b" />)); await flush();
    expect(container.textContent).not.toContain("Private pending question");
    expect(requests).toHaveLength(1);
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-a" />)); await flush();
    expect(container.textContent).toContain("Private pending question");
    await click("Abandon unconfirmed question");
    expect(container.textContent).not.toContain("Unconfirmed question");
  });

  it("blocks new writes when the member intent cannot be stored durably in this tab", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const original = browser.sessionStorage;
    Object.defineProperty(browser, "sessionStorage", { configurable: true, value: {
      getItem: (key: string) => original.getItem(key),
      setItem: () => { throw new Error("quota exceeded"); },
      removeItem: (key: string) => original.removeItem(key),
    } });
    try {
      await act(async () => root.render(<AgentRoute locale={language} memberId="member-storage" />));
      await question("Do not send without recovery"); await submit();
      expect(fetcher).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Question recovery storage is unavailable or invalid");
    } finally { Object.defineProperty(browser, "sessionStorage", { configurable: true, value: original }); }
  });

  it("uses a new key with the recovered conversation for the next distinct question", async () => {
    const requests: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init!); return Response.json({ answer: "Verified answer", conversationId: "conv-stable", idempotencyKey: new Headers(init?.headers).get("idempotency-key"), citations: [], sources: [] });
    });
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-sequence" />));
    await question("First"); await submit(); await question("Second"); await submit();
    expect(requests).toHaveLength(2);
    expect(new Headers(requests[0]?.headers).get("idempotency-key")).not.toBe(new Headers(requests[1]?.headers).get("idempotency-key"));
    expect(JSON.parse(String(requests[1]?.body))).toEqual({ question: "Second", scope: { kind: "all" }, conversationId: "conv-stable" });
  });

  function questionInput() { return container.querySelector<HTMLInputElement>("#agent-question")!; }
  function changeQuestion(value: string) {
    const input = questionInput(); input.value = value;
    const key = Object.keys(input).find(name => name.startsWith("__reactProps$"))!;
    (input as unknown as Record<string, {onChange: (event: {currentTarget: HTMLInputElement}) => void}>)[key]!.onChange({currentTarget: input});
  }
  function sendForm() { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", {bubbles: true, cancelable: true}) as unknown as Event); }
  async function decision(accept: boolean) { await act(async () => container.querySelector<HTMLButtonElement>(accept ? "[data-confirm-action]" : "[data-cancel-action]")!.click()); await flush(); }

  it("protects an unsent question edited in the same event and preserves it on cancellation", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await render();
    await act(async () => {changeQuestion("Unsent draft"); expect(leave()).toBe("deferred");});
    expect(browser.location.pathname).toBe("/agent"); expect(unloadBlocked()).toBe(true);
    expect(browser.document.activeElement?.textContent).toBe("Keep editing");
    await decision(false); expect(questionInput().value).toBe("Unsent draft"); expect(fetcher).not.toHaveBeenCalled();
  });

  it("discards an unsent question only on one committed navigation", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await render(); await question("Unsent draft");
    const before = browser.history.length;
    await act(async () => expect(leave()).toBe("deferred"));
    const approve = container.querySelector<HTMLButtonElement>("[data-confirm-action]")!;
    await act(async () => {approve.click(); approve.click();});
    expect(browser.location.pathname).toBe("/tasks"); expect(browser.history.length).toBe(before + 1);
    expect(questionInput().value).toBe(""); expect(unloadBlocked()).toBe(false); expect(fetcher).not.toHaveBeenCalled();
  });

  it("reserves question confirmation synchronously against late edits and submit", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await render(); await question("Unsent draft");
    await act(async () => {expect(leave()).toBe("deferred"); changeQuestion("Late mutation"); sendForm();});
    expect(fetcher).not.toHaveBeenCalled(); await decision(false); expect(questionInput().value).toBe("Unsent draft");
  });

  it("submits the synchronous latest question instead of the previous render value", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {bodies.push(JSON.parse(String(init?.body))); return answer("Verified", "conv-nav");});
    await render(); await question("Previous");
    await act(async () => {changeQuestion("Latest"); sendForm();}); await flush();
    expect(bodies).toEqual([{question: "Latest", scope: {kind: "all"}}]);
    expect(questionInput().value).toBe("Latest"); expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed"));
  });

  it("distinguishes a displayed submitted question from an unsent follow-up", async () => {
    vi.stubGlobal("fetch", async () => answer("Verified", "conv-nav")); await render(); await question("Submitted"); await submit();
    expect(questionInput().value).toBe("Submitted"); expect(unloadBlocked()).toBe(false);
    await question("New follow-up"); expect(unloadBlocked()).toBe(true);
    await act(async () => expect(leave()).toBe("deferred")); await decision(false);
    expect(questionInput().value).toBe("New follow-up");
  });

  it("does not let same-event edits replace a question after submission began", async () => {
    const late = deferred<Response>(); vi.stubGlobal("fetch", () => late.promise);
    await render(); await question("Submitted");
    await act(async () => {sendForm(); changeQuestion("Late mutation");});
    expect(questionInput().value).toBe("Submitted"); expect(questionInput().disabled).toBe(true);
    await act(async () => late.resolve(answer("Verified", "conv-nav"))); await flush();
    expect(questionInput().value).toBe("Submitted"); expect(unloadBlocked()).toBe(false);
  });

  it("preserves the unsent question if a later guard rejects the approved discard", async () => {
    await render(); await question("Unsent draft"); let blocked = false;
    const unregister = registerWorkspaceLeaveGuard(() => ({kind: blocked ? "block" : "allow"}));
    try {
      await act(async () => expect(leave()).toBe("deferred")); blocked = true; await decision(true);
      expect(browser.location.pathname).toBe("/agent"); expect(questionInput().value).toBe("Unsent draft"); expect(unloadBlocked()).toBe(true);
    } finally {unregister();}
  });

  it("asks before a source restart discards an unsent question and clears only on commit", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); await render(); await question("Unsent draft");
    await click("Start with these sources"); expect(browser.location.search).toBe("");
    await decision(false); expect(questionInput().value).toBe("Unsent draft");
    await click("Start with these sources"); await decision(true);
    expect(browser.location.search).toBe("?scope=all"); expect(questionInput().value).toBe(""); expect(unloadBlocked()).toBe(false); expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps unsent question confirmation available when saving its intent fails", async () => {
    const storage = browser.sessionStorage;
    Object.defineProperty(browser, "sessionStorage", {configurable: true, value: {getItem: (key: string) => storage.getItem(key), setItem: () => {throw new Error("quota");}, removeItem: (key: string) => storage.removeItem(key)}});
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    try {
      await act(async () => root.render(<AgentRoute locale={language} memberId="storage-failure" />)); await question("Unsent draft"); await submit();
      expect(container.textContent).toContain("Question recovery storage is unavailable or invalid");
      await act(async () => expect(leave()).toBe("deferred")); await decision(false); expect(unloadBlocked()).toBe(true);
      await act(async () => expect(leave()).toBe("deferred")); await decision(true); expect(browser.location.pathname).toBe("/tasks"); expect(fetcher).not.toHaveBeenCalled();
    } finally {Object.defineProperty(browser, "sessionStorage", {configurable: true, value: storage});}
  });

  it("retains a new unsent question while explicitly retrying the previous failed question", async () => {
    let calls = 0; const questions: string[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      questions.push(JSON.parse(String(init?.body)).question);
      return ++calls === 1 ? new Response(null, {status: 503}) : answer("Verified", "conv-nav");
    });
    await render(); await question("Previous"); await submit(); await question("New unsent"); await click("Try again");
    expect(questions).toEqual(["Previous", "Previous"]); expect(questionInput().value).toBe("New unsent"); expect(unloadBlocked()).toBe(true);
    await act(async () => expect(leave()).toBe("deferred")); await decision(false); expect(questionInput().value).toBe("New unsent");
  });

  function changeSource(selector: string, value: string) {
    const input = container.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
    input.value = value;
    if (input.tagName === "SELECT") {input.dispatchEvent(new browser.Event("change", {bubbles: true}) as unknown as Event); return;}
    const key = Object.keys(input).find(name => name.startsWith("__reactProps$"))!;
    (input as unknown as Record<string, {onChange: (event: {currentTarget: typeof input}) => void}>)[key]!.onChange({currentTarget: input});
  }
  async function sourceDraft() {
    await act(async () => changeSource("#agent-scope-kind", "space"));
    await act(async () => changeSource("#agent-scope-ids", "space-a"));
  }
  function button(label: string) {return [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label)!;}
  function sourceIds() {return container.querySelector<HTMLInputElement>("#agent-scope-ids")!.value;}

  it("protects unapplied source selection and preserves it on cancel", async () => {
    await render(); await sourceDraft();
    await act(async () => expect(leave()).toBe("deferred"));
    expect(unloadBlocked()).toBe(true); await decision(false);
    expect(sourceIds()).toBe("space-a"); expect(browser.location.search).toBe("");
  });
  it("reserves a source discard decision against stale edits and apply", async () => {
    await render(); await sourceDraft();
    await act(async () => {expect(leave()).toBe("deferred"); changeSource("#agent-scope-ids", "late"); button("Start with these sources").click();});
    await decision(false); expect(sourceIds()).toBe("space-a");
    await act(async () => expect(leave()).toBe("deferred")); await decision(true);
    expect(browser.location.pathname).toBe("/tasks"); expect(unloadBlocked()).toBe(false);
  });
  it("applies synchronous latest source selection without a discard prompt", async () => {
    await render(); await sourceDraft();
    await act(async () => {changeSource("#agent-scope-ids", "space-b"); button("Start with these sources").click();});
    expect(new URLSearchParams(browser.location.search).get("spaceId")).toBe("space-b");
    expect(container.querySelector("[data-confirm-action]")).toBeNull(); expect(sourceIds()).toBe("space-b"); expect(unloadBlocked()).toBe(false);
  });
  it("keeps both drafts when source application is canceled then permits a fresh apply", async () => {
    await render(); await question("Unsent question"); await sourceDraft();
    await click("Start with these sources"); await decision(false);
    expect(sourceIds()).toBe("space-a"); expect(questionInput().value).toBe("Unsent question"); expect(unloadBlocked()).toBe(true);
    await click("Start with these sources"); await decision(true);
    expect(new URLSearchParams(browser.location.search).get("spaceId")).toBe("space-a");
    expect(questionInput().value).toBe(""); expect(sourceIds()).toBe("space-a"); expect(unloadBlocked()).toBe(false);
  });
  it("retains source protection after another guard rejects application", async () => {
    await render(); await sourceDraft();
    const remove = registerWorkspaceLeaveGuard(() => ({kind: "block"}));
    await click("Start with these sources"); expect(browser.location.search).toBe(""); remove();
    expect(sourceIds()).toBe("space-a"); expect(unloadBlocked()).toBe(true);
    await act(async () => expect(leave()).toBe("deferred")); await decision(false);
  });
  it("freezes source selection while question discard confirmation admits application", async () => {
    await render(); await question("Unsent question"); await sourceDraft();
    await act(async () => {button("Start with these sources").click(); changeSource("#agent-scope-ids", "late");});
    await decision(true); expect(new URLSearchParams(browser.location.search).get("spaceId")).toBe("space-a");
    expect(sourceIds()).toBe("space-a"); expect(unloadBlocked()).toBe(false);
  });
  it("invalid source drafts remain guarded without navigating or clearing input", async () => {
    await render(); await sourceDraft(); await act(async () => changeSource("#agent-scope-ids", "bad id"));
    await click("Start with these sources"); expect(browser.location.search).toBe(""); expect(sourceIds()).toBe("bad id"); expect(unloadBlocked()).toBe(true);
    await act(async () => expect(leave()).toBe("deferred")); await decision(false);
  });

  it("does not submit or edit a question through a pending source discard decision", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await render(); await sourceDraft();
    await act(async () => {expect(leave()).toBe("deferred"); changeQuestion("Late question"); sendForm();});
    expect(fetcher).not.toHaveBeenCalled(); await decision(false); expect(questionInput().value).toBe("");
  });
  it("uses committed source scope for a question submitted in the same event", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {bodies.push(JSON.parse(String(init?.body))); return answer("Answer", "conv-new");});
    await render(); await sourceDraft();
    await act(async () => {button("Start with these sources").click(); changeQuestion("Scoped question"); sendForm();}); await flush();
    expect(bodies).toEqual([{question: "Scoped question", scope: {kind: "space", spaceId: "space-a"}}]);
  });
  it("retains unapplied sources across question recovery error and explicit abandonment", async () => {
    await act(async () => root.render(<AgentRoute locale={language} memberId="source-owner" />)); await sourceDraft(); await question("Question");
    vi.stubGlobal("fetch", async () => {throw new TypeError("offline");}); await submit();
    expect(container.textContent).toContain("Unconfirmed question");
    await click("Abandon unconfirmed question"); expect(sourceIds()).toBe("space-a"); expect(unloadBlocked()).toBe(true);
    await act(async () => expect(leave()).toBe("deferred")); await decision(false);
  });

  it("keeps both drafts if ordinary navigation is canceled at the second confirmation", async () => {
    await render(); await question("Unsent question"); await sourceDraft();
    await act(async () => expect(leave()).toBe("deferred")); await decision(true);
    expect(browser.location.pathname).toBe("/agent"); await decision(false);
    expect(questionInput().value).toBe("Unsent question"); expect(sourceIds()).toBe("space-a");
    await act(async () => expect(leave()).toBe("deferred")); await decision(true); await decision(true);
    expect(browser.location.pathname).toBe("/tasks"); expect(unloadBlocked()).toBe(false);
  });
  it("ignores captured source edits and application after member replacement", async () => {
    await act(async () => root.render(<AgentRoute locale={language} memberId="source-old" />)); await sourceDraft();
    const input = container.querySelector<HTMLInputElement>("#agent-scope-ids")!;
    const key = Object.keys(input).find(name => name.startsWith("__reactProps$"))!;
    const oldEdit = (input as unknown as Record<string, {onChange: (event: {currentTarget: HTMLInputElement}) => void}>)[key]!.onChange;
    const applyButton = button("Start with these sources");
    const buttonKey = Object.keys(applyButton).find(name => name.startsWith("__reactProps$"))!;
    const oldApply = (applyButton as unknown as Record<string, {onClick: () => void}>)[buttonKey]!.onClick;
    await act(async () => root.render(<AgentRoute locale={language} memberId="source-new" />));
    await act(async () => {input.value = "late"; oldEdit({currentTarget: input}); oldApply();});
    expect(browser.location.search).toBe(""); expect(container.querySelector("#agent-scope-ids")).toBeNull(); expect(unloadBlocked()).toBe(false);
  });

  function unloadBlocked() {
    const event = new browser.Event("beforeunload", {cancelable: true}); browser.dispatchEvent(event); return event.defaultPrevented;
  }
  function leave() { return writeWorkspaceHistory("push", "/tasks"); }

  it("blocks navigation synchronously with the first question POST and releases after a verified receipt", async () => {
    const late = deferred<Response>(); let init: RequestInit | undefined;
    vi.stubGlobal("fetch", (_url: unknown, options?: RequestInit) => {init = options; return late.promise;});
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" />));
    await question("Pending question");
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new browser.Event("submit", {bubbles: true, cancelable: true}) as unknown as Event);
      expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
    });
    expect(browser.location.pathname).toBe("/agent"); expect(init?.signal?.aborted).toBe(false);
    await act(async () => late.resolve(Response.json({answer: "Verified", conversationId: "conv-nav", idempotencyKey: new Headers(init?.headers).get("idempotency-key"), citations: []})));
    await flush(); expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed"));
  });

  it("retains the leave lock for an uncertain question until explicit abandonment", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, {status: 503}));
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" />));
    await question("Unknown question"); await submit();
    expect(container.textContent).toContain("Unconfirmed question"); expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
    await click("Abandon unconfirmed question"); expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed"));
  });

  it("blocks restored unconfirmed questions without replaying and partitions navigation locks by member", async () => {
    expect(saveAgentIntent(createAgentIntent("navigation-member", "Restored", {kind: "all"}))).toBe(true);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" />));
    expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true); expect(fetcher).not.toHaveBeenCalled();
    await act(async () => root.render(<AgentRoute locale={language} memberId="other-member" />));
    expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed")); expect(fetcher).not.toHaveBeenCalled();
  });

  it("blocks unreadable stored questions and releases only after explicit successful clearing", async () => {
    browser.sessionStorage.setItem("memory-garden:agent-turn:v1:navigation-member", "invalid");
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" />));
    expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
    await click("Abandon unconfirmed question"); expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed")); expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not release pending navigation if the stored question disappears before its receipt", async () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" />));
    await question("Pending"); await submit(); browser.sessionStorage.clear();
    expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
    await click("Stop"); expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed"));
  });

  it("keeps the navigation lock when a verified receipt cannot clear its journal", async () => {
    const late = deferred<Response>(); let init: RequestInit | undefined;
    vi.stubGlobal("fetch", (_url: unknown, options?: RequestInit) => {init = options; return late.promise;});
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" />));
    await question("Pending"); await submit();
    const storage = browser.sessionStorage;
    Object.defineProperty(browser, "sessionStorage", {configurable: true, value: {getItem: (key: string) => storage.getItem(key), removeItem: () => {throw new Error("denied");}}});
    try {
      await act(async () => late.resolve(Response.json({answer: "Verified", conversationId: "conv-nav", idempotencyKey: new Headers(init?.headers).get("idempotency-key"), citations: []}))); await flush();
      expect(container.textContent).toContain("Question recovery storage is unavailable or invalid");
      expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
      await click("Abandon unconfirmed question"); expect(leave()).toBe("blocked");
    } finally {Object.defineProperty(browser, "sessionStorage", {configurable: true, value: storage});}
    await click("Abandon unconfirmed question"); await act(async () => expect(leave()).toBe("committed"));
  });

  it("blocks an anonymous preview pending request but allows leaving after explicit Stop", async () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    await render(); await question("Preview"); await submit();
    expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
    await click("Stop"); expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed"));
  });

  it.each([401, 403])("keeps an unconfirmed question locked after denied receipt %s", async (status) => {
    vi.stubGlobal("fetch", async () => new Response(null, {status}));
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" />));
    await question("Denied"); await submit();
    expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
    await click("Abandon unconfirmed question"); await act(async () => expect(leave()).toBe("committed"));
  });

  it("does not release navigation for a mismatched receipt", async () => {
    vi.stubGlobal("fetch", async () => Response.json({answer: "Wrong receipt", conversationId: "conv-nav", idempotencyKey: "another-key-00000001", citations: []}));
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" />));
    await question("Pending"); await submit();
    expect(container.textContent).not.toContain("Wrong receipt"); expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
  });

  it("reads journal availability at navigation time rather than trusting the mounted snapshot", async () => {
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" />));
    const storage = browser.sessionStorage;
    Object.defineProperty(browser, "sessionStorage", {configurable: true, value: {getItem: () => {throw new Error("denied");}}});
    try {expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);}
    finally {Object.defineProperty(browser, "sessionStorage", {configurable: true, value: storage});}
    expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed"));
  });

  it("keeps an unknown feedback rating after refresh and retries the same rating", async () => {
    let feedback = 0; const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/feedback")) {
        bodies.push(JSON.parse(String(init?.body ?? "{}")));
        if (++feedback === 1) return new Response(null, { status: 503 });
        return Response.json({ feedback: { conversationId: "conv-1", rating: "useful", citationIds: [] } });
      }
      const key = new Headers(init?.headers).get("idempotency-key");
      return Response.json({ answer: "Answer", conversationId: "conv-1", evidenceConfidence: 0.3, citations: [], sources: [], ...(key ? { idempotencyKey: key } : {}) });
    });
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-feedback" />)); await flush();
    await question("Question"); await submit(); await click("Useful");
    expect(browser.sessionStorage.getItem("memory-garden:agent-feedback:v1:member-feedback")).toContain("useful");
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-feedback" />)); await flush();
    expect(feedback).toBe(1);
    expect(container.textContent).toContain("Feedback delivery is not confirmed");
    await act(async () => expect(leave()).toBe("blocked"));
    await click("Retry the same feedback");
    expect(feedback).toBe(2); expect(bodies[1]).toEqual({ rating: "useful", citationIds: [] });
    expect(browser.sessionStorage.getItem("memory-garden:agent-feedback:v1:member-feedback")).toBeNull();
  });
  it("does not send feedback when the tab cannot record it", async () => {
    let feedback = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/feedback")) { feedback++; return new Response(null, { status: 503 }); }
      const key = new Headers(init?.headers).get("idempotency-key");
      return Response.json({ answer: "Answer", conversationId: "conv-1", evidenceConfidence: 0.3, citations: [], sources: [], ...(key ? { idempotencyKey: key } : {}) });
    });
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-feedback" />)); await flush();
    await question("Question"); await submit();
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
    await click("Useful");
    expect(feedback).toBe(0);
    expect(container.textContent).toContain("could not record");
  });
  it("blocks feedback when its record cannot be read, and allows leave until it is discarded", async () => {
    let feedback = 0;
    browser.sessionStorage.setItem("memory-garden:agent-feedback:v1:member-feedback", "{");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/feedback")) { feedback++; return Response.json({ feedback: { conversationId: "conv-1", rating: "useful", citationIds: [] } }); }
      const key = new Headers(init?.headers).get("idempotency-key");
      return Response.json({ answer: "Answer", conversationId: "conv-1", evidenceConfidence: 0.3, citations: [], sources: [], ...(key ? { idempotencyKey: key } : {}) });
    });
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-feedback" />)); await flush();
    expect(container.textContent).toContain("can't be read");
    await act(async () => expect(leave()).toBe("committed"));
    expect(feedback).toBe(0);
    browser.history.replaceState({}, "", "/agent");
    await click("Discard record");
    await question("Question"); await submit(); await click("Useful");
    expect(feedback).toBe(1);
  });
  const composerKey = "memory-garden:agent-composer:v1:composer-member";
  it("keeps an unsent question and source after refresh without sending", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<AgentRoute locale={language} memberId="composer-member" />));
    await question("Keep this question");
    await act(async () => changeSource("#agent-scope-kind", "space"));
    await act(async () => changeSource("#agent-scope-ids", "space-a"));
    expect(browser.sessionStorage.getItem(composerKey)).toContain("Keep this question");
    expect(unloadBlocked()).toBe(true);
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<AgentRoute locale={language} memberId="composer-member" />)); await flush();
    expect(questionInput().value).toBe("Keep this question");
    expect(sourceIds()).toBe("space-a");
    expect(fetcher).not.toHaveBeenCalled();
    expect(unloadBlocked()).toBe(true);
  });
  it("keeps the question on screen when the tab cannot record the draft", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await act(async () => root.render(<AgentRoute locale={language} memberId="composer-member" />));
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
    await question("Unrecorded question");
    expect(questionInput().value).toBe("Unrecorded question");
    expect(container.textContent).toContain("could not record");
  });
  it("allows leave when the question draft cannot be read and records only after discard", async () => {
    browser.sessionStorage.setItem(composerKey, "{");
    await act(async () => root.render(<AgentRoute locale={language} memberId="composer-member" />));
    expect(container.textContent).toContain("can't be read");
    expect(unloadBlocked()).toBe(false);
    await act(async () => expect(leave()).toBe("committed"));
    browser.history.replaceState({}, "", "/agent");
    await click("Discard record");
    await question("After discard");
    expect(browser.sessionStorage.getItem(composerKey)).toContain("After discard");
  });
  it("drops the stored question after a confirmed leave", async () => {
    await act(async () => root.render(<AgentRoute locale={language} memberId="composer-member" />));
    await question("Keep this question");
    expect(browser.sessionStorage.getItem(composerKey)).toContain("Keep this question");
    await act(async () => expect(leave()).toBe("deferred"));
    await decision(true);
    expect(browser.sessionStorage.getItem(composerKey)).toBeNull();
    browser.history.replaceState({}, "", "/agent");
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<AgentRoute locale={language} memberId="composer-member" />)); await flush();
    expect(questionInput().value).toBe("");
    expect(unloadBlocked()).toBe(false);
  });
  it("does not restore a question that was already sent", async () => {
    vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
      const key = new Headers(init?.headers).get("idempotency-key");
      return Response.json({ answer: "Answer", conversationId: "conv-1", evidenceConfidence: 0.3, citations: [], sources: [], idempotencyKey: key });
    });
    await act(async () => root.render(<AgentRoute locale={language} memberId="composer-member" />));
    await question("Sent question"); await submit();
    expect(browser.sessionStorage.getItem(composerKey)).toBeNull();
    expect(unloadBlocked()).toBe(false);
  });
  it("does not lock navigation for a read-only conversation restore", async () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" search="?conversationId=conv-read" />));
    expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed"));
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
