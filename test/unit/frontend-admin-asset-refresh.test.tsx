// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAssetsRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("asset retry refresh recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/assets" }); installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  async function render() { browser.history.replaceState({}, "", "/admin/assets"); await act(async () => root.render(<AdminAssetsRoute locale={locale()} memberId="member-a" search="" />)); await flush(); }
  function retryButton() { return container.querySelector('button[aria-label="Retry asset-1.pdf"]') as HTMLButtonElement | null; }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement; expect(button).toBeTruthy(); await act(async () => button.click()); await flush(); }
  async function retry() { const button = retryButton(); expect(button).toBeTruthy(); await act(async () => button!.click()); await flush(); await click("Confirm retry"); }
  function unloadBlocked() { const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; }
  async function leave() { await act(async () => writeWorkspaceHistory("push", "/home")); await flush(); }

  it("keeps an unknown asset retry after refresh and reconciles without resending", async () => {
    const second = deferred<Response>(); let gets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return new Response(null, { status: 503 }); }
      gets += 1;
      return gets === 1 ? page([asset()]) : second.promise;
    });
    await render(); await retry();
    expect(posts).toBe(1);
    expect(browser.sessionStorage.getItem("memory-garden:admin-asset-retry:v1:member-a")).toContain("\"asset-1\"");
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await render();
    expect(posts).toBe(1); expect(unloadBlocked()).toBe(true); expect(retryButton()).toBeNull();
    second.resolve(page([asset()])); await flush();
    expect(browser.sessionStorage.getItem("memory-garden:admin-asset-retry:v1:member-a")).toBeNull();
    expect(unloadBlocked()).toBe(false); expect(posts).toBe(1); expect(retryButton()?.disabled).toBe(false);
  });

  it("does not send an asset retry when the tab cannot record it", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return new Response(null, { status: 200 }); }
      return page([asset()]);
    });
    await render();
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await retry();
    expect(posts).toBe(0); expect(container.textContent).toContain("could not record");
  });

  it("blocks an asset retry when its record cannot be read and allows leave until it is discarded", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return new Response(null, { status: 200 }); }
      return page([asset()]);
    });
    browser.sessionStorage.setItem("memory-garden:admin-asset-retry:v1:member-a", "{");
    await render();
    expect(container.textContent).toContain("can't be read"); expect(unloadBlocked()).toBe(false);
    expect(retryButton()?.disabled).toBe(true);
    await leave(); expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/assets");
    await click("Discard record");
    await retry();
    expect(posts).toBe(1);
  });
});

function asset() { return { asset: { id: "asset-1", originalName: "asset-1.pdf" }, job: { status: "failed_retryable" } }; }
function page(items: unknown[]) { return new Response(JSON.stringify({ items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } }), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
