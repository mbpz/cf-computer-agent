// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { saveAgentSession } from "../../frontend/lib/agent-session-store";
import { AgentRoute } from "../../frontend/app";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

vi.mock("../../frontend/lib/markdown-renderer", () => ({ renderSafeMarkdown: (text: string) => <div data-test-markdown>{text}</div> }));

const SESSION_A = "abcdefghijklmnopqrstuvwx";
const SESSION_B = "zyxwvutsrqponmlkjihgfedc";
const TURN_ID = "8f14e45f-ceea-4670-a1c6-8c1b2d3e4f50";
const SESSION_PATTERN = /^[A-Za-z0-9_-]{21,128}$/u;

describe("agent session route", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const language = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(() => { browser = new Window({ url: "https://app.test/agent" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("creates a member session before the first turn and shows the grounded answer", async () => {
    const calls: string[] = []; const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A, memberId: "member-a" } });
      if (url === `/api/agent/sessions/${SESSION_A}/stream`) { bodies.push(JSON.parse(String(init?.body))); return grounded(SESSION_A, "Grounded answer"); }
      throw new Error(`unexpected ${url}`);
    });
    await render("", "member-a");
    await question("Where is the guide?"); await submit();
    expect(calls).toEqual(["POST /api/agent/sessions", `POST /api/agent/sessions/${SESSION_A}/stream`]);
    expect(bodies).toEqual([{ question: "Where is the guide?", scope: { kind: "all" } }]);
    expect(container.textContent).toContain("Grounded answer");
    expect(container.querySelector(`a[href="/agent?conversationId=${SESSION_A}"]`)).not.toBeNull();
    expect(browser.localStorage.getItem("memory-garden:agent-session:v1:member-a")).toContain(SESSION_A);
    expect(sessionJournalCleared("member-a")).toBe(true);
  });

  it("stops waiting, terminates the observed turn and ignores a late answer", async () => {
    const terminations: string[] = [];
    let release!: (value: Response) => void;
    const streamBody = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ stage: "retrieving" })}\n\n`)); release = (value) => { void value.text().then((text) => { try { controller.enqueue(new TextEncoder().encode(text)); controller.close(); } catch { /* cancelled */ } }); }; } });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A } });
      if (url.endsWith("/terminate")) { terminations.push(url); return Response.json({ turn: { turnId: TURN_ID, status: "terminated" } }); }
      if (url === `/api/agent/sessions/${SESSION_A}/stream`) return new Response(streamBody, { headers: { "content-type": "text/event-stream", "x-agent-turn-id": TURN_ID } });
      throw new Error(`unexpected ${url}`);
    });
    await render("", "member-a");
    await question("Stop this answer"); await submit(); await flush();
    expect(container.textContent).toContain("Searching your knowledge");
    await click("Stop"); await flush();
    expect(terminations).toEqual([`/api/agent/sessions/${SESSION_A}/turns/${TURN_ID}/terminate`]);
    expect(container.textContent).toContain(frontendText(language, "AGENT_STOPPED_WAITING"));
    expect(container.querySelector('[data-page-state="loading"]')).toBeNull();
    await act(async () => release(grounded(SESSION_A, "Late answer"))); await flush();
    expect(container.textContent).not.toContain("Late answer");
  });

  it("does not create concurrent turns on double submit", async () => {
    let sessions = 0; let streams = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agent/sessions") { sessions += 1; return Response.json({ session: { id: SESSION_A } }); }
      streams += 1; return new Promise<Response>(() => undefined);
    });
    await render();
    await question("First question");
    await act(async () => { const form = container.querySelector("form")!; form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event); });
    await flush();
    expect(sessions).toBe(1); expect(streams).toBe(1);
    expect(container.querySelector('button[aria-label="Stop"]')).not.toBeNull();
  });

  it("restores an explicitly linked session and continues in it", async () => {
    const calls: string[] = []; const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === `/api/agent/sessions/${SESSION_A}`) return Response.json({ session: { id: SESSION_A } });
      if (url === `/api/agent/sessions/${SESSION_A}/messages?limit=20`) return messages([{ id: "m-2", role: "assistant", content: "Previous answer", createdAt: "2026-10-18T00:00:02.000Z" }, { id: "m-1", role: "user", content: "Previous question", createdAt: "2026-10-18T00:00:01.000Z" }]);
      if (url === `/api/agent/sessions/${SESSION_A}/stream`) { bodies.push(JSON.parse(String(init?.body))); return grounded(SESSION_A, "Follow-up answer"); }
      throw new Error(`unexpected ${url}`);
    });
    await render(`?conversationId=${SESSION_A}`);
    expect(container.textContent).toContain("Previous question"); expect(container.textContent).toContain("Previous answer");
    await question("Next"); await submit();
    expect(bodies).toEqual([{ question: "Next", scope: { kind: "all" } }]);
    expect(container.textContent).toContain("Follow-up answer");
    expect(calls.every((call) => !call.startsWith("POST /api/agent/sessions "))).toBe(true);
  });

  it("restores the member's stored session and source scope after a reload", async () => {
    expect(saveAgentSession({ version: 1, memberId: "member-reload", sessionId: SESSION_A, scope: { kind: "space", spaceId: "s-1" } })).toBe(true);
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/agent/sessions/${SESSION_A}`) return Response.json({ session: { id: SESSION_A } });
      if (url.endsWith("/messages?limit=20")) return messages([{ id: "m-1", role: "user", content: "Sessions survive reloads", createdAt: "2026-10-18T00:00:01.000Z" }]);
      if (url === `/api/agent/sessions/${SESSION_A}/stream`) { bodies.push(JSON.parse(String(init?.body))); return grounded(SESSION_A, "Restored answer"); }
      throw new Error(`unexpected ${url}`);
    });
    await render("", "member-reload");
    expect(container.textContent).toContain("Sessions survive reloads");
    await question("Next"); await submit();
    expect(bodies).toEqual([{ question: "Next", scope: { kind: "space", spaceId: "s-1" } }]);
  });

  it("discards a missing session and starts a new one without an error page", async () => {
    const created: string[] = []; const streamed: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/agent/sessions/${SESSION_A}`) return new Response(null, { status: 404 });
      if (url === "/api/agent/sessions") { created.push(url); return Response.json({ session: { id: SESSION_B } }); }
      if (url === `/api/agent/sessions/${SESSION_B}/stream`) { streamed.push(url); return grounded(SESSION_B, "Fresh answer"); }
      throw new Error(`unexpected ${url}`);
    });
    await render(`?conversationId=${SESSION_A}`, "member-a");
    expect(container.textContent).not.toContain(frontendText(language, "AGENT_RESTORE_FAILED"));
    await question("Fresh start"); await submit();
    expect(created).toHaveLength(1); expect(streamed).toHaveLength(1);
    expect(container.textContent).toContain("Fresh answer");
  });

  it("keeps a failed recovery read-only and retries only the reads", async () => {
    const reads: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      reads.push(`${init?.method ?? "GET"} ${String(input)}`);
      return new Response(null, { status: 503 });
    });
    await render(`?conversationId=${SESSION_A}`);
    expect(container.textContent).toContain(frontendText(language, "AGENT_RESTORE_FAILED"));
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    await click("Try again");
    expect(reads.every((call) => call.startsWith("GET "))).toBe(true);
    expect(reads).toHaveLength(2);
  });

  it("asks a new session with explicit sources when the scope changes", async () => {
    const calls: string[] = []; const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input); calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: calls.length === 1 ? SESSION_A : SESSION_B } });
      if (url.endsWith("/stream")) { bodies.push(JSON.parse(String(init?.body))); return grounded(url.includes(SESSION_A) ? SESSION_A : SESSION_B, "Answer"); }
      throw new Error(`unexpected ${url}`);
    });
    await render();
    await question("First"); await submit();
    await chooseSourceKind("Selected knowledge items");
    const ids = container.querySelector<HTMLInputElement>("#agent-scope-ids")!;
    await act(async () => {
      ids.value = "k-1, k-2";
      const key = Object.keys(ids).find((name) => name.startsWith("__reactProps$"))!;
      (ids as unknown as Record<string, { onChange: (event: { currentTarget: HTMLInputElement }) => void }>)[key]!.onChange(({ currentTarget: ids, target: ids }) as never);
    });
    await click("Start with these sources");
    expect(browser.location.search).toBe("?scope=items&knowledgeItemId=k-1&knowledgeItemId=k-2");
    await question("Scoped"); await submit();
    expect(bodies[1]).toEqual({ question: "Scoped", scope: { kind: "items", knowledgeItemIds: ["k-1", "k-2"] } });
    expect(calls.filter((call) => call === "POST /api/agent/sessions")).toHaveLength(2);
  });

  it("shows the pipeline stage the server reports before the answer arrives", async () => {
    const late = deferredVoid();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A } });
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ stage: "retrieving" })}\n\n`));
          void late.promise.then(() => { controller.enqueue(new TextEncoder().encode(terminal(SESSION_A, "Grounded answer"))); controller.close(); });
        },
      }), { headers: { "content-type": "text/event-stream", "x-agent-turn-id": TURN_ID } });
    });
    await render(); await question("Where is the guide?"); await submit(); await flush();
    expect(container.textContent).toContain("Searching your knowledge");
    expect(container.textContent).not.toContain("Grounded answer");
    await act(async () => late.resolve()); await flush();
    expect(container.textContent).toContain("Grounded answer");
  });

  it("states an explicit no-evidence refusal and keeps the session recoverable", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A } });
      return terminalResponse(SESSION_A, { answer: "知识库中没有足够依据回答这个问题。", evidenceConfidence: 0.1, messageKey: "KNOWLEDGE_EVIDENCE_INSUFFICIENT", suggestedActionKeys: ["KNOWLEDGE_CHAT_REWRITE_QUESTION", "KNOWLEDGE_CHAT_EXPAND_SCOPE"] });
    });
    await render(); await question("Unclear question"); await submit();
    const refusal = container.querySelector<HTMLElement>("[data-agent-refused]")!;
    expect(refusal).toBeTruthy();
    expect(refusal.textContent).toContain("Not enough evidence");
    expect(refusal.textContent).toContain("Rewrite the question");
    expect(container.textContent).not.toContain("知识库中没有足够依据回答这个问题。");
    expect(container.querySelector(`a[href="/agent?conversationId=${SESSION_A}"]`)).not.toBeNull();
  });

  it("distinguishes a quota deferral, a degraded backend and a transport failure", async () => {
    let mode: "quota" | "degraded" | "transport" = "degraded";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A } });
      if (mode === "transport") throw new TypeError("Failed to fetch");
      const code = mode === "quota" ? "AI_QUOTA_EXHAUSTED" : "AI_UNAVAILABLE";
      return new Response(`data: ${JSON.stringify({ stage: "error", error: { code, message: "unavailable", status: 503, retryable: true } })}\n\n`, { headers: { "content-type": "text/event-stream", "x-agent-turn-id": TURN_ID } });
    });
    await render();
    await question("Degraded turn"); await submit();
    expect(container.querySelector('[data-agent-unavailable="degraded"]')).toBeTruthy();
    expect(container.textContent).toContain("temporarily unavailable");
    mode = "quota";
    await question("Quota turn"); await submit();
    expect(container.querySelector('[data-agent-unavailable="quota"]')).toBeTruthy();
    expect(container.textContent).toContain("quota is exhausted");
    mode = "transport";
    await question("Transport turn"); await submit();
    expect(container.querySelector("[data-agent-unavailable]")).toBeNull();
    expect(container.querySelector('[data-page-state="error"]')).toBeTruthy();
  });

  it("persists an unknown question and retries it against the same session", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A } });
      requests.push({ url, body: JSON.parse(String(init?.body)) });
      if (requests.length === 1) throw new TypeError("response lost");
      return grounded(SESSION_A, "Recovered answer");
    });
    await render("", "member-a");
    await question("Original question"); await submit();
    expect(container.textContent).toContain(frontendText(language, "AGENT_INTENT_UNKNOWN"));
    await act(async () => root.render(<div />));
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-a" search="?scope=space&spaceId=other-scope" />)); await flush();
    expect(container.textContent).toContain("Original question");
    expect(container.textContent).toContain(frontendText(language, "AGENT_INTENT_UNKNOWN"));
    await click("Retry original question");
    expect(requests).toHaveLength(2);
    expect(requests[1]!.url).toBe(`/api/agent/sessions/${SESSION_A}/stream`);
    expect(requests[1]!.body).toEqual(requests[0]!.body);
    expect(container.textContent).toContain("Recovered answer");
  });

  it("does not create a session when the question journal cannot be stored", async () => {
    const fetcher = vi.fn();
    const storage = browser.sessionStorage;
    Object.defineProperty(browser, "sessionStorage", { configurable: true, value: { getItem: (key: string) => storage.getItem(key), setItem: () => { throw new Error("quota exceeded"); }, removeItem: () => storage.removeItem(key) } });
    try {
      await act(async () => root.render(<AgentRoute locale={language} memberId="member-storage" />));
      vi.stubGlobal("fetch", fetcher);
      await question("Do not send without recovery"); await submit();
      expect(fetcher).not.toHaveBeenCalled();
      expect(container.textContent).toContain("Question recovery storage is unavailable or invalid");
    } finally { Object.defineProperty(browser, "sessionStorage", { configurable: true, value: storage }); }
  });

  it("does not expose another member's unconfirmed question or journal", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A } });
      requests.push(url); return new Response(null, { status: 503 });
    });
    await render("", "member-a");
    await question("Private pending question");
    await submit();
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-b" />)); await flush();
    expect(container.textContent).not.toContain("Private pending question");
    expect(requests).toHaveLength(1);
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-a" />)); await flush();
    expect(container.textContent).toContain("Private pending question");
    await click("Abandon unconfirmed question");
    expect(container.textContent).not.toContain("Private pending question");
  });

  it("blocks navigation synchronously while the turn is pending and releases after a verified receipt", async () => {
    const late = deferred<Response>();
    let streams = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A } });
      streams += 1; return late.promise;
    });
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" />));
    await question("Pending question");
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }) as unknown as Event);
      expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
    });
    await act(async () => late.resolve(grounded(SESSION_A, "Verified"))); await flush();
    expect(streams).toBe(1);
    expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed"));
  });

  it("blocks an anonymous preview pending request but allows leaving after Stop", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A } });
      return new Promise<Response>(() => undefined);
    });
    await render(); await question("Preview"); await submit();
    expect(leave()).toBe("blocked"); expect(unloadBlocked()).toBe(true);
    await click("Stop"); expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed"));
  });

  it("protects an unsent question and clears it only on committed navigation", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await render(); await question("Unsent draft");
    await act(async () => { expect(leave()).toBe("deferred"); });
    expect(unloadBlocked()).toBe(true);
    await decision(false); expect(questionInput().value).toBe("Unsent draft"); expect(fetcher).not.toHaveBeenCalled();
    await act(async () => expect(leave()).toBe("deferred")); await decision(true);
    expect(browser.location.pathname).toBe("/tasks"); expect(questionInput().value).toBe(""); expect(unloadBlocked()).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("asks before a source restart discards an unsent question and clears only on commit", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await render(); await question("Unsent draft");
    await choice("One space"); await act(async () => changeSource("#agent-scope-ids", "space-a"));
    await click("Start with these sources"); await decision(false);
    expect(questionInput().value).toBe("Unsent draft"); expect(browser.location.search).toBe("");
    await click("Start with these sources"); await decision(true);
    expect(browser.location.search).toBe("?scope=space&spaceId=space-a");
    expect(questionInput().value).toBe(""); expect(unloadBlocked()).toBe(false); expect(fetcher).not.toHaveBeenCalled();
  });

  it("restores an unsent composer draft without sending", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<AgentRoute locale={language} memberId="composer-member" />));
    await question("Keep this question");
    await choice("One space"); await act(async () => changeSource("#agent-scope-ids", "space-a"));
    expect(browser.sessionStorage.getItem("memory-garden:agent-composer:v1:composer-member")).toContain("Keep this question");
    await act(async () => root.unmount()); root = createRoot(container);
    await act(async () => root.render(<AgentRoute locale={language} memberId="composer-member" />)); await flush();
    expect(questionInput().value).toBe("Keep this question");
    expect(container.querySelector<HTMLInputElement>("#agent-scope-ids")!.value).toBe("space-a");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not restore a question that was already sent", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A } });
      return grounded(SESSION_A, "Answer");
    });
    await render("", "composer-member");
    await question("Sent question"); await submit();
    expect(browser.sessionStorage.getItem("memory-garden:agent-composer:v1:composer-member")).toBeNull();
    expect(unloadBlocked()).toBe(false);
  });

  it("does not lock navigation for a read-only session restore", async () => {
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    await act(async () => root.render(<AgentRoute locale={language} memberId="navigation-member" search={`?conversationId=${SESSION_A}`} />));
    expect(unloadBlocked()).toBe(false); await act(async () => expect(leave()).toBe("committed"));
  });

  it("ignores a success granted after the route was replaced", async () => {
    const late = deferred<Response>(); let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/agent/sessions") return Response.json({ session: { id: SESSION_A } });
      signal = init?.signal ?? undefined; return late.promise;
    });
    await render("", "member-replace");
    await question("Question"); await submit();
    await act(async () => root.render(<AgentRoute locale={language} memberId="member-replace" search="?scope=space&spaceId=other" />));
    expect(signal?.aborted).toBe(true);
    await act(async () => late.resolve(grounded(SESSION_A, "Old answer"))); await flush();
    expect(container.textContent).not.toContain("Old answer");
  });

  it("rejects an invalid source link without asking across all sources", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<AgentRoute locale={language} search="?scope=items" />)); await flush();
    expect(container.textContent).toContain("Invalid source scope");
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled ?? true).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });

  function questionInput() { return container.querySelector<HTMLInputElement>("#agent-question")!; }
  function changeQuestion(value: string) {
    const input = questionInput(); input.value = value;
    const key = Object.keys(input).find(name => name.startsWith("__reactProps$"))!;
    (input as unknown as Record<string, {onChange: (event: {currentTarget: HTMLInputElement}) => void}>)[key]!.onChange(({ currentTarget: input, target: input }) as never);
  }
  function sendForm() { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", {bubbles: true, cancelable: true}) as unknown as Event); }
  function confirmationControl(selector: string) { return container.querySelector<HTMLButtonElement>(selector) ?? browser.document.querySelector<HTMLButtonElement>(selector); }
  async function decision(accept: boolean) { await act(async () => confirmationControl(accept ? "[data-confirm-action]" : "[data-cancel-action]")!.click()); await flush(); }
  function changeSource(selector: string, value: string) {
    const input = container.querySelector<HTMLInputElement>(selector)!; input.value = value;
    const key = Object.keys(input).find(name => name.startsWith("__reactProps$"))!;
    (input as unknown as Record<string, {onChange: (event: {currentTarget: typeof input}) => void}>)[key]!.onChange(({ currentTarget: input, target: input }) as never);
  }
  async function choice(label: string) {
    const trigger = container.querySelector<HTMLButtonElement>("#agent-scope-kind [aria-haspopup=\"listbox\"]")!;
    expect(trigger).toBeTruthy();
    await act(async () => trigger.click());
    const option = [...container.querySelectorAll<HTMLButtonElement>("#agent-scope-kind [role=\"option\"]")].find((node) => node.textContent === label);
    expect(option, label).toBeTruthy();
    await act(async () => option!.click());
  }
  async function chooseSourceKind(label: string) { await choice(label); }
  function findButton(label: string) {return [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label || node.getAttribute("aria-label") === label);}
  async function render(search = "", memberId?: string) { await act(async () => root.render(<AgentRoute locale={language} memberId={memberId} search={search} />)); await flush(); }
  async function question(value: string) {
    const input = questionInput();
    await act(async () => {
      input.value = value;
      const key = Object.keys(input).find((name) => name.startsWith("__reactProps$"));
      const props = key ? (input as unknown as Record<string, { onChange?: (event: { currentTarget: HTMLInputElement }) => void }>)[key] : undefined;
      expect(props?.onChange).toBeTypeOf("function");
      props!.onChange!({ currentTarget: input });
    });
  }
  async function submit() { await act(async () => sendForm()); await flush(); }
  async function click(label: string) { const button = findButton(label); expect(button, label).toBeTruthy(); await act(async () => button!.click()); await flush(); }
  function unloadBlocked() { const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; }
  function leave() { return writeWorkspaceHistory("push", "/tasks"); }
});

function terminal(sessionId: string, answer: string, extra: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ stage: "answer", body: { answer, evidenceConfidence: 0.9, citations: [], sources: [], sessionId, conversationId: sessionId, turnId: TURN_ID, ...extra } })}\n\n`;
}
function grounded(sessionId: string, answer: string, extra: Record<string, unknown> = {}): Response {
  return new Response(terminal(sessionId, answer, extra), { headers: { "content-type": "text/event-stream", "x-agent-turn-id": TURN_ID } });
}
function terminalResponse(sessionId: string, body: Record<string, unknown>): Response {
  return grounded(sessionId, String(body.answer ?? ""), body);
}
function messages(items: unknown[]): Response { return Response.json({ messages: { items, truncated: false } }); }
function sessionJournalCleared(memberId: string): boolean { return globalThis.window!.sessionStorage.getItem(`memory-garden:agent-turn:v1:${encodeURIComponent(memberId)}`) === null; }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index++) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
function deferredVoid() { let resolve!: () => void; const promise = new Promise<void>((yes) => { resolve = yes; }); return { promise, resolve }; }
