// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DuplicateQueuePage } from "../../frontend/pages/admin/duplicate-queue-page";
import type { AdminDuplicatePageResult } from "../../frontend/lib/admin-duplicates-data";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ storage: { getItem: () => "en", setItem: () => {} } });
const item = {submissionId:"dup-1", submissionTitle:"New entry", canonicalSubmissionId:"canonical-1",canonicalTitle:"Existing entry",canonicalSourceId:"source-1",canonicalSourceVersionId:"version-1",decision:"pending" as const};
const data: AdminDuplicatePageResult = {items:[item],pagination:{page:1,pageSize:20,total:1,totalPages:1}};
describe("duplicate decision confirmation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let onDecision: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    browser = new Window({url:"https://app.test/admin/duplicates"});
    for (const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) vi.stubGlobal(key,value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const {createRoot} = await import("react-dom/client"); root = createRoot(container); onDecision = vi.fn();
  });
  afterEach(async () => {await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals();});
  async function mount(props: Partial<React.ComponentProps<typeof DuplicateQueuePage>> = {}) {await act(async () => root.render(<DuplicateQueuePage state={{kind:"ready",data}} locale={locale} onDecision={onDecision} {...props}/>));}
  function button(label:string) {const el = [...container.querySelectorAll("button")].find(el => el.textContent === label); expect(el,label).toBeTruthy(); return el as HTMLButtonElement;}
  async function click(label:string) {await act(async () => button(label).click());}
  const dialog = () => container.querySelector('[role="alertdialog"]');
  it.each([["Associate","associate"],["Keep separate","keep_separate"],["Reject","reject"]] as const)("confirms %s with exact target and one write",async (label,decision) => {
    await mount(); await click(label); expect(onDecision).not.toHaveBeenCalled();
    for (const value of [item.submissionTitle,item.submissionId,item.canonicalTitle,item.canonicalSubmissionId,item.canonicalSourceId,item.canonicalSourceVersionId,label]) expect(dialog()?.textContent).toContain(value);
    expect(dialog()?.textContent).toContain("does not merge, delete, or publish");
    expect(browser.document.activeElement?.textContent).toBe("Cancel"); expect(container.querySelector("section")?.hasAttribute("inert")).toBe(true);
    const confirm = button("Confirm decision"); await act(async () => {confirm.click();confirm.click();});
    expect(onDecision).toHaveBeenCalledExactlyOnceWith(item.submissionId,decision);
  });
  it.each(["Associate","Keep separate","Reject"])("canceling %s sends no decision",async label => {await mount();await click(label);await click("Cancel");expect(onDecision).not.toHaveBeenCalled();expect(dialog()).toBeNull();});
  it("does not replace a captured decision through another row action",async () => {await mount(); await act(async () => {button("Associate").click();button("Reject").click();});await click("Confirm decision");expect(onDecision).toHaveBeenCalledExactlyOnceWith(item.submissionId,"associate");});
  it.each(["read","pending","write","locked","forbidden","loading"])("invalidates confirmation on %s",async change => {
    await mount();await click("Reject");const old = button("Confirm decision");
    await mount(change === "read" ? {state:{kind:"ready",data:{...data,items:[{...item,canonicalTitle:"Replacement"}]}}} : change === "pending" ? {pending:true} : change === "write" ? {pendingId:"other"} : change === "locked" ? {lockedIds:[item.submissionId]} : change === "forbidden" ? {state:{kind:"forbidden",message:"Denied"}} : {state:{kind:"loading"}});
    expect(dialog()).toBeNull();await act(async () => old.click());expect(onDecision).not.toHaveBeenCalled();
    await mount();expect(dialog()).toBeNull();
  });
  it("does not replay a detached confirmation after unmount",async () => {await mount();await click("Reject");const old = button("Confirm decision");await act(async () => root.render(<div/>));await act(async () => old.click());expect(onDecision).not.toHaveBeenCalled();});
});
