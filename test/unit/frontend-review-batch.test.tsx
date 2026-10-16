// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewQueuePage } from "../../frontend/pages/admin/review-queue-page";
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
    browser = new Window({ url: "https://app.test/admin/submissions" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  // A well-known DOM node cast: `querySelector` only widens the element type.
  function node<T extends Element>(selector: string): T { const found = container.querySelector(selector); expect(found, selector).toBeTruthy(); return found as unknown as T; }
  async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
  async function clickOn(target: HTMLElement) { await act(async () => { target.click(); }); await flush(); }
  async function mountQueue(batchEnabled = true) {
    const locale = createLocaleRuntime({ storage: { getItem: () => "en", setItem: () => {} } });
    await act(async () => { root.render(<ReviewQueuePage locale={locale} state={{ kind: "ready", data: page() }} batchEnabled={batchEnabled} memberId="member-admin" />); });
    await flush();
  }
  async function selectAll() { await clickOn(node<HTMLButtonElement>("[data-batch-select-all]")); }

  it("renders one row per item and the real partial counts when some items fail", async () => {
    const bodies = recordFetch((actions) => summary(actions, new Set(["review-2"])));
    await mountQueue();
    await selectAll();
    expect(node<HTMLInputElement>('[data-batch-select="review-1"]').checked).toBe(true);
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
    await mountQueue();
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
    await mountQueue();
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
    await mountQueue();
    expect(node<HTMLButtonElement>("[data-batch-send]").disabled).toBe(true);
    expect(node("[data-batch-none-selected]")).toBeTruthy();
    await selectAll();
    expect(node<HTMLButtonElement>("[data-batch-send]").disabled).toBe(false);
  });

  it("renders no batch affordance when the capability is absent", async () => {
    await mountQueue(false);
    expect(container.querySelector("[data-batch-toolbar]")).toBeNull();
    expect(container.querySelector("[data-batch-select]")).toBeNull();
    expect(container.querySelector("[data-batch-results]")).toBeNull();
    expect(container.querySelector("[data-batch-send]")).toBeNull();
    expect(container.textContent).toContain("First");
  });

  it("never presents a fully successful summary when the counts disagree with the items", async () => {
    vi.stubGlobal("fetch", async () => json({ requested: 2, succeeded: 2, failed: 0, items: [{ submissionId: "review-1", action: "reject", status: "succeeded", result: {} }] }));
    await mountQueue();
    await selectAll();
    await clickOn(node("[data-batch-send]"));
    expect(container.querySelector("[data-batch-results]")).toBeNull();
    expect(node("[data-batch-rejected]").textContent).toContain("BATCH_REVIEW_RESPONSE_INVALID");
  });
});
