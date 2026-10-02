// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { AdminMenusPage } from "../../frontend/pages/admin/menus-page";
import type { AdminMenu } from "../../frontend/lib/admin-menus-data";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ storage: { getItem: () => "en", setItem: () => {} } });
const menu: AdminMenu = { id: "custom", key: "custom", parentId: null, labelKey: "NAV_HOME", path: "/private-menu", icon: null, groupName: "workspace", position: 1, requiredBits: "0x0", status: "active", visible: true, isSystem: false, children: [] };
const menus = [menu];
describe("menu action confirmation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  let onUpdate: ReturnType<typeof vi.fn>; let onDelete: ReturnType<typeof vi.fn>; let onCreate: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/admin/menus" });
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    onUpdate = vi.fn(); onDelete = vi.fn(); onCreate = vi.fn();
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(props: Partial<React.ComponentProps<typeof AdminMenusPage>> = {}) { await act(async () => root.render(<AdminMenusPage state={{kind:"ready",menus}} locale={locale} onUpdate={onUpdate} onDelete={onDelete} onCreate={onCreate} {...props} />)); }
  function button(label: string) { const el = [...container.querySelectorAll("button")].find(el => el.textContent === label); expect(el, label).toBeTruthy(); return el as HTMLButtonElement; }
  async function click(label: string) { await act(async () => button(label).click()); }
  async function input(selector: string, value: string) { const el = container.querySelector(selector) as HTMLInputElement; expect(el).toBeTruthy(); await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,"value")!.set!.call(el,value); el.dispatchEvent(new browser.Event("input",{bubbles:true})); }); }
  const dialog = () => container.querySelector('[role="alertdialog"]');
  function unloadWarns() { const e = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(e); return e.defaultPrevented; }
  async function navigate() { await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); }
  async function decision(accept: boolean) { await act(async () => (dialog()!.querySelector(accept ? "[data-confirm-action]" : "[data-cancel-action]") as HTMLButtonElement).click()); }
  it.each(["create", "edit", "position"])("protects %s draft from navigation and unload", async mode => {
    await mount(); expect(unloadWarns()).toBe(false);
    if (mode !== "position") await click(mode === "create" ? "Create menu" : "Edit menu");
    const selector = mode === "position" ? 'input[type="number"]' : '[name="path"]';
    await input(selector, mode === "position" ? "7" : "/changed"); await navigate();
    expect(browser.location.pathname).toBe("/admin/menus"); expect(unloadWarns()).toBe(true);
    await decision(false); expect(unloadWarns()).toBe(true); await navigate(); await decision(true);
    expect(browser.location.pathname).toBe("/tasks"); expect(unloadWarns()).toBe(false);
    expect(onUpdate).not.toHaveBeenCalled(); expect(onCreate).not.toHaveBeenCalled(); expect(onDelete).not.toHaveBeenCalled();
  });
  it.each(["create", "edit", "position"])("preserves %s input after final admission denial", async mode => {
    await mount(); if (mode !== "position") await click(mode === "create" ? "Create menu" : "Edit menu");
    const selector = mode === "position" ? 'input[type="number"]' : '[name="path"]';
    const value = mode === "position" ? "7" : "/changed"; await input(selector, value);
    let denied = false; const stop = registerWorkspaceLeaveGuard(() => ({ kind: denied ? "block" : "allow" }));
    try { await navigate(); denied = true; await decision(true);
      expect(browser.location.pathname).toBe("/admin/menus"); expect((container.querySelector(selector) as HTMLInputElement).value).toBe(value); expect(unloadWarns()).toBe(true);
    } finally { stop(); }
  });
  it.each(["Delete", "Disable", "Hide"])("does not navigate out of an open %s confirmation", async label => {
    await mount(); await click(label); await navigate(); expect(browser.location.pathname).toBe("/admin/menus");
    expect(container.querySelectorAll('[role="alertdialog"]')).toHaveLength(1); await click("Cancel"); await navigate(); expect(browser.location.pathname).toBe("/tasks");
  });
  it("preserves an independent row position draft after authoritative list refresh", async () => {
    await mount(); await input('input[type="number"]', "7"); await mount({ state: { kind: "ready", menus: [{ ...menu }] } });
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("7"); expect(unloadWarns()).toBe(true);
  });
  it("blocks form submission and local cancel during a leave decision", async () => {
    await mount(); await click("Edit menu"); await input('[name="path"]', "/changed"); await navigate();
    await act(async () => { button("Save menu").click(); button("Cancel").click(); });
    expect(container.querySelectorAll('[role="alertdialog"]')).toHaveLength(1); expect(onUpdate).not.toHaveBeenCalled();
    await decision(false); expect((container.querySelector('[name="path"]') as HTMLInputElement).value).toBe("/changed");
  });
  it.each(["Save", "Disable", "Enable", "Hide", "Show", "Delete"])("requires one explicit confirmation for %s", async label => {
    const target = {...menu,status:label === "Enable" ? "disabled" as const : "active" as const, visible:label !== "Show"};
    await mount({state:{kind:"ready",menus:[target]}});
    if(label === "Save") await input('input[type="number"]',"7");
    await click(label);
    expect(onUpdate).not.toHaveBeenCalled(); expect(onDelete).not.toHaveBeenCalled();
    expect(dialog()?.textContent).toContain("/private-menu"); expect(dialog()?.textContent).toContain("custom");
    expect(browser.document.activeElement?.textContent).toBe("Cancel");
    const confirm = button("Confirm change"); await act(async () => {confirm.click();confirm.click();});
    if(label === "Delete") {expect(onDelete).toHaveBeenCalledExactlyOnceWith(target); expect(onUpdate).not.toHaveBeenCalled();}
    else {expect(onUpdate).toHaveBeenCalledTimes(1); expect(onUpdate.mock.calls[0][0]).toBe(target); expect(onUpdate.mock.calls[0][1]).toMatchObject(label === "Save" ? {position:7} : label === "Hide" || label === "Show" ? {visible:label === "Show"} : {status:label === "Enable" ? "active" : "disabled"}); expect(onUpdate.mock.calls[0][1].expected.path).toBe("/private-menu");}
  });
  it.each(["Save", "Disable", "Hide", "Delete"])("canceling %s preserves state and sends no write", async label => {
    await mount(); if(label === "Save") await input('input[type="number"]',"7"); await click(label); expect(dialog()).not.toBeNull(); await click("Cancel");
    expect(onUpdate).not.toHaveBeenCalled(); expect(onDelete).not.toHaveBeenCalled();
    if(label === "Save") expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("7");
  });
  it.each(["reread","pending","blocked","denied"])("invalidates an old confirmation on %s", async kind => {
    await mount(); await click("Delete"); const old = button("Confirm change");
    await mount(kind === "reread" ? {state:{kind:"ready",menus:[{...menu,path:"/new"}]}} : kind === "pending" ? {pendingId:"custom"} : kind === "blocked" ? {writeBlocked:true} : {state:{kind:"forbidden"}});
    expect(dialog()).toBeNull(); await act(async () => old.click()); await mount(); expect(dialog()).toBeNull(); expect(onDelete).not.toHaveBeenCalled();
  });
  it.each(["create","edit"])("requires confirmation to discard a dirty %s form", async mode => {
    await mount(); await click(mode === "create" ? "Create menu" : "Edit menu"); await input('[name="path"]',"/changed"); await click("Cancel");
    expect(dialog()).not.toBeNull(); expect(container.querySelector("form")).not.toBeNull();
    await act(async () => (dialog()!.querySelector('[data-cancel-action]') as HTMLButtonElement).click());
    expect((container.querySelector('[name="path"]') as HTMLInputElement).value).toBe("/changed");
    await click("Cancel"); await click("Discard changes"); expect(container.querySelector("form")).toBeNull(); expect(onUpdate).not.toHaveBeenCalled(); expect(onCreate).not.toHaveBeenCalled();
  });
  it("reviews changed menu fields before saving and preserves a canceled draft", async () => {
    await mount(); await click("Edit menu"); await input('[name="path"]',"/changed"); await click("Save menu");
    expect(onUpdate).not.toHaveBeenCalled(); expect(dialog()?.textContent).toContain("/private-menu"); expect(dialog()?.textContent).toContain("/changed");
    await act(async () => (dialog()!.querySelector('[data-cancel-action]') as HTMLButtonElement).click());
    expect((container.querySelector('[name="path"]') as HTMLInputElement).value).toBe("/changed");
    await click("Save menu"); const confirm=button("Confirm change"); await act(async()=>{confirm.click();confirm.click();});
    expect(onUpdate).toHaveBeenCalledTimes(1); expect(onUpdate.mock.calls[0][1]).toMatchObject({path:"/changed",expected:{path:"/private-menu"}});
  });
  it("invalidates form save confirmation after reread without rebasing its original snapshot", async () => {
    await mount(); await click("Edit menu"); await input('[name="path"]',"/changed"); await click("Save menu"); const old=button("Confirm change");
    await mount({state:{kind:"ready",menus:[{...menu,path:"/remote"}]}}); expect(dialog()).toBeNull(); await act(async()=>old.click()); expect(onUpdate).not.toHaveBeenCalled();
    expect((container.querySelector('[name="path"]') as HTMLInputElement).value).toBe("/changed");
    await click("Save menu"); await click("Confirm change"); expect(onUpdate.mock.calls[0][1].expected.path).toBe("/private-menu");
  });
  it.each(["create","edit"])("closes a pristine %s form without a discard prompt", async mode => {
    await mount(); await click(mode === "create" ? "Create menu" : "Edit menu"); await click("Cancel");
    expect(container.querySelector("form")).toBeNull(); expect(dialog()).toBeNull(); expect(onUpdate).not.toHaveBeenCalled(); expect(onCreate).not.toHaveBeenCalled();
  });
  it("does not restore an edit confirmation after the write lock clears", async () => {
    await mount(); await click("Edit menu"); await input('[name="path"]',"/changed"); await click("Save menu"); const stale=button("Confirm change");
    await mount({writeBlocked:true}); expect(dialog()).toBeNull(); await act(async()=>stale.click()); await mount();
    expect(dialog()).toBeNull(); expect(onUpdate).not.toHaveBeenCalled(); expect((container.querySelector('[name="path"]') as HTMLInputElement).value).toBe("/changed");
  });
  it("locks the edited form and cancel action until its write settles", async () => {
    let finish!: (value: boolean) => void; onUpdate.mockReturnValue(new Promise<boolean>(resolve=>{finish=resolve;}));
    await mount(); await click("Edit menu"); await input('[name="path"]',"/changed"); await click("Save menu"); await click("Confirm change");
    expect((container.querySelector("fieldset") as HTMLFieldSetElement).disabled).toBe(true); expect(button("Cancel").disabled).toBe(true); expect(button("Save menu").disabled).toBe(true);
    await act(async()=>finish(false)); expect(button("Cancel").disabled).toBe(false); expect((container.querySelector('[name="path"]') as HTMLInputElement).value).toBe("/changed");
  });
  it("clears a private dirty form and its confirmation after permission denial", async () => {
    await mount(); await click("Edit menu"); await input('[name="path"]',"/private-draft"); await click("Save menu"); const stale=button("Confirm change");
    await mount({state:{kind:"forbidden"}}); expect(container.querySelector("form")).toBeNull(); expect(dialog()).toBeNull(); await act(async()=>stale.click()); await mount(); expect(onUpdate).not.toHaveBeenCalled();
    await click("Edit menu"); expect((container.querySelector('[name="path"]') as HTMLInputElement).value).toBe("/private-menu");
  });

});
