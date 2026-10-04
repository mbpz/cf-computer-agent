// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMenusRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("menu write refresh recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/menus" }); installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  async function render() { await act(async () => root.render(<AdminMenusRoute locale={locale()} memberId="member-a" />)); await flush(); }
  function button(label: string) { return [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement | undefined; }
  async function click(label: string) { const target = button(label); expect(target).toBeTruthy(); await act(async () => target!.click()); await flush(); }
  async function disable() { await click("Disable"); await click("Confirm change"); }
  function unloadBlocked() { const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; }
  async function leave() { await act(async () => writeWorkspaceHistory("push", "/home")); await flush(); }

  it("keeps an unknown menu change after refresh and reconciles without resending", async () => {
    const second = deferred<Response>(); let gets = 0; let patches = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return new Response(null, { status: 503 }); }
      gets += 1;
      return gets === 1 ? json({ tree: [menu()] }) : second.promise;
    });
    await render(); await disable();
    expect(patches).toBe(1);
    expect(browser.sessionStorage.getItem("memory-garden:admin-menu-write:v1:member-a")).toContain("\"custom\"");
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await render();
    expect(patches).toBe(1); expect(unloadBlocked()).toBe(true); expect(button("Disable")).toBeUndefined();
    second.resolve(json({ tree: [menu()] })); await flush();
    expect(browser.sessionStorage.getItem("memory-garden:admin-menu-write:v1:member-a")).toBeNull();
    expect(unloadBlocked()).toBe(false); expect(patches).toBe(1); expect(button("Disable")?.disabled).toBe(false);
  });

  it("does not send a menu change when the tab cannot record it", async () => {
    let patches = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return json({ menu: menu({ status: "disabled" }) }); }
      return json({ tree: [menu()] });
    });
    await render();
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await disable();
    expect(patches).toBe(0); expect(container.textContent).toContain("could not record");
  });

  it("blocks a menu change when its record cannot be read and allows leave until it is discarded", async () => {
    let patches = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return json({ menu: menu({ status: "disabled" }) }); }
      return json({ tree: [menu()] });
    });
    browser.sessionStorage.setItem("memory-garden:admin-menu-write:v1:member-a", "{");
    await render();
    expect(container.textContent).toContain("can't be read"); expect(unloadBlocked()).toBe(false);
    expect(button("Disable")?.disabled).toBe(true);
    await leave(); expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/menus");
    await click("Discard record");
    await disable();
    expect(patches).toBe(1);
  });

  const draftKey = "memory-garden:admin-menu-draft:v1:member-a";
  const path = () => container.querySelector('[name="path"]') as HTMLInputElement;
  async function typePath(value: string) {
    const el = path();
    await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new browser.Event("input", { bubbles: true })); });
    await flush();
  }
  async function remount() {
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
    await render();
  }
  it("keeps an unsent menu edit after refresh without saving", async () => {
    let patches = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return json({ menu: menu() }); }
      return json({ tree: [menu()] });
    });
    await render(); await click("Edit menu"); await typePath("/keep-this");
    expect(browser.sessionStorage.getItem(draftKey)).toContain("/keep-this");
    expect(unloadBlocked()).toBe(true); expect(patches).toBe(0);
    await remount();
    expect(path().value).toBe("/keep-this");
    expect(patches).toBe(0); expect(unloadBlocked()).toBe(true);
  });
  it("keeps the menu draft on screen when the tab cannot record it", async () => {
    vi.stubGlobal("fetch", async () => json({ tree: [menu()] }));
    await render(); await click("Edit menu");
    const storage = browser.sessionStorage;
    const original = storage.setItem;
    Object.defineProperty(storage, "setItem", { configurable: true, writable: true, value(key: string, value: string) { if (String(key).includes("admin-menu-draft")) throw new Error("full"); return original.call(storage, key, value); } });
    await typePath("/unrecorded");
    expect(path().value).toBe("/unrecorded");
    expect(container.textContent).toContain("could not record");
  });
  it("allows leave when the menu draft cannot be read and records only after discard", async () => {
    vi.stubGlobal("fetch", async () => json({ tree: [menu()] }));
    browser.sessionStorage.setItem(draftKey, "{");
    await render();
    expect(container.textContent).toContain("can't be read"); expect(unloadBlocked()).toBe(false);
    await leave(); expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/menus");
    await act(async () => writeWorkspaceHistory("push", "/admin/menus")); await flush();
    await click("Discard record");
    await click("Edit menu"); await typePath("/after-discard");
    expect(browser.sessionStorage.getItem(draftKey)).toContain("/after-discard");
  });
  it("drops the stored menu draft after a confirmed leave", async () => {
    vi.stubGlobal("fetch", async () => json({ tree: [menu()] }));
    await render(); await click("Edit menu"); await typePath("/keep-this");
    expect(browser.sessionStorage.getItem(draftKey)).toContain("/keep-this");
    await act(async () => expect(writeWorkspaceHistory("push", "/home")).toBe("deferred"));
    await click("Discard changes");
    expect(browser.sessionStorage.getItem(draftKey)).toBeNull();
    expect(path().value).toBe("/private-menu");
    expect(unloadBlocked()).toBe(false);
  });

  const positionKey = "memory-garden:admin-menu-position:v1:member-a";
  const position = () => container.querySelector('input[type="number"]') as HTMLInputElement;
  async function typePosition(value: string) {
    const el = position();
    await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new browser.Event("input", { bubbles: true })); });
    await flush();
  }
  it("keeps an unsent menu position after refresh without saving", async () => {
    let patches = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return json({ menu: menu() }); }
      return json({ tree: [menu()] });
    });
    await render(); await typePosition("9");
    expect(browser.sessionStorage.getItem(positionKey)).toContain("\"9\"");
    expect(unloadBlocked()).toBe(true); expect(patches).toBe(0);
    await remount();
    expect(position().value).toBe("9");
    expect(patches).toBe(0); expect(unloadBlocked()).toBe(true);
  });
  it("keeps the menu position on screen when the tab cannot record it", async () => {
    vi.stubGlobal("fetch", async () => json({ tree: [menu()] }));
    await render();
    const storage = browser.sessionStorage;
    const original = storage.setItem;
    Object.defineProperty(storage, "setItem", { configurable: true, writable: true, value(key: string, value: string) { if (String(key).includes("admin-menu-position")) throw new Error("full"); return original.call(storage, key, value); } });
    await typePosition("9");
    expect(position().value).toBe("9");
    expect(container.textContent).toContain("could not record");
  });
  it("allows leave when the menu position cannot be read and records only after discard", async () => {
    vi.stubGlobal("fetch", async () => json({ tree: [menu()] }));
    browser.sessionStorage.setItem(positionKey, "{");
    await render();
    expect(container.textContent).toContain("can't be read"); expect(unloadBlocked()).toBe(false);
    await leave(); expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/menus");
    await act(async () => writeWorkspaceHistory("push", "/admin/menus")); await flush();
    await click("Discard record");
    await typePosition("8");
    expect(browser.sessionStorage.getItem(positionKey)).toContain("\"8\"");
  });
  it("drops the stored menu position after a confirmed leave", async () => {
    vi.stubGlobal("fetch", async () => json({ tree: [menu()] }));
    await render(); await typePosition("9");
    expect(browser.sessionStorage.getItem(positionKey)).toContain("\"9\"");
    await act(async () => expect(writeWorkspaceHistory("push", "/home")).toBe("deferred"));
    await click("Discard changes");
    expect(browser.sessionStorage.getItem(positionKey)).toBeNull();
    expect(position().value).toBe("1"); expect(unloadBlocked()).toBe(false);
  });
});

function menu(overrides: Record<string, unknown> = {}) { return { id: "custom", parentId: null, key: "custom", labelKey: "NAV_HOME", path: "/private-menu", icon: null, groupName: "workspace", position: 1, requiredBits: "0x0", status: "active", visible: true, isSystem: false, children: [], ...overrides }; }
function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
