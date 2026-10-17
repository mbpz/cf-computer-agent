// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetHygienePanel } from "../../frontend/components/assets/asset-hygiene-panel";
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
const GIB = 1024 * 1024 * 1024;

const capacity = { storageEnabled: true, usedBytes: 3 * 1024 * 1024, maxBytes: 9 * GIB, warningThresholdBytes: 8 * GIB, warning: false };
const orphans = {
  items: [
    { key: "staging/a.bin", size: 1024 * 1024, uploadedAt: "2026-08-01T00:00:00.000Z" },
    { key: "staging/b.bin", size: 2 * 1024 * 1024, uploadedAt: "2026-08-02T00:00:00.000Z" },
  ],
  scanned: 4,
  truncated: false,
};

interface Call { readonly path: string; readonly method: string; readonly body: Record<string, unknown> | null }

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function error(code: string, status: number, retryable: boolean): Response {
  return json({ error: { code, message: code, retryable } }, status);
}

describe("admin asset hygiene panel", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  let mounts = 0;

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/assets" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
    mounts = 0;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    browser.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // A `Response` body resolves off the microtask queue, so each interaction is
  // followed by a real timeout tick before the assertions read the DOM.
  async function flush() {
    await act(async () => {
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 0);
      await promise;
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
  }

  async function mount(requester: Fetcher) {
    // A distinct key per mount: re-rendering the same element position would
    // update the previous instance and keep its state instead of remounting.
    mounts += 1;
    await act(async () => root.render(<AssetHygienePanel key={`hygiene-${mounts}`} locale={locale} memberId="admin-1" requester={requester} />));
    await flush();
  }

  function button(label: string): HTMLButtonElement {
    const element = [...document.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
    expect(element, label).toBeTruthy();
    return element as HTMLButtonElement;
  }

  async function click(label: string) {
    await act(async () => button(label).click());
    await flush();
  }

  async function typeInto(selector: string, value: string) {
    const element = document.querySelector(selector) as HTMLInputElement;
    expect(element, selector).toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(element, value);
      element.dispatchEvent(new browser.Event("input", { bubbles: true }));
    });
    await flush();
  }

  const dialog = () => document.querySelector('[role="alertdialog"]');

  function dialogButton(label: string): HTMLButtonElement {
    // The confirm control is the slide thumb, which carries only an icon; its
    // accessible name (the caller's confirm label) is the addressable surface.
    const element = [...(dialog()?.querySelectorAll("button") ?? [])].find((candidate) => candidate.getAttribute("aria-label") === label);
    expect(element, label).toBeTruthy();
    return element as HTMLButtonElement;
  }

  async function confirmDialog(label: string) {
    await act(async () => dialogButton(label).click());
    await flush();
  }

  function recordingRequester(handlers: { capacity?: () => Response; scan?: () => Response; reclaim?: (body: Record<string, unknown>) => Response }): { requester: Fetcher; calls: Call[] } {
    const calls: Call[] = [];
    const requester: Fetcher = async (input, init) => {
      const path = typeof input === "string" ? input : input.url;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : null;
      calls.push({ path, method, body });
      if (path.startsWith("/api/admin/assets/capacity")) return handlers.capacity ? handlers.capacity() : json(capacity);
      if (path.startsWith("/api/admin/assets/orphans/reclaim")) return handlers.reclaim ? handlers.reclaim(body!) : json({ deleted: [], skipped: [] });
      if (path.startsWith("/api/admin/assets/orphans")) return handlers.scan ? handlers.scan() : json(orphans);
      return error("NOT_FOUND", 404, false);
    };
    return { requester, calls };
  }

  async function scanAndSelectBoth() {
    await click("Scan for orphaned objects");
    const boxes = [...container.querySelectorAll('[data-orphan-row] input[type="checkbox"]')] as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    await act(async () => { boxes[0]!.click(); boxes[1]!.click(); });
    await flush();
  }

  it("shows the capacity and thresholds the server sent, and never estimates a missing one", async () => {
    const { requester } = recordingRequester({});
    await mount(requester);
    // Nothing is requested until the operator reads the report.
    expect(container.querySelector("[data-asset-capacity-used]")).toBeNull();
    await click("Read capacity and thresholds");
    expect(container.querySelector("[data-asset-capacity-used]")?.getAttribute("data-asset-capacity-used")).toBe(String(capacity.usedBytes));
    expect(container.querySelector("[data-asset-capacity-max]")?.getAttribute("data-asset-capacity-max")).toBe(String(capacity.maxBytes));
    expect(container.querySelector("[data-asset-capacity-threshold]")?.getAttribute("data-asset-capacity-threshold")).toBe(String(capacity.warningThresholdBytes));
    expect(container.querySelector("[data-asset-capacity-warning]")?.getAttribute("data-asset-capacity-warning")).toBe("under");

    const disabled = recordingRequester({ capacity: () => json({ storageEnabled: false, usedBytes: null, maxBytes: 9 * GIB, warningThresholdBytes: 8 * GIB, warning: false }) });
    await mount(disabled.requester);
    await click("Read capacity and thresholds");
    const used = container.querySelector("[data-asset-capacity-used]");
    expect(used?.getAttribute("data-asset-capacity-used")).toBe("unavailable");
    expect(used?.textContent).toContain("Unavailable");
    // The thresholds the server did send are still shown exactly; nothing is derived from them.
    expect(container.querySelector("[data-asset-capacity-threshold]")?.getAttribute("data-asset-capacity-threshold")).toBe(String(8 * GIB));

    const malformed = recordingRequester({ capacity: () => json({ storageEnabled: true, usedBytes: null, maxBytes: 9 * GIB, warningThresholdBytes: 8 * GIB, warning: false }) });
    await mount(malformed.requester);
    await click("Read capacity and thresholds");
    expect(container.querySelector("[data-asset-capacity-used]")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  });

  it("scans with the real prefix and limit, and states the selected impact from server sizes", async () => {
    const { requester, calls } = recordingRequester({});
    await mount(requester);
    expect(calls.filter((call) => call.path.includes("/orphans"))).toHaveLength(0);
    await scanAndSelectBoth();
    const scan = calls.find((call) => call.path.includes("/orphans?"));
    expect(scan?.path).toBe("/api/admin/assets/orphans?prefix=staging&limit=20");
    expect(container.querySelector("[data-orphan-selected-count]")?.getAttribute("data-orphan-selected-count")).toBe("2");
    expect(container.querySelector("[data-orphan-selected-bytes]")?.getAttribute("data-orphan-selected-bytes")).toBe(String(3 * 1024 * 1024));
    expect(container.querySelector("[data-orphan-summary]")?.getAttribute("data-orphan-summary")).toBe("4:2");
  });

  it("refuses to reclaim without the typed confirmation count", async () => {
    const { requester, calls } = recordingRequester({});
    await mount(requester);
    await scanAndSelectBoth();
    await click("Reclaim selected objects");
    expect(dialog()?.textContent).toContain("staging/");
    expect(dialog()?.textContent).toContain("3.00 MiB");
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    // A number that does not match the confirmed impact keeps the button disabled.
    await typeInto("[data-typed-confirm-input]", "1");
    expect(dialogButton("Reclaim selected objects").disabled).toBe(true);
    await confirmDialog("Reclaim selected objects");
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    expect(dialog()).not.toBeNull();

    await typeInto("[data-typed-confirm-input]", "2");
    expect(dialogButton("Reclaim selected objects").disabled).toBe(false);
    await confirmDialog("Reclaim selected objects");
    const reclaim = calls.find((call) => call.method === "POST");
    expect(reclaim?.path).toBe("/api/admin/assets/orphans/reclaim");
    expect(reclaim?.body?.confirmCount).toBe(2);
    expect(reclaim?.body?.keys).toEqual(["staging/a.bin", "staging/b.bin"]);
    expect(typeof reclaim?.body?.operationId).toBe("string");
  });

  it("reports each object's outcome and retries an unknown outcome as the same operation", async () => {
    let attempt = 0;
    const { requester, calls } = recordingRequester({
      reclaim: () => {
        attempt += 1;
        return attempt === 1
          ? error("ASSET_ORPHAN_STORAGE_UNAVAILABLE", 503, true)
          : json({ deleted: ["staging/a.bin"], skipped: ["staging/b.bin"] });
      },
    });
    await mount(requester);
    await scanAndSelectBoth();
    await click("Reclaim selected objects");
    await typeInto("[data-typed-confirm-input]", "2");
    await confirmDialog("Reclaim selected objects");

    const first = calls.find((call) => call.method === "POST")!;
    // The panel states the outcome is unknown and keeps the recorded operation.
    expect(container.textContent).toContain("outcome of this reclamation is unknown");
    expect(container.querySelector("[data-orphan-recovery]")?.textContent).toContain(first.body?.operationId as string);
    await click("Retry the same operation");

    const posts = calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(2);
    // The retry replays the recorded operation, so the number must not change.
    expect(posts[1]!.body?.operationId).toBe(first.body?.operationId);
    expect(container.querySelector("[data-orphan-results]")?.getAttribute("data-orphan-results")).toBe("1:1");
    expect(container.querySelector("[data-orphan-deleted]")?.getAttribute("data-orphan-deleted")).toBe("1");
    expect(container.querySelector("[data-orphan-skipped]")?.getAttribute("data-orphan-skipped")).toBe("1");
    expect(container.querySelector("[data-orphan-recovery]")).toBeNull();
  });
});
