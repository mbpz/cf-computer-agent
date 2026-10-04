// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSpacesRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("space write refresh recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/spaces" }); installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  async function render() { await act(async () => root.render(<AdminSpacesRoute locale={locale()} memberId="member-a" />)); await flush(); }
  function button(label: string) { return [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement | undefined; }
  async function click(label: string) { const target = button(label); expect(target).toBeTruthy(); await act(async () => target!.click()); await flush(); }
  async function input(id: string, value: string) { const el = container.querySelector(`#${id}`) as HTMLInputElement; await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new browser.Event("input", { bubbles: true })); }); }
  async function createSpace() { await click("Create space"); await input("admin-space-name", "New space"); await input("admin-space-slug", "new-space"); await act(async () => { container.querySelector("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); }); await flush(); if (button("Confirm changes")) await click("Confirm changes"); }
  function unloadBlocked() { const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; }
  async function leave() { await act(async () => writeWorkspaceHistory("push", "/home")); await flush(); }

  it("keeps an unknown space create after refresh and reconciles without resending", async () => {
    const second = deferred<Response>(); let spaceGets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return new Response(null, { status: 503 }); }
      if (String(url).includes("/collections")) return json({ items: [] });
      spaceGets += 1;
      return spaceGets === 1 ? json({ items: [space()] }) : second.promise;
    });
    await render(); await createSpace();
    expect(posts).toBe(1);
    expect(browser.sessionStorage.getItem("memory-garden:admin-space-write:v1:member-a")).toContain("\"new-space\"");
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await render();
    expect(posts).toBe(1); expect(unloadBlocked()).toBe(true); expect(button("Create space")).toBeUndefined();
    second.resolve(json({ items: [space()] })); await flush();
    expect(browser.sessionStorage.getItem("memory-garden:admin-space-write:v1:member-a")).toBeNull();
    expect(unloadBlocked()).toBe(false); expect(posts).toBe(1); expect(button("Create space")?.disabled).toBe(false);
  });

  it("does not send a space create when the tab cannot record it", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return json({ space: space({ name: "New space", slug: "new-space" }) }); }
      return String(url).includes("/collections") ? json({ items: [] }) : json({ items: [space()] });
    });
    await render();
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await createSpace();
    expect(posts).toBe(0); expect(container.textContent).toContain("could not record");
  });

  it("blocks a space change when its record cannot be read and allows leave until it is discarded", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return json({ space: space({ name: "New space", slug: "new-space" }) }); }
      return String(url).includes("/collections") ? json({ items: [] }) : json({ items: [space()] });
    });
    browser.sessionStorage.setItem("memory-garden:admin-space-write:v1:member-a", "{");
    await render();
    expect(container.textContent).toContain("can't be read"); expect(unloadBlocked()).toBe(false);
    expect(button("Create space")?.disabled).toBe(true);
    await leave(); expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/spaces");
    await click("Discard record");
    await createSpace();
    expect(posts).toBe(1);
  });
});

function space(overrides: Record<string, unknown> = {}) { return { id: "space-1", name: "Private space", slug: "private-space", description: "", kind: "shared", status: "active", position: 0, readOnly: false, createdAt: "2026-09-28T00:00:00.000Z", updatedAt: "2026-09-28T00:00:00.000Z", ...overrides }; }
function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
