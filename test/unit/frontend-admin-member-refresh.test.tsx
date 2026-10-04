// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMembersRoute } from "../../frontend/app";
import type { AdminMember, AdminMembersPage, LoadAdminMembersInput } from "../../frontend/lib/admin-members-data";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("member status refresh recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/members" }); installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  async function renderMember(load: (input: LoadAdminMembersInput) => Promise<AdminMembersPage>, update: (id: string, status: "active" | "disabled") => Promise<AdminMember>) {
    browser.history.replaceState({}, "", "/admin/members");
    await act(async () => root.render(<AdminMembersRoute locale={locale()} memberId="member-a" search="" load={load} update={update} />));
    await flush();
  }
  function enable() { return container.querySelector('button[aria-label="Enable m1@example.test"]') as HTMLButtonElement | null; }
  async function click(label: string) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement; expect(button).toBeTruthy(); await act(async () => button.click()); await flush(); }
  async function confirm() { const button = enable(); expect(button).toBeTruthy(); await act(async () => button!.click()); await flush(); await click("Confirm enable"); }
  function unloadBlocked() { const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; }
  async function leave() { await act(async () => writeWorkspaceHistory("push", "/home")); await flush(); }

  it("keeps an unknown member status after refresh and reconciles without resending", async () => {
    const loads: Array<ReturnType<typeof deferred<AdminMembersPage>>> = [];
    let patches = 0;
    const load = () => { const pending = deferred<AdminMembersPage>(); loads.push(pending); return pending.promise; };
    const update = async () => { patches += 1; throw new Error("unknown"); };
    await renderMember(load, update);
    loads[0]!.resolve(memberPage([member("m1", "disabled")])); await flush();
    await confirm();
    expect(patches).toBe(1);
    expect(browser.sessionStorage.getItem("memory-garden:admin-member-status:v1:member-a")).toContain("\"active\"");
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await renderMember(load, update);
    expect(patches).toBe(1); expect(unloadBlocked()).toBe(true); expect(enable()).toBeNull();
    loads[1]!.resolve(memberPage([member("m1", "disabled")])); await flush();
    expect(browser.sessionStorage.getItem("memory-garden:admin-member-status:v1:member-a")).toBeNull();
    expect(unloadBlocked()).toBe(false); expect(patches).toBe(1); expect(enable()?.disabled).toBe(false);
  });

  it("does not send a member status when the tab cannot record it", async () => {
    let patches = 0;
    const load = async () => memberPage([member("m1", "disabled")]);
    const update = async () => { patches += 1; return member("m1", "active"); };
    await renderMember(load, update);
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await confirm();
    expect(patches).toBe(0); expect(container.textContent).toContain("could not record");
  });

  it("blocks a member status when its record cannot be read and allows leave until it is discarded", async () => {
    let patches = 0;
    const load = async () => memberPage([member("m1", "disabled")]);
    const update = async () => { patches += 1; return member("m1", "active"); };
    browser.sessionStorage.setItem("memory-garden:admin-member-status:v1:member-a", "{");
    await renderMember(load, update);
    expect(container.textContent).toContain("can't be read"); expect(unloadBlocked()).toBe(false);
    expect(enable()?.disabled).toBe(true);
    await leave(); expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/members");
    await click("Discard record");
    await confirm();
    expect(patches).toBe(1);
  });
});

function member(id: string, status: "active" | "disabled"): AdminMember { return { id, email: `${id}@example.test`, role: "contributor", status }; }
function memberPage(items: AdminMember[]): AdminMembersPage { return { items, pagination: { page: 1, pageSize: 20, total: items.length, totalPages: items.length ? 1 : 0 } }; }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
