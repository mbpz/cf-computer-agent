// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, DiscussionThreadRoute, MessagesRoute } from "../../frontend/app";
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

  it("does not navigate when a context receipt belongs to another target", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ thread: thread({ contextId: "task-other" }), created: true }));
    browser.history.replaceState({}, "", "/messages?contextKind=task&contextId=task-1");
    await act(async () => root.render(<MessagesRoute locale={createLocaleRuntime()} search={browser.location.search} />));
    await waitFor(() => container.querySelector("[data-page-state='error']") !== null);
    expect(browser.location.pathname).toBe("/messages");
    expect(container.textContent).not.toContain("task-other");
  });

  it.each(["detail", "messages"])("does not render a mismatched %s response and retries the original thread", async (mismatch) => {
    let valid = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input) === "/api/discussions/thread-1") return Response.json(thread(!valid && mismatch === "detail" ? { id: "wrong-thread" } : {}));
      return Response.json({ items: [message(!valid && mismatch === "messages" ? { threadId: "wrong-thread" } : {})] });
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("[data-page-state='error']") !== null);
    expect(container.querySelector("#discussion-composer")).toBeNull();
    expect(container.textContent).not.toContain("Thread A");
    valid = true;
    await act(async () => { container.querySelector("button")!.click(); });
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    expect(container.textContent).toContain("Thread A");
  });

  it("keeps the draft and same retry key after a mismatched receipt, then clears only on a correlated receipt", async () => {
    const sent: Array<{ body: string; clientKey: string }> = [];
    let reads = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") {
        const payload = JSON.parse(String(init.body)); sent.push(payload);
        return Response.json({ thread: thread({ lastSequence: 2 }), message: message({ id: "message-2", sequence: 2, body: payload.body,
          clientKey: sent.length === 1 ? "unrelated-key" : payload.clientKey }), created: sent.length === 1 });
      }
      reads += 1;
      if (path === "/api/discussions/thread-1") return Response.json(thread());
      return Response.json({ items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    const textarea = container.querySelector("#discussion-composer") as HTMLTextAreaElement;
    await changeReactTextarea(textarea, "Keep my draft");
    const submit = async () => act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await submit();
    await waitFor(() => container.querySelector("[role='alert']") !== null);
    expect(textarea.value).toBe("Keep my draft");
    expect(reads).toBe(2);
    expect(sent).toHaveLength(1);
    await submit();
    await waitFor(() => textarea.value === "");
    expect(sent).toHaveLength(2);
    expect(sent[0]!.clientKey).toBe(sent[1]!.clientKey);
    expect(reads).toBe(4);
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it.each(["before", "after"])("preserves an uncertain attempt across a read failure occurring %s the send settles", async (settles) => {
    let rejectSend!: (reason: Error) => void;
    const uncertain = new Promise<Response>((_resolve, reject) => { rejectSend = reject; });
    const sent: Array<{ body: string; clientKey: string; replyToMessageId?: string }> = [];
    let failRead = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const payload = JSON.parse(String(init.body)); sent.push(payload);
        if (sent.length === 1) return uncertain;
        return Response.json({ thread: thread({ lastSequence: 2 }), message: message({ id: "message-2", sequence: 2, body: payload.body, clientKey: payload.clientKey, replyToMessageId: payload.replyToMessageId }), created: false });
      }
      if (failRead) return Response.json({ error: { code: "READ_FAILED", message: "Unavailable", retryable: true } }, { status: 503 });
      return Response.json(String(input).endsWith("thread-1") ? thread() : { items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Retry this reply");
    await act(async () => { (container.querySelector("[data-message-id] button") as HTMLButtonElement).click(); });
    const submit = async () => act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await submit();
    if (settles === "after") {
      rejectSend(new Error("response lost"));
      await waitFor(() => container.querySelector("[role='alert']") !== null);
    }
    failRead = true;
    await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Refresh")!.click(); });
    await waitFor(() => container.querySelector("[data-page-state='error']") !== null);
    expect(container.querySelector("#discussion-composer")).toBeNull();
    expect(container.textContent).not.toContain("Retry this reply");
    failRead = false;
    await act(async () => { container.querySelector("button")!.click(); });
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    const recovered = container.querySelector("#discussion-composer") as HTMLTextAreaElement;
    expect(recovered.value).toBe("Retry this reply");
    expect(container.textContent).toContain("Replying to member-1");
    expect(sent).toHaveLength(1); // GET recovery never replays the write.
    if (settles === "before") {
      expect(recovered.disabled).toBe(true);
      await submit();
      expect(sent).toHaveLength(1);
      expect(recovered.disabled).toBe(true);
      rejectSend(new Error("response lost"));
      await waitFor(() => recovered.disabled === false);
    }
    await submit();
    await waitFor(() => recovered.value === "");
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(container.textContent).not.toContain("Replying to member-1");
  });

  it.each([401, 403, 404])("discards draft, reply and retry identity on a %s read denial", async (status) => {
    let denied = false;
    const keys: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { keys.push(JSON.parse(String(init.body)).clientKey); throw new Error("response lost"); }
      if (denied) return Response.json({ error: { code: "DENIED", message: "Denied", retryable: false } }, { status });
      return Response.json(String(input).endsWith("thread-1") ? thread() : { items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Secret draft");
    await act(async () => { (container.querySelector("[data-message-id] button") as HTMLButtonElement).click(); });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await waitFor(() => container.querySelector("[role='alert']") !== null);
    denied = true;
    await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Refresh")!.click(); });
    await waitFor(() => container.querySelector("[data-page-state='error']") !== null);
    expect(container.textContent).not.toContain("Secret draft");
    denied = false;
    await act(async () => { container.querySelector("button")!.click(); });
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("");
    expect(container.textContent).not.toContain("Replying to member-1");
    expect(keys).toHaveLength(1);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Secret draft");
    await act(async () => { (container.querySelector("[data-message-id] button") as HTMLButtonElement).click(); });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await waitFor(() => keys.length === 2);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it.each([201, 401, 403, 404])("ignores a late %s send receipt after read revocation and explicit recovery", async (status) => {
    let resolveSend!: (response: Response) => void;
    const pendingSend = new Promise<Response>((resolve) => { resolveSend = resolve; });
    let sent: { body: string; clientKey: string } | undefined;
    let denied = false;
    let reads = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { sent = JSON.parse(String(init.body)); return pendingSend; }
      reads += 1;
      if (denied) return Response.json({ error: { code: "DENIED", message: "Denied", retryable: false } }, { status: 403 });
      return Response.json(String(input).endsWith("thread-1") ? thread() : { items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Old attempt");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    denied = true;
    await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Refresh")!.click(); });
    await waitFor(() => container.querySelector("[data-page-state='error']") !== null);
    denied = false;
    await act(async () => { container.querySelector("button")!.click(); });
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    const recovered = container.querySelector("#discussion-composer") as HTMLTextAreaElement;
    expect(recovered.value).toBe("");
    await changeReactTextarea(recovered, "New private draft");
    const readsBeforeReceipt = reads;
    await act(async () => {
      resolveSend(status === 201
        ? Response.json({ thread: thread({ lastSequence: 2 }), message: message({ sequence: 2, body: sent!.body, clientKey: sent!.clientKey }), created: true }, { status })
        : Response.json({ error: { code: "DENIED", message: "Denied", retryable: false } }, { status }));
      for (let i = 0; i < 30; i += 1) await Promise.resolve();
    });
    expect(container.querySelector("#discussion-composer")).toBe(recovered);
    expect(recovered.value).toBe("New private draft");
    expect(recovered.disabled).toBe(false);
    expect(container.querySelector("[data-page-state='error']")).toBeNull();
    expect(reads).toBe(readsBeforeReceipt);
  });

  it("clears an acknowledged draft even when the subsequent readback fails", async () => {
    let acknowledged = false;
    let failRead = false;
    let writes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes += 1; acknowledged = true; failRead = true;
        const payload = JSON.parse(String(init.body));
        return Response.json({ thread: thread({ lastSequence: 2 }), message: message({ sequence: 2, body: payload.body, clientKey: payload.clientKey }), created: true });
      }
      if (failRead) return Response.json({ error: { code: "UNAVAILABLE", message: "Unavailable", retryable: true } }, { status: 503 });
      return Response.json(String(input).endsWith("thread-1") ? thread() : { items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Acknowledged");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await waitFor(() => acknowledged && container.querySelector("[data-page-state='error']") !== null);
    failRead = false;
    await act(async () => { container.querySelector("button")!.click(); });
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("");
    expect(writes).toBe(1);
  });

  it.each([401, 403, 404])("clears restricted thread content after a %s send response and cancels stale readback", async (status) => {
    let resolveRead!: (response: Response) => void;
    let readSignal: AbortSignal | undefined;
    let detailReads = 0;
    let writes = 0;
    const delayedRead = new Promise<Response>((resolve) => { resolveRead = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { writes += 1; return Response.json({ error: { code: "DISCUSSION_NOT_FOUND", message: "Denied", retryable: false } }, { status }); }
      if (String(input) === "/api/discussions/thread-1") {
        detailReads += 1;
        if (detailReads === 2) { readSignal = init?.signal ?? undefined; return delayedRead; }
        return Response.json(thread());
      }
      return Response.json({ items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Private draft");
    await act(async () => { Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Refresh")!.click(); });
    await waitFor(() => detailReads === 2);
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await waitFor(() => container.querySelector("#discussion-composer") === null);
    expect(container.textContent).not.toContain("Thread A");
    expect(container.textContent).not.toContain("Private draft");
    expect(readSignal?.aborted).toBe(true);
    resolveRead(Response.json(thread()));
    await act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });
    expect(container.querySelector("#discussion-composer")).toBeNull();
    expect(writes).toBe(1);
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

  it("permanently invalidates a failed attempt after body, reply, or mention semantics leave and return", async () => {
    const keys = ["key-1", "key-2", "key-3", "key-4"];
    const sent: string[] = [];
    const controller = createDiscussionSubmitController(() => keys.shift()!);
    const sender = async (input: { clientKey: string }) => {
      sent.push(input.clientKey);
      throw new Error("response lost");
    };
    const original = { context: { kind: "task" as const, id: "task-1" }, body: "Original", mentionMemberIds: ["member-2"] };

    await expect(controller.submit(original, sender)).rejects.toThrow("response lost");
    controller.observe({ ...original, body: "Edited" });
    controller.observe(original);
    await expect(controller.submit(original, sender)).rejects.toThrow("response lost");

    controller.observe({ ...original, replyToMessageId: "message-1" });
    controller.observe(original);
    await expect(controller.submit(original, sender)).rejects.toThrow("response lost");

    controller.observe({ ...original, mentionMemberIds: ["member-3"] });
    controller.observe(original);
    await expect(controller.submit(original, sender)).rejects.toThrow("response lost");

    expect(sent).toEqual(["key-1", "key-2", "key-3", "key-4"]);
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

  it.each([201, 401, 403, 404])("isolates ready content, composer state, and a late %s send response across an A to B thread switch", async (sendStatus) => {
    let resolveThreadB!: (response: Response) => void;
    let resolveMessagesB!: (response: Response) => void;
    let resolveSendA!: (response: Response) => void;
    let sentKey = "";
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
      if (path === "/api/discussions/messages" && init?.method === "POST") { sentKey = JSON.parse(String(init.body)).clientKey; return delayedSendA; }
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

    resolveSendA(sendStatus === 201 ? Response.json({
      thread: thread({ lastSequence: 2 }),
      message: message({ id: "message-a-2", sequence: 2, body: "Draft for A", replyToMessageId: "message-1", clientKey: sentKey }),
      created: true,
    }, { status: 201 }) : Response.json({ error: { code: "DISCUSSION_NOT_FOUND", message: "Denied", retryable: false } }, { status: sendStatus }));
    await act(async () => { for (let index = 0; index < 10; index += 1) await Promise.resolve(); });

    expect(calls.filter((call) => call.includes("thread-2"))).toEqual([
      "GET /api/discussions/thread-2",
      "GET /api/discussions/thread-2/messages?limit=20",
    ]);
    expect(container.querySelector("[data-message-id='message-2']")).not.toBeNull();
  });

  it("does not clear a draft whose reply semantics changed while an earlier send was pending", async () => {
    let resolveSend!: (response: Response) => void;
    let sentKey = "";
    const delayedSend = new Promise<Response>((resolve) => { resolveSend = resolve; });
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/discussions/thread-1") return Promise.resolve(Response.json(thread()));
      if (path === "/api/discussions/thread-1/messages?limit=20") return Promise.resolve(Response.json({ items: [message()] }));
      if (path === "/api/discussions/messages" && init?.method === "POST") { sentKey = JSON.parse(String(init.body)).clientKey; return delayedSend; }
      return Promise.reject(new Error(`unexpected request: ${path}`));
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("[data-message-id='message-1']") !== null);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Keep this draft");
    await act(async () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => (container.querySelector("[data-message-id='message-1'] button") as HTMLButtonElement).click());

    resolveSend(Response.json({
      thread: thread({ lastSequence: 2 }),
      message: message({ id: "message-2", sequence: 2, body: "Keep this draft", clientKey: sentKey }),
      created: true,
    }, { status: 201 }));
    await waitFor(() => (container.querySelector("#discussion-composer") as HTMLTextAreaElement).disabled === false);

    expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("Keep this draft");
    expect(container.textContent).toContain("Replying to member-1");
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("does not clear a restored draft after reply semantics leave and return while send is pending", async () => {
    let resolveSend!: (response: Response) => void;
    let sentKey = "";
    const delayedSend = new Promise<Response>((resolve) => { resolveSend = resolve; });
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/discussions/thread-1") return Promise.resolve(Response.json(thread()));
      if (path === "/api/discussions/thread-1/messages?limit=20") return Promise.resolve(Response.json({ items: [message()] }));
      if (path === "/api/discussions/messages" && init?.method === "POST") { sentKey = JSON.parse(String(init.body)).clientKey; return delayedSend; }
      return Promise.reject(new Error(`unexpected request: ${path}`));
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("[data-message-id='message-1']") !== null);
    const textarea = container.querySelector("#discussion-composer") as HTMLTextAreaElement;
    await changeReactTextarea(textarea, "Keep restored draft");
    await act(async () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => (container.querySelector("[data-message-id='message-1'] button") as HTMLButtonElement).click());
    await act(async () => (container.querySelector("form button[type='button']") as HTMLButtonElement).click());

    resolveSend(Response.json({
      thread: thread({ lastSequence: 2 }),
      message: message({ id: "message-2", sequence: 2, body: "Keep restored draft", clientKey: sentKey }),
      created: true,
    }, { status: 201 }));
    await waitFor(() => textarea.disabled === false);

    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(textarea.value).toBe("Keep restored draft");
    expect(container.textContent).not.toContain("Replying to member-1");
  });

  it("uses a new client key after a failed send is edited and then restored in the real composer", async () => {
    const sent: Array<{ body: string; clientKey: string }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/discussions/thread-1") return Response.json(thread());
      if (path === "/api/discussions/thread-1/messages?limit=20") return Response.json({ items: [message()] });
      if (path === "/api/discussions/messages" && init?.method === "POST") {
        sent.push(JSON.parse(String(init.body)) as { body: string; clientKey: string });
        if (sent.length === 1) throw new Error("response lost");
        return Response.json({
          thread: thread({ lastSequence: 2 }),
          message: message({ id: "message-2", sequence: 2, body: "Original", clientKey: sent[1]!.clientKey }),
          created: true,
        }, { status: 201 });
      }
      throw new Error(`unexpected request: ${path}`);
    });
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    const textarea = container.querySelector("#discussion-composer") as HTMLTextAreaElement;

    await changeReactTextarea(textarea, "Original");
    await act(async () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => sent.length === 1 && textarea.disabled === false);
    await changeReactTextarea(textarea, "Edited");
    await changeReactTextarea(textarea, "Original");
    await act(async () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => sent.length === 2 && textarea.value === "");

    expect(sent.map(({ body }) => body)).toEqual(["Original", "Original"]);
    expect(sent[1]!.clientKey).not.toBe(sent[0]!.clientKey);
  });

  it("synchronizes internal cursor state when the global Messages link re-enters canonically without accepting the stale response", async () => {
    const discussionCalls: string[] = [];
    let resolveStale!: (response: Response) => void;
    const stale = new Promise<Response>((resolve) => { resolveStale = resolve; });
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/session") return Promise.resolve(Response.json(session));
      if (path === "/api/telemetry/pageview") return Promise.resolve(new Response(null, { status: 204 }));
      if (path === "/api/navigation") return Promise.reject(new Error("navigation unavailable"));
      if (path.startsWith("/api/discussions?")) {
        discussionCalls.push(path);
        return path.includes("cursor=cursor_2")
          ? stale
          : Promise.resolve(Response.json({ items: [thread({ id: "thread-default", contextId: "task-default" })] }));
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
    await act(async () => root.render(<App />));
    await waitFor(() => discussionCalls.includes("/api/discussions?limit=20&cursor=cursor_2"));

    const messagesLink = container.querySelector("nav[data-shell-collaboration-navigation] a[href='/messages']") as HTMLAnchorElement;
    expect(messagesLink).not.toBeNull();
    await act(async () => messagesLink.click());
    await waitFor(() => discussionCalls.includes("/api/discussions?limit=20"));

    expect(browser.location.pathname).toBe("/messages");
    expect(browser.location.search).toBe("");
    expect(container.textContent).toContain("Page 1");
    expect(container.textContent).toContain("task-default");

    await act(async () => resolveStale(Response.json({ items: [thread({ id: "thread-stale", contextId: "task-stale" })] })));
    await waitFor(() => container.textContent?.includes("task-default") ?? false);
    expect(container.textContent).not.toContain("task-stale");
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
