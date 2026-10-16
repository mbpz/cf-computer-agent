import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAssetsRoute, AdminAuditRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("admin queue applied filters", () => {
  let browser: InstanceType<typeof Window>;
  let container: HTMLElement;
  let root: Root;
  let urls: string[];

  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/assets" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement);
    vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    urls = [];
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("renders the asset status filter as a beUI select under its historical name", async () => {
    stubFetch(() => page([asset("asset-1", "queued")]));
    await renderAssets();
    const trigger = container.querySelector('button[aria-haspopup="listbox"]');
    expect(trigger).not.toBeNull();
    // The accessible name keeps the historical landmark; the native select is gone.
    expect(trigger!.querySelector(".sr-only")?.textContent).toBe("Asset status");
    expect(container.querySelector('select[aria-label="Asset status"]')).toBeNull();
    expect(container.textContent).toContain("Status");
  });

  it("writes the same status URL and lets one chip remove that filter", async () => {
    stubFetch(() => page([asset("asset-1", "queued")]));
    await renderAssets();
    await applyFilter("queued");
    expect(browser.location.search).toBe("?status=queued");
    expect(urls.at(-1)).toContain("status=queued");
    expect(container.querySelector("[data-applied-filters]")?.textContent).toContain("Status: queued");
    await clickElement('[aria-label="Clear all: Status: queued"]');
    await waitFor(() => browser.location.search === "");
    expect(urls.at(-1)).not.toContain("status=");
    expect(container.querySelector("[data-applied-filters]")).toBeNull();
  });

  it("resets every filter through the clear-all control", async () => {
    stubFetch(() => page([asset("asset-1", "failed_retryable")]));
    await renderAssets();
    await applyFilter("failed_retryable");
    expect(browser.location.search).toBe("?status=failed_retryable");
    await clickElement("[data-filters-clear]");
    await waitFor(() => browser.location.search === "");
    expect(urls.at(-1)).not.toContain("status=");
    expect(container.querySelector("[data-applied-filters]")).toBeNull();
  });

  it("renders the audit action filter under its historical name and writes the same URL", async () => {
    stubFetch(() => page([{ id: "e1", action: "member.login", actorKind: "system", createdAt: "2026-08-28" }]));
    browser.history.replaceState({}, "", "/admin/audit");
    await act(async () => root.render(<AdminAuditRoute locale={locale()} search="" />));
    // The filter is mounted during loading now, so wait for the loaded log as well.
    await waitFor(() => container.querySelector('button[aria-haspopup="listbox"]') !== null && container.querySelector("tbody tr[data-selected]") !== null);
    expect(container.querySelector('button[aria-haspopup="listbox"] .sr-only')?.textContent).toBe("Audit action");
    expect(container.querySelector('select[aria-label="Audit action"]')).toBeNull();
    await applyFilter("member.login");
    expect(browser.location.search).toBe("?action=member.login");
    expect(urls.at(-1)).toContain("action=member.login");
    expect(container.querySelector("[data-applied-filters]")?.textContent).toContain("Action: member.login");
    await clickElement('[aria-label="Clear all: Action: member.login"]');
    await waitFor(() => new URLSearchParams(browser.location.search).has("action") === false);
    expect(urls.at(-1)).not.toContain("action=");
  });

  it("keeps the loaded rows with local loading feedback while a filter refresh is in flight", async () => {
    const second = Promise.withResolvers<Response>();
    let gets = 0;
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => {
      urls.push(String(input));
      gets += 1;
      return gets === 1 ? Promise.resolve(page([asset("asset-1", "queued")])) : second.promise;
    });
    await renderAssets();
    expect(container.textContent).toContain("asset-1.pdf");
    await applyFilter("failed_retryable");
    // The previous window stays mounted behind local loading feedback instead of
    // falling back to the page-level empty/loading state.
    expect(container.textContent).toContain("asset-1.pdf");
    expect(container.querySelector('[data-page-state="loading"]')).toBeNull();
    expect(container.querySelector('[aria-haspopup="listbox"]:disabled')).not.toBeNull();
    second.resolve(page([]));
    await flush();
    await waitFor(() => !container.textContent?.includes("asset-1.pdf"));
  });

  async function renderAssets() {
    browser.history.replaceState({}, "", "/admin/assets");
    await act(async () => root.render(<AdminAssetsRoute locale={locale()} search="" />));
    // The header and its filter now render during loading too, so the loaded window — not
    // the trigger — is the marker of a settled read.
    await waitFor(() => container.querySelector('button[aria-haspopup="listbox"]') !== null && container.querySelector("tbody tr[data-selected]") !== null);
  }
  function stubFetch(handler: () => Response) {
    vi.stubGlobal("fetch", (input: RequestInfo | URL) => { urls.push(String(input)); return Promise.resolve(handler()); });
  }
  /** The filter is a beUI listbox; open the trigger and pick the option by its visible label. */
  async function applyFilter(value: string) {
    const trigger = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    await act(async () => trigger.click());
    const option = [...container.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((node) => node.textContent === value);
    expect(option, `option ${value}`).toBeTruthy();
    await act(async () => option!.click());
    await flush();
  }
  async function clickElement(selector: string) {
    const element = container.querySelector(selector) as HTMLButtonElement | null;
    expect(element, selector).toBeTruthy();
    await act(async () => element!.click());
    await flush();
  }
  async function waitFor(predicate: () => boolean) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (predicate()) return;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
    }
    expect(predicate(), "queue view did not reach the expected state").toBe(true);
  }
});

function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
function asset(id: string, status: string) { return { asset: { id, originalName: `${id}.pdf` }, job: { status } }; }
function page(items: unknown[]): Response { return new Response(JSON.stringify({ items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: 1 } }), { headers: { "content-type": "application/json" } }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
