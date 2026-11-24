// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewQueuePage } from "../../frontend/pages/admin/review-queue-page";
import { ReviewBatchPage } from "../../frontend/pages/admin/review-batch-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import type { ReviewQueuePageResult } from "../../frontend/lib/admin-review-data";

// Loaded dynamically inside this suite: `react-dom/client` latches onto the DOM
// globals the first time it is evaluated, so the isolated happy-dom window has
// to be installed before the module graph pulls it in.
//
// happy-dom evaluates its initialisation script through `node:vm`; the inert
// shim keeps that script out of a second realm while still giving the window the
// intrinsics it needs (same idiom as test/unit/frontend-review-queue-leave.test.tsx).
const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

interface SentAction {
  submissionId: string;
  action: "reject" | "request_revision";
  reasonCode: string;
  note: string;
  operationId: string;
  expectedUpdatedAt: string;
}

const ROWS = [
  { id: "review-1", title: "First", submitter: "member-1", status: "review_pending", updatedAt: "2026-10-01T00:00:00.000Z" },
  { id: "review-2", title: "Second", submitter: "member-2", status: "review_pending", updatedAt: "2026-10-02T00:00:00.000Z" },
];

function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function page(): ReviewQueuePageResult { return { items: ROWS.map((row) => ({ ...row })), pagination: { page: 1, pageSize: 20, total: ROWS.length, totalPages: 1 } }; }

/** A batch response whose counts are derived from the same item list it returns. */
function summary(actions: readonly SentAction[], failIds: ReadonlySet<string>) {
  const items = actions.map((action) => failIds.has(action.submissionId)
    ? { submissionId: action.submissionId, action: action.action, status: "failed", error: { code: "PUBLICATION_CONFLICT", status: 409, retryable: false } }
    : { submissionId: action.submissionId, action: action.action, status: "succeeded", result: { decision: "recorded" } });
  const failed = items.filter((item) => item.status === "failed").length;
  return { requested: items.length, succeeded: items.length - failed, failed, items };
}

/** The actions this test itself serialized into the request body. */
function requestActions(init?: RequestInit): SentAction[] {
  const parsed: unknown = JSON.parse(String(init?.body ?? "{}"));
  if (!parsed || typeof parsed !== "object" || !("actions" in parsed) || !Array.isArray(parsed.actions)) throw new Error("TEST_REQUEST_BODY_INVALID");
  // Test double: the serialized body is the one this suite just built.
  return parsed.actions as SentAction[];
}

function recordFetch(respond: (actions: SentAction[]) => unknown) {
  const bodies: SentAction[][] = [];
  vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    const actions = requestActions(init);
    bodies.push(actions);
    return json(respond(actions));
  });
  return bodies;
}

