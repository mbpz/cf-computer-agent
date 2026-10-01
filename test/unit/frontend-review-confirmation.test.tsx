// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  it("shows exact publication target and impact, defaults to cancel, consumes a double confirmation once",async () => {
    await mount();await click("Publish");expect(onDecision).not.toHaveBeenCalled();
    for (const value of ["Source guide","sub-1","visibility","indexing"]) expect(dialog()?.textContent).toContain(value);
    expect(browser.document.activeElement?.textContent).toBe("Cancel");await confirm();expect(onDecision).toHaveBeenCalledExactlyOnceWith("publish",undefined);expect(dialog()).toBeNull();
  });
  it("cancel publication sends no write",async () => {await mount();await click("Publish");await cancel();expect(onDecision).not.toHaveBeenCalled();expect(dialog()).toBeNull();});
  it.each([
    ["Reject","Confirm rejection","reject","rejected","not_relevant"],
    ["Request changes","Confirm request for changes","request_changes","revision_requested","needs_revision"],
  ])("confirms %s with exact note, preserves draft on cancel and submits once",async (action,submit,decision,status,reasonCode) => {
    await mount();await click(action!);await typeNote("Verify the original source");await click(submit!);
    expect(onDecision).not.toHaveBeenCalled();for(const text of ["sub-1",status!,"Verify the original source"]) expect(dialog()?.textContent).toContain(text);
    await cancel();expect(note().value).toBe("Verify the original source");await click(submit!);await confirm();expect(onDecision).toHaveBeenCalledExactlyOnceWith(decision,{reasonCode,note:"Verify the original source"});
  });
  it("cancel dirty note requires explicit discard and never submits",async () => {
    await mount();await click("Reject");await typeNote("Keep this note");await click("Cancel");expect(dialog()).not.toBeNull();await cancel();expect(note().value).toBe("Keep this note");
    await click("Cancel");await confirm();expect(note()).toBeNull();expect(onDecision).not.toHaveBeenCalled();
  });
  it("protects reason-only edits from silent cancellation",async () => {
    await mount();await click("Reject");const reason=container.querySelector("select[data-review-reason]") as HTMLSelectElement;
    await act(async () => {reason.value="unsafe";reason.dispatchEvent(new browser.Event("change",{bubbles:true}));});await click("Cancel");expect(dialog()).not.toBeNull();await cancel();expect(reason.value).toBe("unsafe");expect(onDecision).not.toHaveBeenCalled();
  });
  it("does not ask to discard an untouched note form",async () => {await mount();await click("Reject");await click("Cancel");expect(dialog()).toBeNull();expect(note()).toBeNull();});
  it("changing decision protects dirty notes, but explicit discard does not itself publish",async () => {
    await mount();await click("Reject");await typeNote("Draft");await click("Publish");expect(dialog()?.textContent).toContain("Discard");await cancel();expect(note().value).toBe("Draft");
    await click("Publish");await confirm();expect(onDecision).not.toHaveBeenCalled();expect(dialog()?.textContent).toContain("indexing");expect(browser.document.activeElement?.textContent).toBe("Cancel");await confirm();expect(onDecision).toHaveBeenCalledExactlyOnceWith("publish",undefined);
  });
  it("switches note actions only after discard and initializes a fresh reason",async () => {
    await mount();await click("Reject");await typeNote("Draft");await click("Request changes");await confirm();expect(note().value).toBe("");await click("Confirm request for changes");await confirm();expect(onDecision).toHaveBeenCalledExactlyOnceWith("request_changes",{reasonCode:"needs_revision",note:""});
  });
  it.each(["target","snapshot","pending","unknown","conflict","terminal","denied","loading","handler"])("invalidates a pending confirmation on %s without revival",async change => {
    await mount();await click("Publish");const old=dialog()?.querySelector("[data-confirm-action]") as HTMLButtonElement;expect(old).toBeTruthy();
    await mount(change === "target" ? {state:{kind:"ready",detail:{...detail,id:"sub-2"}}} : change === "snapshot" ? {state:{kind:"ready",detail:{...detail,content:"New source"}}} : change === "terminal" ? {state:{kind:"ready",detail:{...detail,status:"rejected"}}} : change === "denied" ? {state:{kind:"forbidden",message:"Denied"}} : change === "loading" ? {state:{kind:"loading"}} : change === "handler" ? {onDecision:undefined} : {decisionState:change === "pending" ? {kind:"pending",action:"publish"} : {kind:"error",action:"publish",recovery:change === "unknown" ? "retry" : "reload"}});
    expect(dialog()).toBeNull();await act(async () => old.click());expect(onDecision).not.toHaveBeenCalled();await mount();expect(dialog()).toBeNull();
  });
  it("keeps uncertain note payload visible and locked instead of offering discard",async () => {
    await mount();await click("Reject");await typeNote("Uncertain note");await mount({decisionState:{kind:"error",action:"reject",recovery:"retry"}});expect(note().value).toBe("Uncertain note");expect(note().disabled).toBe(true);await click("Cancel");expect(dialog()).toBeNull();expect(onDecision).not.toHaveBeenCalled();
  });
  it("rejects invalid UTF-8 byte budget before opening confirmation",async () => {await mount();await click("Reject");await typeNote("字".repeat(1334));expect(button("Confirm rejection").disabled).toBe(true);await click("Confirm rejection");expect(dialog()).toBeNull();expect(onDecision).not.toHaveBeenCalled();});
  it("Escape cancels a decision confirmation without losing its note",async () => {
    await mount();await click("Reject");await typeNote("Keep note");await click("Confirm rejection");
    await act(async () => dialog()!.dispatchEvent(new browser.KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
    expect(dialog()).toBeNull();expect(note().value).toBe("Keep note");expect(onDecision).not.toHaveBeenCalled();
  });
  it("unmount makes a captured confirmation unable to write",async () => {
    await mount();await click("Publish");const old=dialog()?.querySelector("[data-confirm-action]") as HTMLButtonElement;
    await act(async () => root.render(<div>Signed out</div>));await act(async () => old.click());expect(onDecision).not.toHaveBeenCalled();
  });
  it("queue does not allow two rows to open or replace the same confirmation",async () => {
    const data={items:[{id:"sub-1",title:"First",status:"review_pending"},{id:"sub-2",title:"Second",status:"review_pending"}],pagination:{page:1,pageSize:20 as const,total:2,totalPages:1}};
    await act(async () => root.render(<ReviewQueuePage state={{kind:"ready",data}} locale={locale} onReview={onDecision}/>));
    const first=container.querySelector('button[aria-label="Publish First"]') as HTMLButtonElement;const second=container.querySelector('button[aria-label="Publish Second"]') as HTMLButtonElement;
    await act(async () => {first.click();second.click();});expect(container.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);await confirm();expect(onDecision).toHaveBeenCalledExactlyOnceWith("sub-1","publish",undefined);
    await act(async () => second.click());await cancel();expect(onDecision).toHaveBeenCalledTimes(1);
  });
  it("queue binds confirmation to exact row and discards it on replacement read",async () => {
    const data={items:[{id:"sub-1",title:"Queue source",status:"review_pending"}],pagination:{page:1,pageSize:20 as const,total:1,totalPages:1}};
    await act(async () => root.render(<ReviewQueuePage state={{kind:"ready",data}} locale={locale} onReview={onDecision}/>));await click("Publish");expect(dialog()?.textContent).toContain("sub-1");expect(onDecision).not.toHaveBeenCalled();
    await act(async () => root.render(<ReviewQueuePage state={{kind:"ready",data:{...data,items:[{...data.items[0]!,title:"New snapshot"}]}}} locale={locale} onReview={onDecision}/>));expect(dialog()).toBeNull();expect(onDecision).not.toHaveBeenCalled();
  });
});
