// @vitest-environment node
import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DiscussionThreadRoute, MessagesRoute } from "../../frontend/app";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { readWorkspaceLocation, WORKSPACE_LOCATION_CHANGE_EVENT, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
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
    vi.stubGlobal("Event", browser.Event); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("HTMLTextAreaElement", browser.HTMLTextAreaElement);
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

  it("binds an uncertain client key to normalized send semantics and rotates it after every semantic edit", async () => {
    const keys = ["key-1", "key-2", "key-3", "key-4", "key-5", "key-6"];
    const sent: Array<{ clientKey: string; body: string }> = [];
    const controller = createDiscussionSubmitController(() => keys.shift()!);
    const sender = async (input: { clientKey: string; body: string }) => {
      sent.push(input);
      throw new Error("response lost");
    };
    const original = { context: { kind: "task" as const, id: "task-1" }, body: "  Original  ", mentionMemberIds: ["member-2"] };

    await expect(controller.submit(original, sender)).rejects.toThrow("response lost");
    await expect(controller.submit({ ...original, body: "Original" }, sender)).rejects.toThrow("response lost");
    await expect(controller.submit({ ...original, body: "Edited" }, sender)).rejects.toThrow("response lost");
    await expect(controller.submit({ ...original, body: "Edited", replyToMessageId: "message-1" }, sender)).rejects.toThrow("response lost");
    await expect(controller.submit({ ...original, body: "Edited", replyToMessageId: "message-1", mentionMemberIds: ["member-3"] }, sender)).rejects.toThrow("response lost");
    await expect(controller.submit({ ...original, context: { kind: "knowledge", id: "knowledge-1" }, body: "Edited", replyToMessageId: "message-1" }, sender)).rejects.toThrow("response lost");
    await expect(controller.submit(original, sender)).rejects.toThrow("response lost");

    expect(sent.map(({ clientKey }) => clientKey)).toEqual([
      "key-1", "key-1", "key-2", "key-3", "key-4", "key-5", "key-6",
    ]);
  });

  it("rotates the client key after a successful send even when the next message has identical semantics", async () => {
    const keys = ["key-1", "key-2"];
    const sent: string[] = [];
    const controller = createDiscussionSubmitController(() => keys.shift()!);
    const sender = async (input: { clientKey: string }) => { sent.push(input.clientKey); };
    const input = { context: { kind: "task" as const, id: "task-1" }, body: "Same text", mentionMemberIds: [] };

    await expect(controller.submit(input, sender)).resolves.toBe(true);
    await expect(controller.submit(input, sender)).resolves.toBe(true);

    expect(sent).toEqual(["key-1", "key-2"]);
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

  it("isolates ready content, composer state, and stale send completion across an A to B thread switch", async () => {
    let resolveThreadB!: (response: Response) => void;
    let resolveMessagesB!: (response: Response) => void;
    let resolveSendA!: (response: Response) => void;
    const delayedThreadB = new Promise<Response>((resolve) => { resolveThreadB = resolve; });
    const delayedMessagesB = new Promise<Response>((resolve) => { resolveMessagesB = resolve; });
    const delayedSendA = new Promise<Response>((resolve) => { resolveSendA = resolve; });
    const calls: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      calls.push(`${init?.method ?? "GET"} ${path}`);
      if (path === "/api/discussions/thread-1") return Promise.resolve(Response.json(thread()));
      if (path === "/api/discussions/thread-1/messages?limit=20") return Promise.resolve(Response.json({ items: [message()] }));
      if (path === "/api/discussions/thread-2") return delayedThreadB;
      if (path === "/api/discussions/thread-2/messages?limit=20") return delayedMessagesB;
      if (path === "/api/discussions/messages" && init?.method === "POST") return delayedSendA;
      return Promise.reject(new Error(`unexpected request: ${path}`));
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("[data-message-id='message-1']") !== null);
    const textarea = container.querySelector("#discussion-composer") as HTMLTextAreaElement;
    await changeReactTextarea(textarea, "Draft for A");
    await act(async () => (container.querySelector("[data-message-id='message-1'] button") as HTMLButtonElement).click());
    await act(async () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => calls.includes("POST /api/discussions/messages"));

    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-2" search="" />));

    expect(container.querySelector("[data-message-id='message-1']")).toBeNull();
    expect(container.querySelector("#discussion-composer")).toBeNull();
    expect(container.textContent).toContain("Loading discussion history");

    resolveThreadB(Response.json(thread({ id: "thread-2", contextId: "task-2" })));
    resolveMessagesB(Response.json({ items: [message({ id: "message-2", threadId: "thread-2", body: "Thread B" })] }));
    await waitFor(() => container.querySelector("[data-message-id='message-2']") !== null);
    expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("");
    expect(container.textContent).not.toContain("Replying to member-1");

    resolveSendA(Response.json({
      thread: thread(),
      message: message({ id: "message-a-2", sequence: 2, body: "Draft for A", replyToMessageId: "message-1", clientKey: "client-a-2" }),
      created: true,
    }, { status: 201 }));
    await act(async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); });

    expect(calls.filter((call) => call.includes("thread-2"))).toEqual([
      "GET /api/discussions/thread-2",
      "GET /api/discussions/thread-2/messages?limit=20",
    ]);
    expect(container.querySelector("[data-message-id='message-2']")).not.toBeNull();
  });

  it("does not clear a draft whose reply semantics changed while an earlier send was pending", async () => {
    let resolveSend!: (response: Response) => void;
    const delayedSend = new Promise<Response>((resolve) => { resolveSend = resolve; });
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/discussions/thread-1") return Promise.resolve(Response.json(thread()));
      if (path === "/api/discussions/thread-1/messages?limit=20") return Promise.resolve(Response.json({ items: [message()] }));
      if (path === "/api/discussions/messages" && init?.method === "POST") return delayedSend;
      return Promise.reject(new Error(`unexpected request: ${path}`));
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("[data-message-id='message-1']") !== null);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Keep this draft");
    await act(async () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => (container.querySelector("[data-message-id='message-1'] button") as HTMLButtonElement).click());

    resolveSend(Response.json({
      thread: thread(),
      message: message({ id: "message-2", sequence: 2, body: "Keep this draft", clientKey: "client-2" }),
      created: true,
    }, { status: 201 }));
    await waitFor(() => (container.querySelector("#discussion-composer") as HTMLTextAreaElement).disabled === false);

    expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("Keep this draft");
    expect(container.textContent).toContain("Replying to member-1");
  });

  it("synchronizes internal cursor state when the sidebar re-enters the canonical messages route", async () => {
    const discussionCalls: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/navigation") return Promise.reject(new Error("navigation unavailable"));
      if (path.startsWith("/api/discussions?")) {
        discussionCalls.push(path);
        return Promise.resolve(Response.json({ items: [] }));
      }
      return Promise.reject(new Error(`unexpected request: ${path}`));
    });
    browser.history.replaceState({}, "", "/messages?page=2&cursor=cursor_2");
    const session = {
      member: { id: "member-1", email: "member@example.com", role: "contributor" as const },
      capabilities: ["knowledge:read"],
      permissionMask: "0x100000",
      logoutUrl: "/auth/logout",
    };
    function Harness() {
      const [location, setLocation] = useState(readWorkspaceLocation);
      useEffect(() => {
        const update = () => setLocation(readWorkspaceLocation());
        window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, update);
        return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, update);
      }, []);
      return <AppShell session={session} pathname={location.pathname} locale={createLocaleRuntime()} onNavigate={(path) => writeWorkspaceHistory("push", path)}>
        <MessagesRoute locale={createLocaleRuntime()} search={location.search} />
      </AppShell>;
    }
    await act(async () => root.render(<Harness />));
    await waitFor(() => discussionCalls.includes("/api/discussions?limit=20&cursor=cursor_2"));

    const messagesLink = container.querySelector("nav[data-shell-sidebar-scroll] a[href='/messages']") as HTMLAnchorElement;
    await act(async () => messagesLink.click());
    await waitFor(() => discussionCalls.includes("/api/discussions?limit=20"));

    expect(browser.location.pathname).toBe("/messages");
    expect(browser.location.search).toBe("");
    expect(container.textContent).toContain("Page 1");
  });
});

function thread(overrides: Record<string, unknown> = {}) {
  return { id: "thread-1", contextKind: "task", contextId: "task-1", creatorMemberId: "member-1", lastSequence: 1, createdAt: "2026-08-30T00:00:00.000Z", updatedAt: "2026-08-30T00:01:00.000Z", ...overrides };
}
function message(overrides: Record<string, unknown> = {}) {
  return { id: "message-1", threadId: "thread-1", sequence: 1, authorMemberId: "member-1", body: "Thread A", replyToMessageId: null, mentionMemberIds: [], clientKey: "client-1", createdAt: "2026-08-30T00:01:00.000Z", ...overrides };
}
async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
    if (predicate()) return;
  }
  throw new Error("condition not reached");
}
async function changeReactTextarea(textarea: HTMLTextAreaElement, value: string) {
  const propsKey = Object.keys(textarea).find((key) => key.startsWith("__reactProps$"));
  if (!propsKey) throw new Error("React textarea props unavailable");
  const props = (textarea as unknown as Record<string, { onChange?: (event: { currentTarget: { value: string } }) => void }>)[propsKey]!;
  await act(async () => props.onChange?.({ currentTarget: { value } }));
}
