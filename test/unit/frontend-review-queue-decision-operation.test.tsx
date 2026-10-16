// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewQueueRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// happy-dom instantiates the vm mocks above at import time, so it must be loaded
// after InertVmScript and the vi.mock declarations exist; a static import is
// hoisted above them and breaks the mock.
const { Window } = await import("happy-dom");

const version = "2026-08-22T00:00:00.000Z";

describe("review queue decision identity", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;
  let driver: ReturnType<typeof installWorkspaceHistoryDriver>;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/submissions" });
    driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  const locale = () => createLocaleRuntime({ storage: { getItem: () => "en", setItem: () => {} } });
  async function mount() { await act(async () => root.render(<ReviewQueueRoute locale={locale()} memberId="member-a" search={browser.location.search} />)); await flush(); }
  async function click(label: string) { const el = [...container.querySelectorAll("button")].find((button) => button.textContent === label); expect(el, label).toBeTruthy(); await act(async () => el!.click()); await flush(); }
  function unload() { const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; }

  it("decides from the queue with one operation identity and the row's authoritative version", async () => {
    const posts: string[] = [];
    let reads = 0;
    vi.stubGlobal("fetch", async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(String(init.body));
        return json({ decision: { submissionId: "review-1", decision: "rejected", note: "" } });
      }
      reads += 1;
      return reads === 1
        ? queue([{ id: "review-1", title: "Review", submitterId: "member-1", status: "review_pending", updatedAt: version }])
        : queue([]);
    });
    await mount();
    await click("Reject");
    await click("Confirm rejection");
    const final = container.querySelector("[data-confirm-action]") as HTMLButtonElement;
    await act(async () => final.click());
    await flush();

    expect(posts).toHaveLength(1);
    const body = JSON.parse(posts[0]!) as Record<string, unknown>;
    // The decision carries the authoritative version it was read at, so a stale
    // queue entry cannot overwrite a newer state on the server.
    expect(body).toEqual({
      reasonCode: "not_relevant", note: "",
      operationId: `review.reject.review-1.${version}`, expectedUpdatedAt: version,
    });
    // The queue then reflects the authoritative result of the decision.
    expect(container.textContent).toContain("Submission rejected.");
    expect(container.textContent).toContain("No submissions are waiting");
    expect(reads).toBe(2);
    expect(browser.sessionStorage.getItem("memory-garden:review-decision:v1:member-a:review-1")).toBeNull();
  });

  it("keeps a stale decision recoverable until the authoritative state is re-read", async () => {
    const posts: string[] = [];
    let reads = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(String(init.body));
        return json({
          error: {
            code: "REVIEW_VERSION_CONFLICT", message: "Submission changed since it was read", retryable: false,
            details: { submissionId: "review-1", status: "revision_requested", updatedAt: "2026-08-23T00:00:00.000Z" },
          },
        }, 409);
      }
      if (String(input).endsWith("/review-1")) return preview("revision_requested");
      reads += 1;
      return reads === 1
        ? queue([{ id: "review-1", title: "Review", submitterId: "member-1", status: "review_pending", updatedAt: version }])
        : queue([]);
    });
    await mount();
    await click("Reject");
    await click("Confirm rejection");
    const final = container.querySelector("[data-confirm-action]") as HTMLButtonElement;
    await act(async () => final.click());
    await flush();

    // The rejected decision is a visible conflict with a re-read path, not a silent overwrite.
    expect(container.textContent).toContain("The submission state changed");
    expect(container.textContent).not.toContain("Retry same decision");
    expect(unload()).toBe(true);
    const stored = browser.sessionStorage.getItem("memory-garden:review-decision:v1:member-a:review-1");
    expect(stored).toContain(`review.reject.review-1.${version}`);

    await click("Reload current state");
    // Re-reading resolves the unknown decision against the authoritative state.
    expect(reads).toBe(2);
    expect(container.textContent).not.toContain("The submission state changed");
    expect(browser.sessionStorage.getItem("memory-garden:review-decision:v1:member-a:review-1")).toBeNull();
    expect(unload()).toBe(false);
    expect(posts).toHaveLength(1);
    await act(async () => writeWorkspaceHistory("push", "/home"));
    expect(browser.location.pathname).toBe("/home");
  });
});

function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function queue(items: Array<{ id: string; title: string; submitterId: string; status: string; updatedAt?: string }>) {
  return json({ items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } });
}
function preview(status: string) {
  return json({ preview: { submissionId: "review-1", title: "Review", status, requestedSpaceId: "default" } });
}
async function flush() {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  await act(async () => { await promise; });
}
