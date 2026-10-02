// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
import { ReviewDetailPage } from "../../frontend/pages/admin/review-detail-page";
import { ReviewQueuePage } from "../../frontend/pages/admin/review-queue-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");


const locale = createLocaleRuntime({ storage: { getItem: () => "en", setItem: () => {} } });
const detail = {id:"sub-1",title:"Source guide",submitter:"author-1",status:"review_pending",content:"Private source",warnings:[]};
describe("review decision confirmation and draft protection", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let onDecision: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    browser = new Window({url:"https://app.test/admin/submissions/sub-1"});
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    for (const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) vi.stubGlobal(key,value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const {createRoot} = await import("react-dom/client"); root = createRoot(container); onDecision = vi.fn();
  });
  afterEach(async () => {await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals();});
  async function mount(props: Partial<React.ComponentProps<typeof ReviewDetailPage>> = {}) {await act(async () => root.render(<ReviewDetailPage state={{kind:"ready",detail}} locale={locale} onDecision={onDecision} {...props}/>));}
  function button(label:string) {const el = [...container.querySelectorAll("button")].find(el => el.textContent === label); expect(el,label).toBeTruthy(); return el as HTMLButtonElement;}
  async function click(label:string) {await act(async () => button(label).click());}
  const dialog = () => container.querySelector('[role="alertdialog"]');
  const note = () => container.querySelector("textarea[data-review-note]") as HTMLTextAreaElement;
  async function typeNote(value:string) {await act(async () => {Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype,"value")!.set!.call(note(),value);note().dispatchEvent(new browser.Event("input",{bubbles:true}));note().dispatchEvent(new browser.Event("change",{bubbles:true}));});}
  async function confirm() {const el=dialog()?.querySelector("[data-confirm-action]") as HTMLButtonElement;expect(el).toBeTruthy();await act(async () => {el.focus();el.click();el.click();});}
  async function cancel() {const el=dialog()?.querySelector("[data-cancel-action]") as HTMLButtonElement;expect(el).toBeTruthy();await act(async () => el.click());}
  it.each(["Publish", "Reject"])("protects %s confirmations from same-batch navigation and unload", async action => {
    await mount(); if (action === "Reject") await click("Reject");
    await act(async () => {button(action === "Publish" ? "Publish" : "Confirm rejection").click(); writeWorkspaceHistory("push", "/home");});
    expect(browser.location.pathname).toBe("/admin/submissions/sub-1"); expect(unload()).toBe(true);
    await cancel(); expect(unload()).toBe(false);
    await act(async () => writeWorkspaceHistory("push", "/home")); expect(browser.location.pathname).toBe("/home"); expect(onDecision).not.toHaveBeenCalled();
  });
  it.each(["Reject", "Request changes"])("keeps %s draft on canceled leave and discards only on committed navigation", async action => {
    await mount(); await click(action); await typeNote("Keep my note");
    expect(unload()).toBe(true);
    await act(async () => writeWorkspaceHistory("push", "/home")); expect(dialog()?.textContent).toContain("Discard");
    expect(browser.location.pathname).toBe("/admin/submissions/sub-1"); await cancel(); expect(note().value).toBe("Keep my note");
    await act(async () => writeWorkspaceHistory("push", "/home")); await confirm();
    expect(browser.location.pathname).toBe("/home"); expect(unload()).toBe(false); expect(onDecision).not.toHaveBeenCalled();
  });
  it("retains a same-target note through a read replacement without reviving a confirmation", async () => {
    await mount(); await click("Reject"); await typeNote("Retained note"); await click("Confirm rejection");
    const old = dialog()?.querySelector("[data-confirm-action]") as HTMLButtonElement;
    await mount({state:{kind:"ready",detail:{...detail,content:"Fresh read"}}});
    expect(dialog()).toBeNull(); expect(note().value).toBe("Retained note"); expect(unload()).toBe(true);
    await act(async () => old.click()); expect(onDecision).not.toHaveBeenCalled();
  });
  it("cleans accepted notes on a terminal result", async () => {
    await mount(); await click("Reject"); await typeNote("Accepted note");
    await mount({state:{kind:"ready",detail:{...detail,status:"rejected"}}}); expect(unload()).toBe(false);
  });
  it("cannot discard a note whose submitted outcome is unknown", async () => {
    await mount(); await click("Reject"); await typeNote("Unknown note");
    await mount({decisionState:{kind:"error",action:"reject",recovery:"retry"}});
    await act(async () => writeWorkspaceHistory("push", "/home")); expect(dialog()).toBeNull();
    expect(browser.location.pathname).toBe("/admin/submissions/sub-1"); expect(unload()).toBe(true);
  });
  function unload() {const event = new browser.Event("beforeunload", {cancelable:true}); browser.dispatchEvent(event); return event.defaultPrevented;}
});
