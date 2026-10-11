// @vitest-environment node
// Deterministic coverage for the cross-tab re-read contract of
// frontend/lib/use-notification-summary.ts. Native verification is impossible
// here: headless Chrome reports document.visibilityState === "hidden" and
// Page.bringToFront emits neither focus nor visibilitychange, so the re-read
// triggers are locked down against Happy DOM instead of a live browser.
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationSummary } from "../../frontend/lib/use-notification-summary";
import { invalidateNotificationSummary } from "../../frontend/lib/notification-summary-events";

// Match the existing frontend harness: Workerd lacks node:vm constructors, so
// happy-dom must be loaded after this inert stub is registered. The literal
// specifier stays dynamic on purpose — a static import would evaluate
// happy-dom before the stub, reviving the Script-is-not-a-constructor crash.
const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");
type WindowInstance = InstanceType<typeof Window>;

interface DeferredResponse { promise: Promise<Response>; resolve: (value: Response) => void; }
function deferred(): DeferredResponse {
  const { promise, resolve } = Promise.withResolvers<Response>();
  return { promise, resolve };
}
type Pending = { signal: AbortSignal | null | undefined; result: DeferredResponse };

function Harness({ scope = "member-1", pathname = "/tasks" }: { scope?: string; pathname?: string }) {
  const { state } = useNotificationSummary(scope, pathname, true);
  return <div data-summary data-state={state.kind}>{state.kind === "ready" ? String(state.unread) : ""}</div>;
}

describe("notification summary focus/visibility re-read", () => {
  let browser: WindowInstance, container: HTMLElement, root: Root, visible: boolean;
  let requests: Pending[];
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/tasks" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    visible = true;
    Object.defineProperty(browser.document, "visibilityState", { configurable: true, get: () => (visible ? "visible" : "hidden") });
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node); root = createRoot(container); requests = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/notifications/summary") { const result = deferred(); requests.push({ signal: init?.signal, result }); return result.promise; }
      throw new Error(`Unexpected request ${String(input)}`);
    }));
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  const status = () => container.querySelector("[data-summary]");
  async function render(props: { scope?: string; pathname?: string } = {}) { await act(async () => root.render(<Harness {...props} />)); }
  async function answer(index: number, body: unknown, code = 200) {
    await act(async () => { requests[index]!.result.resolve(Response.json(body, { status: code })); await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  const focus = () => act(async () => { browser.dispatchEvent(new browser.Event("focus")); });
  const visibility = () => act(async () => { browser.document.dispatchEvent(new browser.Event("visibilitychange")); });
  const notify = () => act(async () => { invalidateNotificationSummary(); });

  it("re-reads the summary exactly once on window focus", async () => {
    await render(); expect(requests).toHaveLength(1);
    await answer(0, { unread: 5 }); expect(status()?.textContent).toBe("5");
    await focus(); expect(requests).toHaveLength(2); expect(status()?.getAttribute("data-state")).toBe("loading");
    await answer(1, { unread: 6 }); expect(status()?.textContent).toBe("6");
  });

  it("re-reads on visibilitychange only while the document is visible", async () => {
    await render(); await answer(0, { unread: 1 });
    visible = false; await visibility(); expect(requests).toHaveLength(1);
    visible = true; await visibility(); expect(requests).toHaveLength(2);
    await answer(1, { unread: 2 }); expect(status()?.textContent).toBe("2");
  });

  it("supersedes an in-flight read when a summary invalidation arrives", async () => {
    await render(); expect(requests).toHaveLength(1);
    await notify(); expect(requests).toHaveLength(2); expect(requests[0]!.signal?.aborted).toBe(true);
    await answer(0, { unread: 50 }); expect(status()?.getAttribute("data-state")).toBe("loading"); expect(status()?.textContent).not.toBe("50");
    await answer(1, { unread: 3 }); expect(status()?.textContent).toBe("3");
  });

  it("detaches focus, visibility and subscription listeners on unmount", async () => {
    await render(); await answer(0, { unread: 4 });
    await act(async () => root.render(null));
    await focus(); await visibility(); await notify();
    expect(requests).toHaveLength(1);
  });

  it.each([401, 403])("latches %s denial and suppresses later reads for the same scope", async (code) => {
    await render(); await answer(0, {}, code);
    expect(status()?.getAttribute("data-state")).toBe("forbidden");
    await focus(); await visibility(); await notify();
    expect(requests).toHaveLength(1);
    await render({ pathname: "/knowledge" });
    expect(requests).toHaveLength(1); expect(status()?.getAttribute("data-state")).toBe("forbidden");
  });
});
