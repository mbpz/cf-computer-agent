// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, DiscussionThreadRoute, MessagesRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { createDiscussionOperationJournal } from "../../frontend/lib/discussion-intent";
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

  it.each(["lookup", "retry"])("restores a frozen operation after remount without automatic traffic: %s", async action => {
    const sent: Record<string, unknown>[] = []; let queries = 0; let complete = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/discussions/messages" && init?.method === "POST") {
        sent.push(JSON.parse(String(init.body)));
        if (!complete) throw Error("unknown");
        return Response.json({ thread: thread(), message: message({ body: "Restore original", clientKey: String(sent[0].clientKey) }), created: false });
      }
      if (path.startsWith("/api/discussions/messages/requests?")) {
        queries++; expect(new URL(path, "https://app.test").searchParams.get("clientKey")).toBe(sent[0].clientKey);
        return Response.json({ result: { thread: thread(), message: message({ body: "Restore original", clientKey: String(sent[0].clientKey) }), created: false } });
      }
      return Response.json(path === "/api/discussions/thread-1" ? thread() : { items: [message()] });
    });
    const render = () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime({ navigatorLanguage: "en" })} threadId="thread-1" search="" />);
    await act(async () => { render(); });
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    await changeReactTextarea(container.querySelector("textarea")!, "Restore original");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await waitFor(() => container.querySelector("[role=alert]") !== null);
    await act(async () => root.unmount()); root = createRoot(container);
    await act(async () => { render(); });
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    expect(container.querySelector("textarea")!.value).toBe("Restore original");
    expect(container.querySelector("textarea")!.disabled).toBe(true);
    expect(container.textContent).toContain(String(sent[0].clientKey));
    expect(sent).toHaveLength(1); expect(queries).toBe(0);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    complete = true;
    await act(async () => {
      if (action === "lookup") [...container.querySelectorAll("button")].find(b => b.textContent === "Check exact result")!.click();
      else container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }));
    });
    await waitFor(() => container.querySelector("textarea")?.value === "" && !container.querySelector("textarea")?.disabled);
    expect(sent).toHaveLength(action === "lookup" ? 1 : 2);
    if (action === "retry") expect(sent[1]).toEqual(sent[0]);
    expect(browser.sessionStorage.getItem("memory-garden:discussion-operation:v1:member-1:thread-1")).toBeNull();
  });

  it("does not expose or clear A's journal when the member changes during an unknown write", async () => {
    let release!: (response: Response) => void; let payload: { clientKey: string } | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { payload = JSON.parse(String(init.body)); return new Promise<Response>(resolve => { release = resolve; }); }
      return Response.json(String(input) === "/api/discussions/thread-1" ? thread() : { items: [] });
    });
    const render = (memberId: string) => root.render(<DiscussionThreadRoute memberId={memberId} locale={createLocaleRuntime({ navigatorLanguage: "en" })} threadId="thread-1" search="" />);
    await act(async () => render("member-1")); await waitFor(() => container.querySelector("textarea") !== null);
    await changeReactTextarea(container.querySelector("textarea")!, "Private A");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await waitFor(() => !!payload);
    await act(async () => render("member-2")); await waitFor(() => container.querySelector("textarea") !== null);
    expect(container.querySelector("textarea")!.value).toBe(""); expect(container.textContent).not.toContain(payload!.clientKey);
    await act(async () => release(Response.json({ thread: thread(), message: message({ body: "Private A", clientKey: payload!.clientKey }), created: true })));
    await flush();
    expect(browser.sessionStorage.getItem("memory-garden:discussion-operation:v1:member-1:thread-1")).not.toBeNull();
    await act(async () => render("member-1")); await waitFor(() => container.querySelector("textarea") !== null);
    expect(container.querySelector("textarea")!.value).toBe("Private A");
    expect(container.textContent).toContain(payload!.clientKey);
  });

  it("blocks corrupt recovery without discarding it or issuing a write", async () => {
    const key = "memory-garden:discussion-operation:v1:member-1:thread-1";
    browser.sessionStorage.setItem(key, "broken");
    const fetcher = vi.fn(async (input: RequestInfo | URL) => Response.json(String(input) === "/api/discussions/thread-1" ? thread() : { items: [] }));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime({ navigatorLanguage: "en" })} threadId="thread-1" search="" />));
    await waitFor(() => container.textContent!.includes("Saved operation cannot be restored"));
    expect(container.querySelector("textarea")).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(browser.sessionStorage.getItem(key)).toBe("broken");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
  });

  it("does not enable a persistent writer without a verified member identity", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(<DiscussionThreadRoute locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await flush(); expect(container.querySelector("textarea")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["denied", "wrong-context"])("hides recovered private content until its exact authorized target is loaded: %s", async outcome => {
    const saved = { context: { kind: "task" as const, id: "task-1" }, body: "Private recovered draft", clientKey: "restore-key", mentionMemberIds: [] };
    const journal = createDiscussionOperationJournal("member-1", "thread-1");
    expect(journal.save(saved)).toBe(true);
    let restoreAccess = false; let writes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" || String(input).includes("/requests?")) { writes++; throw Error("no automatic recovery traffic"); }
      if (String(input) === "/api/discussions/thread-1") {
        if (!restoreAccess && outcome === "denied") return new Response(null, { status: 403 });
        return Response.json(thread({ contextId: !restoreAccess && outcome === "wrong-context" ? "other-task" : "task-1" }));
      }
      return Response.json({ items: [] });
    });
    const render = () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime({ navigatorLanguage: "en" })} threadId="thread-1" search="" />);
    await act(async () => { render(); }); await waitFor(() => container.querySelector("[data-page-state=error]") !== null);
    expect(container.textContent).not.toContain(saved.body); expect(container.textContent).not.toContain(saved.clientKey);
    expect(container.querySelector("textarea")).toBeNull(); expect(writes).toBe(0);
    restoreAccess = true;
    await act(async () => root.unmount()); root = createRoot(container);
    await act(async () => { render(); }); await waitFor(() => container.querySelector("textarea") !== null);
    expect(container.querySelector("textarea")!.value).toBe(saved.body); expect(container.textContent).toContain(saved.clientKey);
    expect(journal.load()).toEqual({ kind: "ready", input: saved }); expect(writes).toBe(0);
  });

  it("keeps the same in-memory number if storage fails before the first network send", async () => {
    let writes = 0; let savedKey = "";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { writes++; const payload = JSON.parse(String(init.body)); expect(payload.clientKey).toBe(savedKey); throw Error("unknown"); }
      return Response.json(String(input) === "/api/discussions/thread-1" ? thread() : { items: [] });
    });
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime({ navigatorLanguage: "en" })} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("textarea") !== null);
    await changeReactTextarea(container.querySelector("textarea")!, "Keep original");
    const set = vi.spyOn(browser.sessionStorage, "setItem").mockImplementationOnce(() => { throw Error("quota"); });
    const submit = () => container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }));
    await act(async () => { submit(); }); await waitFor(() => container.querySelector("[role=alert]") !== null);
    savedKey = container.querySelector("code")!.textContent!;
    expect(writes).toBe(0); expect(savedKey).not.toBe(""); expect(container.querySelector("textarea")!.disabled).toBe(true);
    await act(async () => { submit(); }); await flush();
    expect(writes).toBe(1); expect(container.querySelector("code")!.textContent).toBe(savedKey);
    set.mockRestore();
  });

  it("restores replies and mentions exactly rather than converting a retry into a new message", async () => {
    const saved = { context: { kind: "task" as const, id: "task-1" }, body: "Original @member-2", replyToMessageId: "message-1", mentionMemberIds: ["member-2"], clientKey: "reply-restore" };
    const journal = createDiscussionOperationJournal("member-1", "thread-1"); expect(journal.save(saved)).toBe(true);
    const sends: unknown[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const payload = JSON.parse(String(init.body)); sends.push(payload);
        return Response.json({ thread: thread(), message: message({ body: saved.body, replyToMessageId: saved.replyToMessageId, mentionMemberIds: saved.mentionMemberIds, clientKey: saved.clientKey }), created: false });
      }
      return Response.json(String(input) === "/api/discussions/thread-1" ? thread() : { items: [] });
    });
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime({ navigatorLanguage: "en" })} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("textarea") !== null); expect(sends).toEqual([]);
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await waitFor(() => container.querySelector("textarea")?.value === "");
    expect(sends).toEqual([saved]); expect(journal.load()).toEqual({ kind: "empty" });
  });

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
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
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
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
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
        return Response.json({ thread: thread({ lastSequence: 2 }), message: message({ id: "message-2", sequence: 2, body: payload.body, clientKey: payload.clientKey, replyToMessageId: payload.replyToMessageId ?? null }), created: false });
      }
      if (failRead) return Response.json({ error: { code: "READ_FAILED", message: "Unavailable", retryable: true } }, { status: 503 });
      return Response.json(String(input).endsWith("thread-1") ? thread() : { items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
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
      await waitFor(() => container.querySelector("[role='alert']") !== null);
    }
    await submit();
    await waitFor(() => recovered.value === "");
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(container.textContent).not.toContain("Replying to member-1");
  });

  it.each([401, 403, 404])("hides private content on a %s read denial without forgetting the uncertain operation", async (status) => {
    let denied = false;
    const keys: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { keys.push(JSON.parse(String(init.body)).clientKey); throw new Error("response lost"); }
      if (denied) return Response.json({ error: { code: "DENIED", message: "Denied", retryable: false } }, { status });
      return Response.json(String(input).endsWith("thread-1") ? thread() : { items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
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
    expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("Secret draft");
    expect(container.textContent).toContain("Replying to member-1");
    expect(keys).toHaveLength(1);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Secret draft");
    await act(async () => { (container.querySelector("[data-message-id] button") as HTMLButtonElement).click(); });
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await waitFor(() => keys.length === 2);
    expect(keys[1]).toBe(keys[0]);
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
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
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
    expect(recovered.value).toBe("Old attempt");
    await changeReactTextarea(recovered, "New private draft");
    const readsBeforeReceipt = reads;
    await act(async () => {
      resolveSend(status === 201
        ? Response.json({ thread: thread({ lastSequence: 2 }), message: message({ sequence: 2, body: sent!.body, clientKey: sent!.clientKey }), created: true }, { status })
        : Response.json({ error: { code: "DENIED", message: "Denied", retryable: false } }, { status }));
      for (let i = 0; i < 30; i += 1) await Promise.resolve();
    });
    expect(container.querySelector("#discussion-composer")).toBe(recovered);
    expect(recovered.value).toBe("Old attempt");
    expect(recovered.disabled).toBe(true);
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
        return Response.json({ thread: thread({ lastSequence: 2 }), message: message({ sequence: 2, body: payload.body, clientKey: payload!.clientKey }), created: true });
      }
      if (failRead) return Response.json({ error: { code: "UNAVAILABLE", message: "Unavailable", retryable: true } }, { status: 503 });
      return Response.json(String(input).endsWith("thread-1") ? thread() : { items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
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
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
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

  it("confirms dirty navigation and blocks writes while discard confirmation is open", async () => {
    let writes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { writes++; throw new Error("unexpected write"); }
      return Response.json(String(input).endsWith("thread-1") ? thread() : { items: [message()] });
    });
    browser.history.replaceState({}, "", "/messages/thread-1");
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    const textarea = container.querySelector("#discussion-composer") as HTMLTextAreaElement;
    await changeReactTextarea(textarea, "Keep draft");
    await act(async () => { writeWorkspaceHistory("push", "/home"); });
    expect(browser.location.pathname).toBe("/messages/thread-1");
    expect(container.querySelector("[role='alertdialog']")).not.toBeNull();
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    expect(writes).toBe(0);
    await act(async () => { Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Keep editing")!.click(); });
    expect(textarea.value).toBe("Keep draft");
    await act(async () => { writeWorkspaceHistory("push", "/home"); });
    await act(async () => { Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Discard changes")!.click(); });
    expect(browser.location.pathname).toBe("/home");
    expect(textarea.value).toBe("");
  });

  it("blocks edits, reply changes, leaving and unload until a same-key retry is acknowledged", async () => {
    const sent: Array<{ body: string; clientKey: string; replyToMessageId?: string }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        const payload = JSON.parse(String(init.body)); sent.push(payload);
        if (sent.length === 1) throw new Error("response lost");
        return Response.json({ thread: thread(), message: message({ body: payload.body, clientKey: payload.clientKey, replyToMessageId: payload.replyToMessageId ?? null }), created: false });
      }
      return Response.json(String(input).endsWith("thread-1") ? thread() : { items: [message()] });
    });
    browser.history.replaceState({}, "", "/messages/thread-1");
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    const textarea = container.querySelector("#discussion-composer") as HTMLTextAreaElement;
    await changeReactTextarea(textarea, "Original");
    const submit = () => act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => {
      for (let i = 0; i < 2; i++) container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }));
      writeWorkspaceHistory("push", "/home");
    });
    await waitFor(() => container.querySelector("[role='alert']") !== null);
    expect(sent).toHaveLength(1);
    expect(textarea.disabled).toBe(true);
    await changeReactTextarea(textarea, "Changed");
    // A stale handler must also fail closed, not just the button's disabled DOM.
    const reply = container.querySelector("[data-message-id] button")!;
    const propsKey = Object.keys(reply).find((key) => key.startsWith("__reactProps$"))!;
    await act(async () => { (reply as unknown as Record<string, { onClick: () => void }>)[propsKey]!.onClick(); });
    await act(async () => { (container.querySelector("[data-message-id] button") as HTMLButtonElement).click(); writeWorkspaceHistory("push", "/home"); });
    expect(browser.location.pathname).toBe("/messages/thread-1");
    expect(container.querySelector("[role='alertdialog']")).toBeNull();
    const unload = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await submit();
    await waitFor(() => textarea.value === "");
    expect(sent).toHaveLength(2);
    expect(sent[1]).toEqual(sent[0]);
    expect(sent[1]).toMatchObject({ body: "Original" });
    expect(sent[1]!.replyToMessageId).toBeUndefined();
    const after = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    await act(async () => { writeWorkspaceHistory("push", "/home"); });
    expect(browser.location.pathname).toBe("/home");
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

  it("locks an uncertain client key to the frozen intent and rejects semantic edits", async () => {
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
    for (const edited of [
      { ...original, body: "Edited" },
      { ...original, replyToMessageId: "message-1" },
      { ...original, mentionMemberIds: ["member-3"] },
      { ...original, context: { kind: "knowledge" as const, id: "knowledge-1" } },
    ]) await expect(controller.submit(edited, sender)).rejects.toThrow("DISCUSSION_WRITE_UNRESOLVED");
    await expect(controller.submit(original, sender)).rejects.toThrow("response lost");
    expect(sent.map(({ clientKey }) => clientKey)).toEqual(["key-1", "key-1", "key-1"]);
    expect(sent.map(({ body }) => body)).toEqual(["Original", "Original", "Original"]);
  });

  it("isolates the frozen intent from caller and transport mutation", async () => {
    const controller = createDiscussionSubmitController(() => "key-1");
    const original = { context: { kind: "task" as const, id: "task-1" }, body: "Original", mentionMemberIds: ["member-2"] };
    await expect(controller.submit(original, async (input) => {
      input.context.id = "mutated-transport";
      input.mentionMemberIds!.push("member-3");
      throw new Error("response lost");
    })).rejects.toThrow("response lost");
    original.context.id = "mutated-caller";
    original.mentionMemberIds.push("member-4");
    expect(controller.hasUnresolved()).toBe(true);
    let received: unknown;
    await expect(controller.submit({ context: { kind: "task", id: "task-1" }, body: "Original", mentionMemberIds: ["member-2"] }, async (input) => { received = input; })).resolves.toBe(true);
    expect(received).toEqual({ context: { kind: "task", id: "task-1" }, body: "Original", mentionMemberIds: ["member-2"], clientKey: "key-1" });
    expect(controller.hasUnresolved()).toBe(false);
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

  it.each(["list", "thread"])("recovers the same %s cursor after a read failure and restores URL state on history events", async (kind) => {
    const path = kind === "list" ? "/messages" : "/messages/thread-1";
    browser.history.replaceState({}, "", `${path}?unknown=kept`);
    let failPageTwo = true;
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const request = String(input); calls.push(request);
      if (request === "/api/discussions/thread-1") return Response.json(thread());
      const pageTwo = request.includes("cursor=cursor_2");
      if (pageTwo && failPageTwo) return Response.json({ error: { code: "UNAVAILABLE", message: "Unavailable", retryable: true } }, { status: 503 });
      return Response.json({ items: [kind === "list"
        ? thread({ contextId: pageTwo ? "task-older" : "task-newer" })
        : message({ body: pageTwo ? "Older page" : "Newer page" })], ...(!pageTwo ? { nextCursor: "cursor_2" } : {}) });
    });
    await act(async () => root.render(kind === "list"
      ? <MessagesRoute locale={createLocaleRuntime()} search={browser.location.search} />
      : <DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search={browser.location.search} />));
    await waitFor(() => container.querySelector("button[aria-label='Next page']") !== null);
    await act(async () => { (container.querySelector("button[aria-label='Next page']") as HTMLButtonElement).click(); });
    await waitFor(() => container.querySelector("[data-page-state='error']") !== null);
    expect(browser.location.search).toBe("?unknown=kept&page=2&cursor=cursor_2");
    const beforeRetry = calls.length;
    failPageTwo = false;
    await act(async () => { container.querySelector("button")!.click(); });
    await waitFor(() => container.textContent?.includes("Page 2") ?? false);
    expect(calls.slice(beforeRetry).some((url) => url.endsWith("limit=20&cursor=cursor_2"))).toBe(true);
    expect((container.querySelector("button[aria-label='Next page']") as HTMLButtonElement).disabled).toBe(true);
    // Model admitted location changes; native traversal policy has its own suite.
    for (const [search, expected] of [["?unknown=kept", "Page 1"], ["?unknown=kept&page=2&cursor=cursor_2", "Page 2"]]) {
      await act(async () => { writeWorkspaceHistory("replace", `${path}${search}`); });
      await waitFor(() => (container.textContent?.includes(expected) ?? false) && container.querySelector("[aria-busy='true']") === null);
    }
    const select = container.querySelector("select") as HTMLSelectElement;
    await act(async () => { select.value = "50"; select.dispatchEvent(new browser.Event("change", { bubbles: true })); });
    await waitFor(() => browser.location.search === "?unknown=kept&limit=50" && container.querySelector("[aria-busy='true']") === null);
    expect(container.textContent).toContain("Page 1");
    expect(calls.at(-1)).toMatch(/limit=50$/u);
    expect((container.querySelector("button[aria-label='Previous page']") as HTMLButtonElement).disabled).toBe(true);
  });

  it.each(["list", "thread"])("ignores a late %s cursor page after history restores page one", async (kind) => {
    const path = kind === "list" ? "/messages" : "/messages/thread-1";
    browser.history.replaceState({}, "", path);
    let resolvePage!: (response: Response) => void;
    const latePage = new Promise<Response>((resolve) => { resolvePage = resolve; });
    let pageSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = String(input);
      if (request === "/api/discussions/thread-1") return Response.json(thread());
      if (request.includes("cursor=")) { pageSignal = init?.signal ?? undefined; return latePage; }
      return Response.json({ items: [kind === "list" ? thread({ contextId: "task-current" }) : message({ body: "Current page" })], nextCursor: "cursor_2" });
    });
    await act(async () => root.render(kind === "list"
      ? <MessagesRoute locale={createLocaleRuntime()} search="" />
      : <DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("button[aria-label='Next page']") !== null);
    await act(async () => { (container.querySelector("button[aria-label='Next page']") as HTMLButtonElement).click(); });
    await waitFor(() => pageSignal !== undefined);
    expect((container.querySelector("button[aria-label='Next page']") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { writeWorkspaceHistory("replace", path); });
    await waitFor(() => container.querySelector("[aria-busy='true']") === null);
    expect(pageSignal?.aborted).toBe(true);
    await act(async () => {
      resolvePage(Response.json({ items: [kind === "list" ? thread({ contextId: "task-late" }) : message({ body: "Late page" })] }));
      for (let i = 0; i < 30; i += 1) await Promise.resolve();
    });
    expect(container.textContent).toContain("Page 1");
    expect(container.textContent).not.toContain(kind === "list" ? "task-late" : "Late page");
    expect(container.textContent).toContain(kind === "list" ? "task-current" : "Current page");
  });

  it("replaces an older cursor with the first page after send without losing page size or unrelated query parameters", async () => {
    browser.history.replaceState({}, "", "/messages/thread-1?unknown=kept&page=2&limit=50&cursor=cursor_2");
    const reads: string[] = [];
    let writes = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        writes += 1;
        const payload = JSON.parse(String(init.body));
        return Response.json({ thread: thread({ lastSequence: 2 }), message: message({ sequence: 2, body: payload.body, clientKey: payload!.clientKey }), created: true });
      }
      reads.push(String(input));
      return Response.json(String(input).endsWith("thread-1") ? thread() : { items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search={browser.location.search} />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    const historyLength = browser.history.length;
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "New reply");
    await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    await waitFor(() => browser.location.search === "?unknown=kept&limit=50" && container.querySelector("[aria-busy='true']") === null);
    expect(reads).toContain("/api/discussions/thread-1/messages?limit=50");
    expect(container.textContent).toContain("Page 1");
    expect(browser.history.length).toBe(historyLength);
    expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("");
    expect(writes).toBe(1);
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
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => calls.length === 2);
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-2" search="" />));
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
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("[data-message-id='message-1']") !== null);
    const textarea = container.querySelector("#discussion-composer") as HTMLTextAreaElement;
    await changeReactTextarea(textarea, "Draft for A");
    await act(async () => (container.querySelector("[data-message-id='message-1'] button") as HTMLButtonElement).click());
    await act(async () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => calls.includes("POST /api/discussions/messages"));

    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-2" search="" />));

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

  it("blocks changing reply semantics while sending and clears only the acknowledged draft", async () => {
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
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
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

    expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("");
    expect(container.textContent).not.toContain("Replying to member-1");
    expect(container.querySelector("[role='alert']")).toBeNull();
  });

  it("blocks canceling a frozen reply until its exact acknowledgment", async () => {
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
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("[data-message-id='message-1']") !== null);
    const textarea = container.querySelector("#discussion-composer") as HTMLTextAreaElement;
    await changeReactTextarea(textarea, "Keep restored draft");
    await act(async () => (container.querySelector("[data-message-id='message-1'] button") as HTMLButtonElement).click());
    await act(async () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
    await act(async () => (container.querySelector("[data-message-id='message-1'] button") as HTMLButtonElement).click());
    await act(async () => (container.querySelector("form button[type='button']") as HTMLButtonElement).click());

    expect(container.textContent).toContain("Replying to member-1");
    resolveSend(Response.json({
      thread: thread({ lastSequence: 2 }),
      message: message({ id: "message-2", sequence: 2, body: "Keep restored draft", clientKey: sentKey, replyToMessageId: "message-1" }),
      created: true,
    }, { status: 201 }));
    await waitFor(() => textarea.disabled === false);

    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(textarea.value).toBe("");
    expect(container.textContent).not.toContain("Replying to member-1");
  });


  it("does not let a late exact read from a revoked access epoch erase the unresolved operation", async () => {
    let key = ""; let denied = false; let lookups = 0; let writes = 0;
    let resolveLookup!: (response: Response) => void;
    const late = new Promise<Response>(resolve => { resolveLookup = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.startsWith("/api/discussions/messages/requests?")) { lookups++; return late; }
      if (path === "/api/discussions/messages" && init?.method === "POST") {
        writes++; const received = JSON.parse(String(init.body)).clientKey;
        if (key) expect(received).toBe(key); else key = received;
        throw new Error("unknown");
      }
      if (path === "/api/discussions/thread-1") return denied ? new Response(null, { status: 403 }) : Response.json(thread());
      return Response.json({ items: [message()] });
    });
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime({ navigatorLanguage: "en" })} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Original");
    const submit = () => container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }));
    const click = (text: string) => [...container.querySelectorAll("button")].find(b => b.textContent === text)!.click();
    await act(async () => { submit(); });
    await waitFor(() => container.querySelector("[role=alert]") !== null);
    await act(async () => { click("Check exact result"); });
    await waitFor(() => lookups === 1);
    denied = true;
    await act(async () => { click("Refresh"); });
    await waitFor(() => container.querySelector("#discussion-composer") === null);
    denied = false;
    await act(async () => { click("Try discussions again"); });
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    await act(async () => resolveLookup(Response.json({ result: { thread: thread(), message: message({ body: "Original", clientKey: key }), created: false } })));
    await flush();
    expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("Original");
    expect(container.textContent).toContain(key);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    await act(async () => { submit(); }); await flush();
    expect(writes).toBe(2); expect(lookups).toBe(1);
  });

  it.each(["found", "absent", "mismatch", "offline", "denied"])("checks an unknown operation by exact read only: %s", async (outcome) => {
    let key = ""; let writes = 0; let reads = 0; let resolveLookup!: (response: Response) => void;
    const lookup = new Promise<Response>(resolve => { resolveLookup = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/discussions/thread-1") return Response.json(thread());
      if (path === "/api/discussions/thread-1/messages?limit=20") return Response.json({ items: [message()] });
      if (path === "/api/discussions/messages" && init?.method === "POST") {
        writes++; const payload = JSON.parse(String(init.body));
        if (key) expect(payload.clientKey).toBe(key); else key = payload.clientKey;
        throw new Error("response lost");
      }
      if (path.startsWith("/api/discussions/messages/requests?")) {
        reads++; expect(init?.method).toBe("GET");
        const url = new URL(path, "https://app.test");
        expect(url.searchParams.get("clientKey")).toBe(key);
        expect(url.searchParams.get("kind")).toBe("task"); expect(url.searchParams.get("id")).toBe("task-1");
        if (outcome === "offline") throw new Error("offline");
        return lookup;
      }
      throw new Error(`unexpected request: ${path}`);
    });
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime({ navigatorLanguage: "en" })} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    await changeReactTextarea(container.querySelector("#discussion-composer") as HTMLTextAreaElement, "Original");
    const submit = () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true }));
    await act(async () => { submit(); });
    await waitFor(() => container.querySelector("[role=alert]") !== null);
    expect(container.textContent).toContain(key);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    const check = [...container.querySelectorAll("button")].find(b => b.textContent === "Check exact result")!;
    expect(check).toBeTruthy();
    await act(async () => { check.click(); check.click(); });
    if (outcome !== "offline") {
      expect(check.disabled).toBe(true);
      await act(async () => { submit(); });
      await act(async () => resolveLookup(outcome === "denied" ? new Response(null, { status: 403 }) : Response.json({ result: outcome === "absent" ? null : {
        thread: thread(), message: message({ body: outcome === "mismatch" ? "Wrong" : "Original", clientKey: key }), created: false,
      } })));
    }
    await flush(); expect(writes).toBe(1); expect(reads).toBe(1);
    if (outcome === "found") {
      expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("");
      expect(container.textContent).not.toContain(key);
      await act(async () => { expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed"); });
    } else {
      if (outcome === "denied") {
        expect(container.textContent).not.toContain("Original"); expect(container.textContent).not.toContain(key);
        await act(async () => ([...container.querySelectorAll("button")].find(b => b.textContent === "Try discussions again")!).click());
        await waitFor(() => container.querySelector("#discussion-composer") !== null);
      }
      expect((container.querySelector("#discussion-composer") as HTMLTextAreaElement).value).toBe("Original");
      expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
      await act(async () => { submit(); }); await flush(); expect(writes).toBe(2); expect(reads).toBe(1);
    }
    await flush();
  });

  it("ignores edit attempts after an unknown send and retries the frozen client key", async () => {
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
    await act(async () => root.render(<DiscussionThreadRoute memberId="member-1" locale={createLocaleRuntime()} threadId="thread-1" search="" />));
    await waitFor(() => container.querySelector("#discussion-composer") !== null);
    const textarea = container.querySelector("#discussion-composer") as HTMLTextAreaElement;

    await changeReactTextarea(textarea, "Original");
    await act(async () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => sent.length === 1 && container.querySelector("[role='alert']") !== null);
    await changeReactTextarea(textarea, "Edited");
    await changeReactTextarea(textarea, "Original");
    await act(async () => (container.querySelector("form") as HTMLFormElement).dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })));
    await waitFor(() => sent.length === 2 && textarea.value === "");

    expect(sent.map(({ body }) => body)).toEqual(["Original", "Original"]);
    expect(sent[1]!.clientKey).toBe(sent[0]!.clientKey);
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
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); for (let i = 0; i < 12; i++) await Promise.resolve(); }); }
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


