// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenanceStatusPanel } from "../../frontend/components/admin/maintenance-status-panel";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import type { Fetcher } from "../../frontend/lib/api";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
// `happy-dom` and `react-dom/client` capture DOM globals when first evaluated, so
// they must be imported after the stub below rather than statically at the top.
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ storage: { getItem: () => "en", setItem: () => {} } });

const openStatus = { phase: "OPEN", epoch: 4, window: null, active: 0 };
const capacity = { phase: "OPEN", epoch: 4, window: null, active: 0, records: 8123, tombstones: 8123, capacityLimit: 10000, capacityRemaining: 1877, alert: "WARNING", requiresManualReview: false };

interface Call { readonly path: string; readonly method: string; readonly body: Record<string, unknown> | null }

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("admin maintenance status panel", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    browser.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function flush() {
    await act(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 0);
      await promise;
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
  }

  function recordingRequester(handlers: { status?: () => Response; capacity?: () => Response; control?: (body: Record<string, unknown>) => Response }): { requester: Fetcher; calls: Call[] } {
    const calls: Call[] = [];
    const requester: Fetcher = async (input, init) => {
      const path = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      calls.push({ path, method, body });
      if (path === "/api/admin/maintenance/status") return handlers.status ? handlers.status() : json(openStatus);
      if (path === "/api/admin/maintenance/capacity") return handlers.capacity ? handlers.capacity() : json(capacity);
      if (path.startsWith("/api/admin/maintenance/")) return handlers.control ? handlers.control(body!) : json(openStatus);
      return json({ error: { code: "NOT_FOUND", message: "NOT_FOUND", retryable: false } }, 404);
    };
    return { requester, calls };
  }

  async function mount(requester: Fetcher) {
    await act(async () => root.render(<MaintenanceStatusPanel locale={locale} memberId="admin-1" requester={requester} />));
    await flush();
  }

  const attr = (selector: string, name: string) => container.querySelector(selector)?.getAttribute(name);

  it("shows exactly the state and capacity numbers the server sent", async () => {
    const { requester } = recordingRequester({});
    await mount(requester);
    expect(attr("[data-maintenance-phase]", "data-maintenance-phase")).toBe("OPEN");
    expect(attr("[data-maintenance-epoch]", "data-maintenance-epoch")).toBe("4");
    expect(attr("[data-maintenance-window]", "data-maintenance-window")).toBe("none");
    expect(attr("[data-maintenance-active]", "data-maintenance-active")).toBe("0");
    expect(attr("[data-maintenance-records]", "data-maintenance-records")).toBe("8123");
    expect(attr("[data-maintenance-capacity-limit]", "data-maintenance-capacity-limit")).toBe("10000");
    expect(attr("[data-maintenance-capacity-remaining]", "data-maintenance-capacity-remaining")).toBe("1877");
    expect(attr("[data-maintenance-alert]", "data-maintenance-alert")).toBe("WARNING");
    expect(attr("[data-maintenance-requires-review]", "data-maintenance-requires-review")).toBe("no");
  });

  it("stays read-only when the instance has no maintenance control configured", async () => {
    const { requester, calls } = recordingRequester({ status: () => json({ error: { code: "MAINTENANCE_CONTROL_UNAVAILABLE", message: "Maintenance control is not enabled", retryable: true } }, 503) });
    await mount(requester);
    expect(attr("[data-maintenance-control]", "data-maintenance-control")).toBe("unavailable");
    expect(container.textContent).toContain("not enabled on this instance");
    expect(container.querySelector("[data-maintenance-begin-drain]")).toBeNull();
    expect(container.querySelector("[data-maintenance-resume]")).toBeNull();
    // The capacity read is never issued when control is unavailable, and no write is possible.
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(0);
    expect(calls.some((call) => call.path === "/api/admin/maintenance/capacity")).toBe(false);
  });

  it("makes a drain in flight unmistakable", async () => {
    const draining = { phase: "DRAINING", epoch: 7, window: "mw-2026-10-16", active: 3 };
    const { requester } = recordingRequester({
      status: () => json(draining),
      capacity: () => json({ ...draining, records: 40, tombstones: 37, capacityLimit: 10000, capacityRemaining: 9960, alert: "NONE", requiresManualReview: true }),
    });
    await mount(requester);
    const banner = container.querySelector('[data-maintenance-drain="in-flight"]');
    expect(banner).toBeTruthy();
    expect(banner?.getAttribute("role")).toBe("alert");
    expect(banner?.textContent).toContain("mw-2026-10-16");
    expect(banner?.textContent).toContain("3");
    expect(attr("[data-maintenance-requires-review]", "data-maintenance-requires-review")).toBe("yes");
    // The drain is active: no control is offered here while it runs.
    expect(container.querySelector("[data-maintenance-begin-drain]")).toBeNull();
    expect(container.querySelector("[data-maintenance-resume]")).toBeNull();
  });

  it("offers no drain or resume control, and names the operations endpoints instead", async () => {
    const { requester, calls } = recordingRequester({});
    await mount(requester);
    // Draining needs the runbook window and a control token this instance does not
    // have, so the surface reports state and sends no control request at all.
    expect(container.querySelector("[data-maintenance-read-only]")?.textContent).toContain("POST /api/admin/maintenance/begin-drain");
    expect(container.querySelector("[data-maintenance-begin-drain]")).toBeNull();
    expect(container.querySelector("[data-maintenance-resume]")).toBeNull();
    expect(calls.filter((call) => call.method !== "GET")).toHaveLength(0);
  });
});
