// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscussionThreadRoute, MessagesRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { createDiscussionSubmitController } from "../../frontend/pages/messages/discussion-model";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("discussion routes", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    browser = new Window({ url: "https://app.test/messages" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    root = createRoot(container);
  });

  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("creates the authorized context thread and replaces the URL with its canonical thread route", async () => {
    const calls: Array<{ path: string; method?: string; body: string }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), method: init?.method, body: String(init?.body ?? "") });
      return Response.json({ thread: thread(), created: true }, { status: 201 });
    });
    browser.history.replaceState({}, "", "/messages?contextKind=task&contextId=task-1");
    await act(async () => root.render(<MessagesRoute locale={createLocaleRuntime()} search={browser.location.search} />));
    await waitFor(() => browser.location.pathname === "/messages/thread-1");
    expect(calls).toEqual([{ path: "/api/discussions/context", method: "POST", body: JSON.stringify({ kind: "task", id: "task-1" }) }]);
    expect(browser.location.search).toBe("");
  });

  it("prevents duplicate submit and retries an uncertain send with the same client key", async () => {
    const inputs: Array<{ clientKey: string; body: string }> = [];
    let rejectFirst!: (error: Error) => void;
    const uncertain = new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
    const sender = vi.fn(async (input: { clientKey: string; body: string }) => {
      inputs.push(input);
      if (inputs.length === 1) return uncertain;
    });
    const controller = createDiscussionSubmitController(() => "stable-key");
    const input = { context: { kind: "task" as const, id: "task-1" }, body: "Retry me", mentionMemberIds: [] };
    const first = controller.submit(input, sender);
    const duplicate = await controller.submit(input, sender);
    expect(duplicate).toBe(false);
    expect(sender).toHaveBeenCalledTimes(1);
    rejectFirst(new Error("uncertain"));
    await expect(first).rejects.toThrow("uncertain");
    await expect(controller.submit(input, sender)).resolves.toBe(true);
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.clientKey).toBe(inputs[1]?.clientKey);
    expect(inputs[1]).toMatchObject({ body: "Retry me", clientKey: "stable-key" });
  });

  it("aborts a stale thread-list request before resolving a context entry", async () => {
    let listSignal: AbortSignal | undefined;
    let resolveList!: (response: Response) => void;
    const delayedList = new Promise<Response>((resolve) => { resolveList = resolve; });
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).startsWith("/api/discussions?")) {
        listSignal = init?.signal ?? undefined;
        return delayedList;
      }
      if (String(input) === "/api/discussions/context") {
        return Promise.resolve(Response.json({ thread: thread(), created: false }));
      }
      return Promise.reject(new Error(`unexpected request: ${String(input)}`));
    });
    await act(async () => root.render(<MessagesRoute locale={createLocaleRuntime()} search="" />));
    await waitFor(() => listSignal !== undefined);

    browser.history.pushState({}, "", "/messages?contextKind=task&contextId=task-1");
    await act(async () => browser.dispatchEvent(new browser.Event("popstate")));
    await waitFor(() => browser.location.pathname === "/messages/thread-1");

    expect(listSignal?.aborted).toBe(true);
    resolveList(Response.json({ items: [], nextCursor: null }));
  });

  it("rebinds the request controller when history selects another thread id", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const path = String(input);
      calls.push(path);
      const matched = /^\/api\/discussions\/(thread-[12])$/u.exec(path);
      if (matched) return Response.json(thread({ id: matched[1] }));
      if (/^\/api\/discussions\/thread-[12]\/messages\?limit=20$/u.test(path)) return Response.json({ items: [] });
      throw new Error(`unexpected request: ${path}`);
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => calls.length === 2);
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-2" search="" />));
    await waitFor(() => calls.length === 4);

    expect(calls.slice(2)).toEqual([
      "/api/discussions/thread-2",
      "/api/discussions/thread-2/messages?limit=20",
    ]);
  });
});

function thread(overrides: Record<string, unknown> = {}) {
  return { id: "thread-1", contextKind: "task", contextId: "task-1", creatorMemberId: "member-1", lastSequence: 1, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:01:00.000Z", ...overrides };
}
async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    if (predicate()) return;
  }
  throw new Error("condition not reached");
}
