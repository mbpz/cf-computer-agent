// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetQueuePage } from "../../frontend/pages/admin/asset-queue-page";
import type { AdminAssetsPage } from "../../frontend/lib/admin-assets-data";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");


const locale = createLocaleRuntime({ storage: { getItem: () => "en", setItem: () => {} } });
const item = {id:"asset-1",name:"report.pdf",status:"failed_retryable",warnings:[]};
const data: AdminAssetsPage = {items:[item],pagination:{page:1,pageSize:20,total:1,totalPages:1}};
describe("asset retry confirmation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let onRetry: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    browser = new Window({url:"https://app.test/admin/assets"});
    for (const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) vi.stubGlobal(key,value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const {createRoot} = await import("react-dom/client"); root = createRoot(container); onRetry = vi.fn();
  });
  afterEach(async () => {await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals();});
  async function mount(props: Partial<React.ComponentProps<typeof AssetQueuePage>> = {}) {await act(async () => root.render(<AssetQueuePage data={data} locale={locale} onRetry={onRetry} {...props}/>));}
  function button(label:string) {const el = [...container.querySelectorAll("button")].find(el => el.textContent === label); expect(el,label).toBeTruthy(); return el as HTMLButtonElement;}
  async function click(label:string) {await act(async () => button(label).click());}
  const dialog = () => container.querySelector('[role="alertdialog"]');
  it("shows exact target and requeue impact before a single explicit write",async () => {
    await mount(); await click("Retry"); expect(onRetry).not.toHaveBeenCalled();
    for (const value of ["report.pdf","asset-1","queued","attempt count","does not mean parsing succeeded"]) expect(dialog()?.textContent).toContain(value);
    expect(browser.document.activeElement?.textContent).toBe("Cancel"); expect(container.querySelector("section")?.hasAttribute("inert")).toBe(true);
    const confirm = button("Confirm retry"); await act(async () => {confirm.click();confirm.click();});
    expect(onRetry).toHaveBeenCalledExactlyOnceWith("asset-1"); expect(dialog()).toBeNull();
  });
  it("cancel keeps the row and sends no write",async () => {await mount();await click("Retry");await click("Cancel");expect(onRetry).not.toHaveBeenCalled();expect(dialog()).toBeNull();expect(container.textContent).toContain("report.pdf");});
  it("does not replace a captured target through another row",async () => {
    await mount({data:{...data,items:[item,{...item,id:"asset-2",name:"other.pdf"}]}});
    const buttons = [...container.querySelectorAll('button[aria-label^="Retry "]')] as HTMLButtonElement[];
    await act(async () => {buttons[0]!.click();buttons[1]!.click();});await click("Confirm retry");expect(onRetry).toHaveBeenCalledExactlyOnceWith("asset-1");
  });
  it.each(["read","pending","locked","forbidden","loading","error","filter","handler"])("invalidates old confirmation on %s",async change => {
    await mount();await click("Retry"); const old=button("Confirm retry");
    await mount(change === "read" ? {data:{...data,items:[{...item,name:"Replacement.pdf"}]}} : change === "pending" ? {pending:true} : change === "locked" ? {pendingIds:[item.id]} : change === "forbidden" ? {forbidden:true,error:"Denied"} : change === "loading" ? {loading:true} : change === "error" ? {error:"Failed"} : change === "filter" ? {status:"failed_retryable"} : {onRetry:undefined});
    expect(dialog()).toBeNull();await act(async () => old.click());expect(onRetry).not.toHaveBeenCalled();
    await mount();expect(dialog()).toBeNull();
  });
  it("does not restore old confirmation after unmount",async () => {await mount();await click("Retry");const old=button("Confirm retry");await act(async () => root.render(<div/>));await act(async () => old.click());expect(onRetry).not.toHaveBeenCalled();});
  it.each(["queued","processing","succeeded","failed_terminal"])("does not offer retry for %s",async status => {await mount({data:{...data,items:[{...item,status}]}});expect(container.querySelector('button[aria-label="Retry report.pdf"]')).toBeNull();expect(onRetry).not.toHaveBeenCalled();});
  it("keeps previews read-only and outside the retry confirmation",async () => {const onPreview=vi.fn();await mount({onPreview});await click("Preview");expect(onPreview).toHaveBeenCalledExactlyOnceWith("asset-1");expect(onRetry).not.toHaveBeenCalled();expect(dialog()).toBeNull();});
});
