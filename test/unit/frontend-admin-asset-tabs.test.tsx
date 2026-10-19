// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { AssetQueuePage } from "../../frontend/pages/admin/asset-queue-page";
import type { AdminAssetsPage } from "../../frontend/lib/admin-assets-data";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const EMPTY_ASSETS: AdminAssetsPage = { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };

describe("asset queue tabs", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/assets" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  async function render() {
    await act(async () => root.render(<AssetQueuePage locale={locale} memberId="admin-1" data={EMPTY_ASSETS} status="" />));
    await act(async () => { const { promise, resolve } = Promise.withResolvers<void>(); setTimeout(resolve, 0); await promise; for (let index = 0; index < 10; index += 1) await Promise.resolve(); });
  }
  function tab(value: "queue" | "hygiene"): HTMLButtonElement {
    const element = container.querySelector(`[role="tab"][data-tab-value="${value}"]`);
    expect(element, value).toBeTruthy();
    return element as HTMLButtonElement;
  }
  function activePanel(): Element | null {
    return container.querySelector('[role="tabpanel"][data-state="active"]');
  }

  it("splits the page into asset-queue and storage-hygiene tabs", async () => {
    await render();
    // The page header uses the menu name while the tabs name the two surfaces.
    expect(container.querySelector("h1")?.textContent).toBe("Asset queue");
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(tab("queue").textContent).toContain("Asset queue");
    expect(tab("hygiene").textContent).toContain("Asset storage hygiene");
    expect(activePanel()?.textContent).toContain("No assets");
    expect(container.querySelector('header [aria-haspopup="listbox"]')).not.toBeNull();

    await act(async () => tab("hygiene").click());
    expect(tab("hygiene").getAttribute("aria-selected")).toBe("true");
    expect(activePanel()?.querySelector("[data-asset-hygiene]")).not.toBeNull();
    expect(activePanel()?.textContent).toContain("Asset storage hygiene");
    // Full-height panels: the tabpanel and the hygiene card both stretch.
    expect(activePanel()?.className).toContain("flex-1");
    expect(container.querySelector("[data-asset-hygiene]")?.className).toContain("h-full");
    // The queue-only status filter is not offered on the hygiene tab.
    expect(container.querySelector('header [aria-haspopup="listbox"]')).toBeNull();

    await act(async () => tab("queue").click());
    expect(activePanel()?.textContent).toContain("No assets");
    expect(container.querySelector('header [aria-haspopup="listbox"]')).not.toBeNull();
  });
});