describe("discussion exact operation reconciliation", () => {
  it("serializes exact reads with retries and clones the unresolved input", async () => {
    const controller = createDiscussionSubmitController(() => "op-1");
    const input = { context: { kind: "task" as const, id: "task-1" }, body: "Original" };
    await expect(controller.submit(input, async () => { throw new Error("unknown"); })).rejects.toThrow();
    let release!: (found: boolean) => void;
    const active = controller.reconcile(async () => new Promise<boolean>(resolve => { release = resolve; }));
    const second = vi.fn();
    await expect(controller.reconcile(second)).resolves.toBe(false);
    await expect(controller.submit(input, second)).resolves.toBe(false);
    expect(second).not.toHaveBeenCalled();
    release(false); await expect(active).resolves.toBe(false);
    expect(controller.hasUnresolved()).toBe(true); expect(controller.operationKey()).toBe("op-1");
  });

  it("keeps the frozen number across absence and query failure, and allocates again only after exact success", async () => {
    let issued = 0;
    const controller = createDiscussionSubmitController(() => `op-${++issued}`);
    const input = { context: { kind: "task" as const, id: "task-1" }, body: "Original" };
    await expect(controller.submit(input, async () => { throw new Error("unknown"); })).rejects.toThrow("unknown");
    expect(controller.operationKey()).toBe("op-1");
    await expect(controller.reconcile(async frozen => { expect(frozen.clientKey).toBe("op-1"); frozen.body = "mutated"; return false; })).resolves.toBe(false);
    await expect(controller.reconcile(async () => { throw new Error("offline"); })).rejects.toThrow("offline");
    expect(controller.hasUnresolved()).toBe(true);
    await expect(controller.reconcile(async frozen => { expect(frozen.body).toBe("Original"); expect(frozen.clientKey).toBe("op-1"); return true; })).resolves.toBe(true);
    expect(controller.hasUnresolved()).toBe(false);
    await controller.submit(input, async frozen => { expect(frozen.clientKey).toBe("op-2"); });
  });
});
