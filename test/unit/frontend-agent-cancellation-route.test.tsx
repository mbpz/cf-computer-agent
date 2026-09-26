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