describe("review batch surface", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/submissions/batch" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, sessionStorage: browser.sessionStorage, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  // A well-known DOM node cast: `querySelector` only widens the element type.
  function node<T extends Element>(selector: string): T { const found = container.querySelector(selector); expect(found, selector).toBeTruthy(); return found as unknown as T; }
  async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
  async function clickOn(target: HTMLElement) { await act(async () => { target.click(); }); await flush(); }
  const locale = createLocaleRuntime({ storage: { getItem: () => "en", setItem: () => {} } });
  async function mountBatch(canReview = true, onComplete = vi.fn(), options: { search?: string; load?: typeof import("../../frontend/lib/admin-review-data").loadReviewQueuePage } = {}) {
    await act(async () => { root.render(<ReviewBatchPage locale={locale} memberId="member-admin" canReview={canReview} search={options.search} load={options.load ?? (async () => page())} onComplete={onComplete} />); });
    await flush();
    return onComplete;
  }
  async function mountQueue(canBatch = true) {
    const open = vi.fn();
    await act(async () => { root.render(<ReviewQueuePage locale={locale} state={{ kind: "ready", data: page() }} canBatch={canBatch} onOpenBatch={open} />); });
    await flush();
    return open;
  }
  async function selectAll() { await clickOn(node<HTMLButtonElement>("[data-batch-select-all]")); }

  it("renders one row per item and the real partial counts when some items fail", async () => {
    const bodies = recordFetch((actions) => summary(actions, new Set(["review-2"])));
    await mountBatch();
    await selectAll();
    const rowCheckbox = node('[data-batch-select="review-1"]').querySelector('[role="checkbox"]');
    expect(rowCheckbox).not.toBeNull();
    expect(rowCheckbox!.getAttribute("aria-checked")).toBe("true");
    await clickOn(node("[data-batch-send]"));
    expect(node('[data-batch-outcome="review-1"]').getAttribute("data-batch-outcome-status")).toBe("succeeded");
    expect(node('[data-batch-outcome="review-2"]').getAttribute("data-batch-outcome-status")).toBe("failed");
    const text = node("[data-batch-summary]").textContent ?? "";
    expect(text).toContain("1 of 2 applied");
    expect(text).toContain("1 failed");
    expect(text).not.toContain("All");
    expect(node('[data-batch-outcome="review-2"]').textContent).toContain("PUBLICATION_CONFLICT");
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.map((action) => action.submissionId)).toEqual(["review-1", "review-2"]);
  });

  it("retries only the failures under their original operation numbers", async () => {
    const bodies = recordFetch((actions) => summary(actions, new Set(["review-2"])));
    await mountBatch();
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    const original = bodies[0]!.find((action) => action.submissionId === "review-2")!;
    await clickOn(node("[data-batch-retry-failed]"));
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.map((action) => action.submissionId)).toEqual(["review-2"]);
    expect(bodies[1]![0]!.operationId).toBe(original.operationId);
    expect(bodies[1]![0]!.expectedUpdatedAt).toBe(original.expectedUpdatedAt);
    expect(bodies[1]![0]!.expectedUpdatedAt).toBe("2026-10-02T00:00:00.000Z");
  });

  it("refuses a second send while a batch is in flight", async () => {
    const gate = Promise.withResolvers<void>();
    const bodies: SentAction[][] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const actions = requestActions(init);
      bodies.push(actions); await gate.promise;
      return json(summary(actions, new Set()));
    });
    await mountBatch();
    await selectAll();
    const send = node<HTMLButtonElement>("[data-batch-send]");
    await act(async () => { send.click(); });
    await act(async () => { send.click(); }); await flush();
    expect(bodies).toHaveLength(1);
    expect(node("[data-batch-notice]").textContent).toContain("already in progress");
    expect(node("[data-batch-scope-lock]")).toBeTruthy();
    await act(async () => { gate.resolve(); await gate.promise; });
    await flush();
    expect(node('[data-batch-outcome="review-1"]').getAttribute("data-batch-outcome-status")).toBe("succeeded");
    expect(bodies).toHaveLength(1);
  });

  it("disables send until something on the page is selected", async () => {
    recordFetch(() => summary([], new Set()));
    await mountBatch();
    expect(node<HTMLButtonElement>("[data-batch-send]").disabled).toBe(true);
    expect(node("[data-batch-none-selected]")).toBeTruthy();
    await selectAll();
    expect(node<HTMLButtonElement>("[data-batch-send]").disabled).toBe(false);
  });

  it("offers the batch page from the queue and hides the entry without the capability", async () => {
    const open = await mountQueue(true);
    const entry = node<HTMLButtonElement>("[data-review-batch-open]");
    await clickOn(entry);
    expect(open).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-batch-toolbar]")).toBeNull();

    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await mountQueue(false);
    expect(container.querySelector("[data-review-batch-open]")).toBeNull();
    expect(container.textContent).toContain("First");
  });

  it("renders no batch affordance on the batch page when the capability is absent", async () => {
    await mountBatch(false);
    expect(container.querySelector("[data-batch-toolbar]")).toBeNull();
    expect(container.querySelector("[data-batch-select]")).toBeNull();
    expect(container.querySelector("[data-batch-results]")).toBeNull();
    expect(container.querySelector("[data-batch-send]")).toBeNull();
    expect(container.textContent).toContain("no longer have permission");
  });

  it("returns to the queue after a fully successful submit", async () => {
    recordFetch((actions) => summary(actions, new Set()));
    const onComplete = await mountBatch();
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(node('[data-batch-outcome="review-1"]').getAttribute("data-batch-outcome-status")).toBe("succeeded");
  });

  it("opens the page requested by the queue and can page while keeping selection page-scoped", async () => {
    const calls: Array<{ page: number; pageSize: number }> = [];
    const secondPage: ReviewQueuePageResult = { items: [{ id: "review-3", title: "Third", submitter: "member-3", status: "review_pending", updatedAt: "2026-10-03T00:00:00.000Z" }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } };
    const load = async (input: { page: number; pageSize: number }) => { calls.push({ page: input.page, pageSize: input.pageSize }); return input.page === 2 ? secondPage : page(); };
    await mountBatch(true, vi.fn(), { search: "?page=2&pageSize=20", load: load as never });
    expect(calls[0]).toEqual({ page: 2, pageSize: 20 });
    expect(container.textContent).toContain("Third");
    await selectAll();
    expect(container.querySelector('[data-batch-select="review-3"]')?.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")).toBe("true");
  });

  it("does not navigate a late completion after the batch page was left", async () => {
    const gate = Promise.withResolvers<void>();
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const actions = requestActions(init);
      await gate.promise;
      return json(summary(actions, new Set()));
    });
    const onComplete = await mountBatch();
    await selectAll();
    await act(async () => { node<HTMLButtonElement>("[data-batch-send]").click(); });
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await act(async () => { gate.resolve(); await gate.promise; });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("restores a frozen unknown attempt after a remount instead of resubmitting it", async () => {
    recordFetch((actions) => summary(actions, new Set()));
    // A malformed 200 leaves the frozen attempt in sessionStorage.
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const actions = requestActions(init);
      return json({ requested: actions.length, succeeded: actions.length, failed: 0, items: [] });
    });
    await mountBatch();
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    expect(sessionStorage.getItem("memory-garden:review-batch-intent:v1:member-admin")).not.toBeNull();
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await mountBatch();
    expect(container.querySelector("[data-batch-unknown]")).not.toBeNull();
    expect(container.querySelector("[data-batch-select]")).toBeTruthy();
    // Restoration does not fire a second POST by itself.
    expect(container.querySelector("[data-batch-unknown]")).toBeTruthy();
  });

  it("keeps the frozen attempt on a transport failure and retries with the same operation numbers", async () => {
    let calls = 0;
    const bodies: SentAction[][] = [];
    let fail = true;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const actions = requestActions(init);
      bodies.push(actions);
      calls += 1;
      if (fail) { fail = false; throw new TypeError("Failed to fetch"); }
      return json(summary(actions, new Set()));
    });
    await mountBatch();
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    expect(container.querySelector("[data-batch-unknown]")).not.toBeNull();
    expect(sessionStorage.getItem("memory-garden:review-batch-intent:v1:member-admin")).not.toBeNull();
    const firstIds = bodies[0]!.map((action) => action.operationId);
    await clickOn(node("[data-batch-retry-original]"));
    expect(calls).toBe(2);
    expect(bodies[1]!.map((action) => action.operationId)).toEqual(firstIds);
    expect(container.querySelector("[data-batch-results]")).not.toBeNull();
  });

  it("allocates fresh operation numbers for a new confirmation, even with the same payload", async () => {
    const bodies: SentAction[][] = [];
    let first = true;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      const actions = requestActions(init);
      bodies.push(actions);
      if (first) { first = false; throw new TypeError("Failed to fetch"); }
      return json(summary(actions, new Set()));
    });
    await mountBatch();
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    await clickOn(node("[data-batch-discard-unknown]"));
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    expect(bodies).toHaveLength(2);
    expect(bodies[1]![0]!.operationId).not.toBe(bodies[0]![0]!.operationId);
    expect(bodies[1]![0]!.expectedUpdatedAt).toBe(bodies[0]![0]!.expectedUpdatedAt);
  });

  it("refuses to start a new batch while an earlier unknown attempt is unresolved", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      posts += 1;
      return json({ requested: 1, succeeded: 1, failed: 0, items: [] });
    });
    await mountBatch();
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    expect(container.querySelector("[data-batch-unknown]")).not.toBeNull();
    await clickOn(node("[data-batch-send]"));
    expect(posts).toBe(1);
    expect(node("[data-batch-notice]").textContent).toContain("before starting a new batch");
  });

  it("caps selection at the server batch ceiling on a 100-row page", async () => {
    const items = Array.from({ length: 25 }, (_, index) => ({ id: `review-${index}`, title: `Item ${index}`, submitter: "member-1", status: "review_pending", updatedAt: "2026-10-01T00:00:00.000Z" }));
    const large = { items, pagination: { page: 1, pageSize: 100, total: 25, totalPages: 1 } };
    let sent: SentAction[] = [];
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent = requestActions(init);
      return json(summary(sent, new Set()));
    });
    await mountBatch(true, vi.fn(), { search: "?page=1&pageSize=100", load: (async () => large) as never });
    await selectAll();
    expect(node("[data-batch-limit]").textContent).toContain("at most 20");
    expect(container.querySelectorAll('[role="checkbox"][aria-checked="true"]')).toHaveLength(20);
    await clickOn(node("[data-batch-send]"));
    expect(sent).toHaveLength(20);
  });

  it("recovers an unanswered first attempt by receipt lookup and same-number retry after refresh", async () => {
    const posts: SentAction[][] = [];
    let receiptReads = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/decisions/operations/")) {
        receiptReads += 1;
        return new Response(JSON.stringify({ error: { code: "REVIEW_RECEIPT_NOT_FOUND", message: "missing", retryable: false } }), { status: 404, headers: { "content-type": "application/json" } });
      }
      const actions = requestActions(init);
      posts.push(actions);
      if (posts.length === 1) throw new TypeError("Failed to fetch");
      return json(summary(actions, new Set()));
    });
    await mountBatch();
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await mountBatch();
    await clickOn(node("[data-batch-check-receipts]"));
    expect(receiptReads).toBe(2);
    await clickOn(node("[data-batch-retry-original]"));
    expect(posts).toHaveLength(2);
    expect(posts[1]!.map((action) => action.operationId)).toEqual(posts[0]!.map((action) => action.operationId));
  });

  it("checks the original operation receipts without deciding anything", async () => {
    let receiptReads = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/decisions/operations/")) {
        receiptReads += 1;
        return new Response(JSON.stringify({ error: { code: "REVIEW_RECEIPT_NOT_FOUND", message: "missing", retryable: false } }), { status: 404, headers: { "content-type": "application/json" } });
      }
      const actions = requestActions(init);
      return json({ requested: actions.length, succeeded: actions.length, failed: 0, items: [] });
    });
    await mountBatch();
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    await clickOn(node("[data-batch-check-receipts]"));
    expect(receiptReads).toBe(2);
    expect(node("[data-batch-receipt-check]").getAttribute("data-batch-receipt-check")).toBe("0:2");
  });

  it("treats a malformed 200 body as an unknown result and keeps the original attempts", async () => {
    vi.stubGlobal("fetch", async () => json({ requested: 2, succeeded: 2, failed: 0, items: [{ submissionId: "review-1", action: "reject", status: "succeeded", result: {} }] }));
    await mountBatch();
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    expect(container.querySelector("[data-batch-results]")).toBeNull();
    expect(node("[data-batch-unknown]").textContent).toContain("The batch result is unknown");
    expect(node("[data-batch-retry-original]")).toBeTruthy();
    expect(node("[data-batch-discard-unknown]")).toBeTruthy();
  });
});
