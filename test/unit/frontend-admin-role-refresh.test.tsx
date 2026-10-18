// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminRoleDetailRoute, AdminRoleNewRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("role write refresh recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/roles" }); installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  async function renderDetail() { await act(async () => root.render(<AdminRoleDetailRoute locale={locale()} memberId="member-a" roleId="role-editor" />)); await flush(); }
  async function renderCreate() { await act(async () => root.render(<AdminRoleNewRoute locale={locale()} memberId="member-a" />)); await flush(); }
  function button(label: string) { return [...document.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement | undefined; }
  async function click(label: string) { const target = button(label); expect(target).toBeTruthy(); await act(async () => target!.click()); await flush(); }
  async function save() { await click("Save permissions"); await click("Confirm change"); }
  function unloadBlocked() { const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; }
  async function leave() { await act(async () => writeWorkspaceHistory("push", "/home")); await flush(); }

  it("keeps an unknown role save after refresh and reconciles without resending", async () => {
    const second = Promise.withResolvers<Response>(); let gets = 0; let patches = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return new Response(null, { status: 503 }); }
      gets += 1;
      return gets === 1 ? json({ items: [role()] }) : second.promise;
    });
    await renderDetail(); await save();
    expect(patches).toBe(1);
    expect(browser.sessionStorage.getItem("memory-garden:admin-role-write:v1:member-a")).toContain("\"role-editor\"");
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await renderDetail();
    expect(patches).toBe(1); expect(unloadBlocked()).toBe(true); expect(button("Save permissions")).toBeUndefined();
    second.resolve(json({ items: [role()] })); await flush();
    expect(browser.sessionStorage.getItem("memory-garden:admin-role-write:v1:member-a")).toBeNull();
    expect(unloadBlocked()).toBe(false); expect(patches).toBe(1); expect(button("Save permissions")?.disabled).toBe(false);
  });

  it("does not send a role save when the tab cannot record it", async () => {
    let patches = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return json({ role: role() }); }
      return json({ items: [role()] });
    });
    await renderDetail();
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await save();
    expect(patches).toBe(0); expect(container.textContent).toContain("could not record");
  });

  it("blocks a role change when its record cannot be read and allows leave until it is discarded", async () => {
    let patches = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return json({ role: role() }); }
      return json({ items: [role()] });
    });
    browser.sessionStorage.setItem("memory-garden:admin-role-write:v1:member-a", "{");
    await renderDetail();
    expect(container.textContent).toContain("can't be read"); expect(unloadBlocked()).toBe(false);
    expect(button("Save permissions")?.disabled).toBe(true);
    await leave(); expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/roles");
    await click("Discard record");
    await save();
    expect(patches).toBe(1);
  });

  const draftKey = "memory-garden:admin-role-draft:v1:member-a";
  const tasks = () => container.querySelector('[role="checkbox"][aria-label="Use workspace tasks"]') as HTMLButtonElement;
  const named = (label: string) => container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
  async function type(label: string, value: string) {
    const el = named(label);
    await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new browser.Event("input", { bubbles: true })); });
    await flush();
  }
  async function remount() {
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client");
    root = createRoot(container);
    await flush();
  }

  it("keeps an unsent permission draft after refresh without saving", async () => {
    let patches = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return json({ role: role() }); }
      return json({ items: [role()] });
    });
    await renderDetail();
    await act(async () => tasks().click()); await flush();
    await type("Assigned members", "member-new");
    expect(browser.sessionStorage.getItem(draftKey)).toContain("member-new");
    expect(unloadBlocked()).toBe(true); expect(patches).toBe(0);
    await remount(); await renderDetail();
    expect(tasks().getAttribute("aria-checked")).toBe("true");
    expect(named("Assigned members").value).toBe("member-new");
    expect(patches).toBe(0); expect(unloadBlocked()).toBe(true);
  });

  it("keeps an unsent creation draft after refresh without saving", async () => {
    let patches = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") { patches += 1; return json({ role: role() }); }
      return json({ items: [role()] });
    });
    await renderCreate();
    await type("Role key", "custom"); await type("Role name", "Custom role");
    expect(browser.sessionStorage.getItem(draftKey)).toContain("custom");
    expect(unloadBlocked()).toBe(true); expect(patches).toBe(0);
    await remount(); await renderCreate();
    expect(named("Role key").value).toBe("custom");
    expect(named("Role name").value).toBe("Custom role");
    expect(patches).toBe(0); expect(unloadBlocked()).toBe(true);
  });

  it("keeps the role draft on screen when the tab cannot record it", async () => {
    vi.stubGlobal("fetch", async () => json({ items: [role()] }));
    await renderDetail();
    const storage = browser.sessionStorage;
    const original = storage.setItem;
    Object.defineProperty(storage, "setItem", { configurable: true, writable: true, value(key: string, value: string) { if (String(key).includes("admin-role-draft")) throw new Error("full"); return original.call(storage, key, value); } });
    await act(async () => tasks().click()); await flush();
    expect(tasks().getAttribute("aria-checked")).toBe("true");
    expect(container.textContent).toContain("could not record");
  });

  it("allows leave when the creation draft cannot be read and records only after discard", async () => {
    vi.stubGlobal("fetch", async () => json({ items: [role()] }));
    browser.sessionStorage.setItem(draftKey, "{");
    await renderCreate();
    expect(container.textContent).toContain("can't be read"); expect(unloadBlocked()).toBe(false);
    await leave(); expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/roles");
    await act(async () => writeWorkspaceHistory("push", "/admin/roles/new")); await flush();
    await click("Discard record");
    await type("Role key", "after");
    expect(browser.sessionStorage.getItem(draftKey)).toContain("after");
  });

  it("drops the stored creation draft after a confirmed leave", async () => {
    vi.stubGlobal("fetch", async () => json({ items: [role()] }));
    await renderCreate();
    await type("Role name", "Keep this role");
    expect(browser.sessionStorage.getItem(draftKey)).toContain("Keep this role");
    await act(async () => expect(writeWorkspaceHistory("push", "/home")).toBe("deferred"));
    await click("Discard changes");
    expect(browser.sessionStorage.getItem(draftKey)).toBeNull();
    expect(named("Role name").value).toBe(""); expect(unloadBlocked()).toBe(false);
  });
});

function role() { return { id: "role-editor", key: "editor", name: "Editor", description: "Private role", allowBits: "0x1", memberCount: 1, assignedMemberIds: ["member-secret"], status: "active", isSystem: false }; }
function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
