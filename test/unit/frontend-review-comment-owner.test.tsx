// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewDetailRoute } from "../../frontend/pages/admin/review-detail-route";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import type { Fetcher } from "../../frontend/lib/api";

import { ReviewCommentsPanel } from "../../frontend/components/review/review-comments-panel";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("review comment draft and write ownership", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/submissions/sub-1" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function render(requester: Fetcher, id = "sub-1") { await act(async () => root.render(<ReviewDetailRoute id={id} locale={locale} requester={requester} />)); await flush(); }
  function button(label: string) { const found = [...container.querySelectorAll("button")].find(node => node.textContent === label); if (!found) throw new Error(`Missing ${label}: ${container.textContent}`); return found; }
  function text() { return container.querySelector("textarea")!; }
  async function type(value: string) { await act(async () => { const input = text(); if (!input) throw new Error(container.innerHTML); Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event); }); }
  function unload() { const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; }
  async function leave() { await act(async () => writeWorkspaceHistory("push", "/home")); }
  function server(post: Fetcher = async () => receipt()) : Fetcher {
    return async (input, init) => {
      if (String(input).includes("/comments/requests/")) {
        if (init?.method !== "PUT") return operationReceipt(String(input), null);
        const response = await post(input, init);
        if (!response.ok) return response;
        const payload = await response.json() as { comment?: unknown };
        return payload.comment ? operationReceipt(String(input), payload.comment) : json(payload);
      }
      return String(input).endsWith("/comments") ? json({ comments: [] }) : preview(String(input).includes("sub-2") ? "sub-2" : "sub-1");
    };
  }

  it("confirms dirty comments and clears only after actual discard navigation", async () => {
    await render(server()); await type("Private draft"); expect(unload()).toBe(true); await leave();
    expect(browser.location.pathname).toBe("/admin/submissions/sub-1");
    await act(async () => button("Keep editing").click()); expect(text().value).toBe("Private draft");
    await leave(); await act(async () => button("Discard changes").click());
    expect(browser.location.pathname).toBe("/home"); expect(unload()).toBe(false);
  });

  it("coalesces same-event submits, freezes input, and blocks leave until a matching receipt", async () => {
    const pending = deferred<Response>(); const post = vi.fn(() => pending.promise);
    await render(server(post)); await type("A note");
    const add = button("Add comment"); await act(async () => { add.click(); add.click(); writeWorkspaceHistory("push", "/home"); });
    expect(post).toHaveBeenCalledTimes(1); expect(text().disabled).toBe(true); expect(unload()).toBe(true);
    expect(browser.location.pathname).toBe("/admin/submissions/sub-1");
    await act(async () => pending.resolve(receipt())); await flush();
    expect(text().value).toBe(""); expect(unload()).toBe(false); expect(container.textContent).toContain("A note");
  });

  it.each(["transport", "wrong-target", "wrong-body", "edit-receipt", "malformed", "500", "401", "403", "generic400"])("keeps %s unknown and never automatically repeats a PUT", async outcome => {
    let posts = 0;
    const request = server(async () => { posts++; if (outcome === "transport") throw new TypeError("Failed to fetch"); if (outcome === "malformed") return json({}); if (["500", "401", "403", "generic400"].includes(outcome)) return new Response(null, { status: outcome === "generic400" ? 400 : Number(outcome) }); return receipt(outcome === "wrong-target" ? "sub-2" : "sub-1", outcome === "wrong-body" ? "someone else" : "A note", outcome === "edit-receipt" ? "old-comment" : undefined); });
    await render(request); await type("A note"); await act(async () => button("Add comment").click()); await flush();
    expect(text().value).toBe("A note"); expect(button("Add comment").disabled).toBe(true); expect(unload()).toBe(true);
    await leave(); expect(browser.location.pathname).toBe("/admin/submissions/sub-1"); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    await act(async () => button("Reload current state").click()); await flush();
    expect(posts).toBe(1); expect(unload()).toBe(true); expect(button("Add comment").disabled).toBe(true);
  });

  it.each([403, 404, 500])("retains unsent comments across detail %s and restores only on reauthorized read", async status => {
    let read = 0;
    const request: Fetcher = async (input) => String(input).endsWith("/comments") ? json({ comments: [] }) : ++read === 2 ? new Response(null, { status }) : preview("sub-1");
    await render(request); await type("Hidden private draft");
    // A dependency read is independent of this comment draft.
    await render((input, init) => request(input, init));
    expect(text()).toBeNull(); expect(container.textContent).not.toContain("Hidden private draft"); expect(unload()).toBe(true);
    await leave(); expect(browser.location.pathname).toBe("/admin/submissions/sub-1");
    await act(async () => button("Keep editing").click());
    await act(async () => button("Try again").click()); await flush(); expect(text().value).toBe("Hidden private draft");
  });

  it("retains an in-flight comment through detail denial and accepts its late matching receipt", async () => {
    const pending = deferred<Response>(); let reads = 0; let posts = 0;
    const request: Fetcher = async (input, init) => { if (init?.method === "PUT") { posts++; const result = await pending.promise; return operationReceipt(String(input), (await result.json() as { comment: unknown }).comment); } if (String(input).endsWith("/comments")) return json({ comments: [] }); return ++reads === 2 ? new Response(null, { status: 403 }) : preview("sub-1"); };
    await render(request); await type("A note"); await act(async () => button("Add comment").click());
    await render((input, init) => request(input, init)); expect(text()).toBeNull(); await leave(); expect(browser.location.pathname).toBe("/admin/submissions/sub-1"); expect(unload()).toBe(true);
    await act(async () => pending.resolve(receipt())); await flush(); expect(posts).toBe(1); expect(unload()).toBe(false);
  });

  it("isolates target lifetimes from old write callbacks", async () => {
    const pending = deferred<Response>(); const request = server(() => pending.promise);
    await render(request); await type("A note"); await act(async () => button("Add comment").click());
    await render(request, "sub-2"); await type("New target draft");
    await act(async () => pending.resolve(receipt())); await flush(); expect(text().value).toBe("New target draft"); expect(container.textContent).not.toContain("A note"); expect(unload()).toBe(true);
  });

  it("permits explicit corrected resubmission after a definite pre-write rejection", async () => {
    let posts = 0; const request = server(async () => ++posts === 1 ? new Response(JSON.stringify({ error: { code: "REVIEW_COMMENT_INVALID", message: "invalid", retryable: false } }), { status: 400 }) : receipt("sub-1", "Corrected"));
    await render(request); await type("A note"); await act(async () => button("Add comment").click()); await flush();
    expect(text().disabled).toBe(false); expect(text().value).toBe("A note"); await type("Corrected"); await act(async () => button("Add comment").click()); await flush(); expect(posts).toBe(2); expect(unload()).toBe(false);
  });
  it("does not warn for an untouched form", async () => {
    await render(server()); expect(unload()).toBe(false); await leave(); expect(browser.location.pathname).toBe("/home");
  });

  it("submits the synchronous input and refuses edits while the operation owns it", async () => {
    const pending = deferred<Response>(); const post = vi.fn<Fetcher>(() => pending.promise);
    await render(server()); await type("first");
    const request = server(post); await render(request);
    await act(async () => { const input = text(); Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype, "value")!.set!.call(input, "A note"); input.dispatchEvent(new browser.Event("input", { bubbles: true }) as unknown as Event); button("Add comment").click(); });
    expect(JSON.parse(String(post.mock.calls[0][1]?.body))).toEqual({ body: "A note" });
    await type("late edit"); await act(async () => pending.resolve(receipt())); await flush(); expect(text().value).toBe("");
  });

  it("does not mistake an identical listed comment for a lost POST receipt", async () => {
    let reads = 0; let posts = 0;
    const request: Fetcher = async (input, init) => {
      if (init?.method === "PUT") { posts++; throw new TypeError("offline"); }
      if (String(input).includes("/comments/requests/")) return operationReceipt(String(input), null);
      if (!String(input).endsWith("/comments")) return preview("sub-1");
      return json({ comments: ++reads === 1 ? [] : [{ id: "other-request", submissionId: "sub-1", authorRole: "admin", body: "A note", createdAt: "2026-10-02" }] });
    };
    await render(request); await type("A note"); await act(async () => button("Add comment").click()); await flush();
    await act(async () => button("Reload current state").click()); await flush();
    expect(container.textContent).toContain("A note"); expect(posts).toBe(1); expect(button("Add comment").disabled).toBe(true); expect(unload()).toBe(true);
  });

  it("retains hidden comments draft when final navigation admission is denied", async () => {
    const request = server(); await render(request); await type("private");
    const denyComments: Fetcher = async (input, init) => String(input).endsWith("/comments") ? new Response(null, { status: 403 }) : request(input, init);
    await render(denyComments); expect(text()).toBeNull(); expect(container.textContent).not.toContain("private");
    const unregister = registerWorkspaceLeaveGuard(() => ({ kind: "allow", beforeCommit: () => false }));
    try { await leave(); await act(async () => button("Discard changes").click()); expect(browser.location.pathname).toBe("/admin/submissions/sub-1"); expect(unload()).toBe(true); } finally { unregister(); }
    await render(request); expect(text().value).toBe("private");
  });

  it("does not let an older GET overwrite the latest authorized comments", async () => {
    const read = deferred<Response>();
    const first: Fetcher = async input => String(input).endsWith("/comments") ? read.promise : preview("sub-1");
    await render(first); expect(text()).toBeNull();
    await render(server()); await type("new draft");
    await act(async () => read.resolve(json({ comments: [{ id: "old", submissionId: "sub-1", authorRole: "admin", body: "stale private response", createdAt: "2026-10-02" }] }))); await flush();
    expect(container.textContent).not.toContain("stale private response"); expect(text().value).toBe("new draft");
  });

  it("protects standalone panels through StrictMode effect replay", async () => {
    const request = server();
    await act(async () => root.render(<React.StrictMode><ReviewCommentsPanel submissionId="sub-1" requester={request} locale={locale} /></React.StrictMode>)); await flush();
    await type("standalone draft"); await leave(); expect(browser.location.pathname).toBe("/admin/submissions/sub-1"); await act(async () => button("Keep editing").click()); expect(text().value).toBe("standalone draft");
  });

  it("recovers a lost receipt using the exact operation without issuing another write", async () => {
    let path = ""; let writes = 0;
    const base = server();
    const request: Fetcher = async (input, init) => {
      if (String(input).includes("/comments/requests/")) {
        if (init?.method === "PUT") { path = String(input); writes++; throw new TypeError("receipt lost"); }
        expect(String(input)).toBe(path);
        return operationReceipt(path, (await receipt().json() as { comment: unknown }).comment);
      }
      return base(input, init);
    };
    await render(request); await type("A note"); await act(async () => button("Add comment").click()); await flush();
    expect(unload()).toBe(true);
    await act(async () => button("Reload current state").click()); await flush();
    expect(writes).toBe(1); expect(text().value).toBe(""); expect(unload()).toBe(false);
  });

  it("retries only the same frozen operation after an absent lookup and coalesces repeat clicks", async () => {
    const calls: { path: string; body: string }[] = []; const pending = deferred<Response>();
    const request = server(async (input, init) => {
      calls.push({ path: String(input), body: String(init?.body) });
      if (calls.length === 1) throw new TypeError("lost");
      return pending.promise;
    });
    await render(request); await type("A note"); await act(async () => button("Add comment").click()); await flush();
    await act(async () => button("Reload current state").click()); await flush(); expect(unload()).toBe(true);
    await act(async () => { const retry = button("Retry same comment"); retry.click(); retry.click(); });
    expect(calls).toHaveLength(2); expect(calls[1]).toEqual(calls[0]); expect(text().disabled).toBe(true);
    await act(async () => pending.resolve(receipt())); await flush(); expect(unload()).toBe(false);
    expect(text().value).toBe("");
  });

  it("keeps a previously unknown operation locked when its retry is rejected before writing", async () => {
    let writes = 0;
    const request = server(async () => {
      if (++writes === 1) throw new TypeError("lost");
      return jsonError(400, "REVIEW_COMMENT_INVALID");
    });
    await render(request); await type("A note"); await act(async () => button("Add comment").click()); await flush();
    await act(async () => button("Retry same comment").click()); await flush();
    expect(writes).toBe(2); expect(unload()).toBe(true); expect(text().value).toBe("A note"); expect(text().disabled).toBe(true);
  });

  it("does not fall back to legacy POST when the operation endpoint is unavailable", async () => {
    const methods: string[] = []; const base = server();
    const request: Fetcher = async (input, init) => {
      if (String(input).includes("/comments/requests/")) { methods.push(init?.method ?? "GET"); return new Response(null, { status: 404 }); }
      return base(input, init);
    };
    await render(request); await type("A note"); await act(async () => button("Add comment").click()); await flush();
    expect(methods.filter(m => m !== "GET")).toEqual(["PUT"]); expect(unload()).toBe(true);
  });

  it("ignores an old exact lookup after the target lifetime changes", async () => {
    const pending = deferred<Response>(); let path = "";
    const base = server();
    const request: Fetcher = async (input, init) => {
      if (String(input).includes("/comments/requests/")) {
        path = String(input);
        if (init?.method === "PUT") throw new TypeError("lost");
        return pending.promise;
      }
      return base(input, init);
    };
    await render(request); await type("A note"); await act(async () => button("Add comment").click()); await flush();
    await act(async () => button("Reload current state").click());
    await render(request, "sub-2"); await type("New target draft");
    await act(async () => pending.resolve(operationReceipt(path, (await receipt().json() as { comment: unknown }).comment))); await flush();
    expect(text().value).toBe("New target draft"); expect(unload()).toBe(true); expect(container.textContent).not.toContain("A note");
  });

  it("hides private draft and prevents retry after exact lookup loses authorization", async () => {
    const base = server();
    const request: Fetcher = async (input, init) => {
      if (String(input).includes("/comments/requests/")) {
        if (init?.method === "PUT") throw new TypeError("lost");
        return new Response(null, { status: 403 });
      }
      return base(input, init);
    };
    await render(request); await type("Private note"); await act(async () => button("Add comment").click()); await flush();
    await act(async () => button("Reload current state").click()); await flush();
    expect(text()).toBeNull(); expect(container.textContent).not.toContain("Private note"); expect(container.textContent).not.toContain("Retry same comment"); expect(unload()).toBe(true);
  });

});
function receipt(submissionId = "sub-1", body = "A note", supersedesCommentId?: string) { return json({ comment: { id: "comment-1", submissionId, authorRole: "admin", body, createdAt: "2026-10-02T00:00:00Z", ...(supersedesCommentId ? { supersedesCommentId } : {}) } }); }
function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function preview(id: string, status = "review_pending") { return json({ preview: { submissionId: id, submitterId: "member-1", status, requestedSpaceId: "default", requestedVisibility: "shared", requestedCollectionId: null, tagIds: [], title: `Title ${id}`, rawContent: `Content ${id}`, sourceVersion: { id: "version-1", content: `Content ${id}`, kind: "markdown", parserVersion: "m1" }, safety: { status: "safe", findings: [] }, chunks: [] } }); }
async function flush() { for (let i = 0; i < 3; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }

function operationReceipt(path: string, comment: unknown) {
  const match = /submissions\/([^/]+)\/comments\/requests\/([^/]+)/.exec(path)!;
  return json({ operation: { version: 1, operationId: match[2], submissionId: match[1], comment } });
}
function jsonError(status: number, code: string) { return new Response(JSON.stringify({ error: { code, message: code, retryable: false } }), { status, headers: { "content-type": "application/json" } }); }
