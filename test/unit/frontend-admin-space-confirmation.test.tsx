// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { SpacesPage } from "../../frontend/pages/admin/spaces-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ storage: {getItem: () => "en",setItem: () => {}} });
const collection = {id:"collection-1",name:"Collection",parentId:null,description:"",status:"active" as const,position:0,updatedAt:"2026-09-28T00:00:00.000Z"};
const space = {id:"space-1",name:"Space",slug:"space",description:"",status:"active" as const,position:0,updatedAt:"2026-09-28T00:00:00.000Z",collections:[collection]};
const spaces = [space];
describe("space and collection confirmation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let onManage: ReturnType<typeof vi.fn>; let onCreate: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    browser = new Window({url:"https://app.test/admin/spaces"});
    for(const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) vi.stubGlobal(key,value);
    container=browser.document.createElement("div") as unknown as HTMLElement;browser.document.body.append(container as unknown as Node);
    const {createRoot}=await import("react-dom/client");root=createRoot(container);onManage=vi.fn().mockResolvedValue(true);onCreate=vi.fn().mockResolvedValue(true);
  });
  afterEach(async()=>{await act(async()=>root.unmount());browser.close();vi.unstubAllGlobals();});
  async function mount(props:Partial<React.ComponentProps<typeof SpacesPage>>={}){await act(async()=>root.render(<SpacesPage spaces={spaces} locale={locale} onManage={onManage} onCreate={onCreate} {...props}/>));}
  function button(label:string){const el=[...container.querySelectorAll("button")].find(el=>el.textContent===label);expect(el,label).toBeTruthy();return el as HTMLButtonElement;}
  async function click(label:string){await act(async()=>button(label).click());}
  async function input(id:string,value:string){const el=container.querySelector(`#${id}`) as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new browser.Event("input",{bubbles:true}));});}
  async function submit(){await act(async()=>{container.querySelector("form")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}));});}
  const dialog=()=>container.querySelector('[role="alertdialog"]');
  async function leave() { await act(async()=>{writeWorkspaceHistory("push", "/home");}); }
  function unload() { const event=new browser.Event("beforeunload",{cancelable:true});browser.dispatchEvent(event);return event.defaultPrevented; }
  it.each(["Create space","Edit space: Space","Create collection: Space","Edit collection: Collection"])("protects %s draft through canceled and committed navigation",async label=>{
    await mount();await click(label);expect(unload()).toBe(false);const id=label==="Create space"?"admin-space-name":"admin-record-name";await input(id,"Local draft");expect(unload()).toBe(true);
    await leave();expect(browser.location.pathname).toBe("/admin/spaces");expect(dialog()).not.toBeNull();await act(async()=>{(dialog()!.querySelector("[data-cancel-action]") as HTMLButtonElement).click();});
    expect((container.querySelector("#"+id) as HTMLInputElement).value).toBe("Local draft");await leave();await click("Discard changes");expect(browser.location.pathname).toBe("/home");expect(unload()).toBe(false);expect(onCreate).not.toHaveBeenCalled();expect(onManage).not.toHaveBeenCalled();
  });
  it.each(["Create space","Edit space: Space","Create collection: Space","Edit collection: Collection"])("retains %s input when final navigation admission fails",async label=>{
    await mount();await click(label);const id=label==="Create space"?"admin-space-name":"admin-record-name";await input(id,"Keep");const unregister=registerWorkspaceLeaveGuard(()=>({kind:"allow",beforeCommit:()=>false}));
    await leave();expect(dialog()).not.toBeNull();await click("Discard changes");expect(browser.location.pathname).toBe("/admin/spaces");expect((container.querySelector("#"+id) as HTMLInputElement).value).toBe("Keep");expect(unload()).toBe(true);unregister();
  });
  it.each(["space","collection"])("blocks navigation during a %s action confirmation",async kind=>{
    await mount();await click(kind==="space"?"Edit space: Space":"Edit collection: Collection");await submit();await leave();expect(browser.location.pathname).toBe("/admin/spaces");expect(container.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);expect(unload()).toBe(true);
    await act(async()=>{(dialog()!.querySelector("[data-cancel-action]") as HTMLButtonElement).click();});await leave();expect(browser.location.pathname).toBe("/home");
  });
  it.each(["Create space","Create collection: Space"])("submits synchronous latest %s fields once",async label=>{
    await mount();await click(label);if(label==="Create space")await input("admin-space-slug","new-space");const id=label==="Create space"?"admin-space-name":"admin-record-name";
    await act(async()=>{const el=container.querySelector("#"+id) as HTMLInputElement;Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,"value")!.set!.call(el,"Latest");el.dispatchEvent(new browser.Event("input",{bubbles:true}));for(let i=0;i<2;i++)container.querySelector("form")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}));});
    const calls=label==="Create space"?onCreate.mock.calls:onManage.mock.calls;expect(calls).toHaveLength(1);expect(label==="Create space"?calls[0][0].name:calls[0][0].input.name).toBe("Latest");
  });
  it.each(["Create space","Edit space: Space","Create collection: Space"])("rejects %s submit and cancel while leave confirmation is open",async label=>{
    await mount();await click(label);const id=label==="Create space"?"admin-space-name":"admin-record-name";await input(id,"Keep");if(label==="Create space")await input("admin-space-slug","new-space");await leave();expect(dialog()).not.toBeNull();await submit();await click("Cancel");expect(onCreate).not.toHaveBeenCalled();expect(onManage).not.toHaveBeenCalled();expect(container.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
  });
  it.each(["space","collection"])("confirms exact %s target, changes and one write",async kind=>{
    await mount();await click(kind==="space"?"Edit space: Space":"Edit collection: Collection");await input("admin-record-name","Renamed");await submit();
    expect(onManage).not.toHaveBeenCalled();expect(dialog()?.textContent).toContain(kind+"-1");expect(dialog()?.textContent).toContain("Renamed");expect(dialog()?.textContent).toContain(kind==="space"?"Space → Renamed":"Collection → Renamed");expect(browser.document.activeElement?.textContent).toBe("Cancel");
    const confirm=button("Confirm changes");await act(async()=>{confirm.click();confirm.click();});expect(onManage).toHaveBeenCalledTimes(1);expect(onManage.mock.calls[0][0]).toMatchObject({kind,spaceId:"space-1",input:{name:"Renamed",expectedUpdatedAt:"2026-09-28T00:00:00.000Z"}});
  });
  it("canceling save retains the edit without writing",async()=>{await mount();await click("Edit space: Space");await input("admin-record-name","Draft");await submit();await act(async()=>{(container.querySelector('[data-cancel-action]') as HTMLButtonElement).click();});expect(onManage).not.toHaveBeenCalled();expect((container.querySelector('#admin-record-name') as HTMLInputElement).value).toBe("Draft");});
  it.each(["space","collection","create-collection","create-space"])("protects dirty %s cancellation and clears only after explicit discard",async kind=>{
    await mount();await click(kind==="space"?"Edit space: Space":kind==="collection"?"Edit collection: Collection":kind==="create-collection"?"Create collection: Space":"Create space");
    const id=kind==="create-space"?"admin-space-name":"admin-record-name";await input(id,"Unsaved");await click("Cancel");expect(dialog()).toBeTruthy();expect(container.querySelector("form")).toBeTruthy();
    await act(async()=>{(container.querySelector('[data-cancel-action]') as HTMLButtonElement).click();});expect((container.querySelector('#'+id) as HTMLInputElement).value).toBe("Unsaved");
    await click("Cancel");await click("Discard changes");expect(container.querySelector("form")).toBeNull();expect(onManage).not.toHaveBeenCalled();expect(onCreate).not.toHaveBeenCalled();
    if(kind==="create-space"){await click("Create space");expect((container.querySelector('#'+id) as HTMLInputElement).value).toBe("");}
  });
  it.each(["read","pending","blocked","denied"])("invalidates save confirmation on %s without rebasing draft",async reason=>{
    await mount();await click("Edit space: Space");await input("admin-record-name","Draft");await submit();const old=button("Confirm changes");
    const next=reason==="read"?{spaces:[{...space,updatedAt:"2026-10-01T00:00:00.000Z"}]}:reason==="pending"?{pending:true}:reason==="blocked"?{blocked:true}:{error:"Denied"};
    await mount(next);expect(dialog()).toBeNull();await act(async()=>old.click());expect(onManage).not.toHaveBeenCalled();
    if(reason==="read"){await submit();await click("Confirm changes");expect(onManage.mock.calls[0][0].input.expectedUpdatedAt).toBe("2026-09-28T00:00:00.000Z");}
  });
  it.each(["Edit space: Space","Edit collection: Collection","Create collection: Space","Create space"])("closes pristine %s without confirmation or writes",async label=>{await mount();await click(label);await click("Cancel");expect(dialog()).toBeNull();expect(container.querySelector("form")).toBeNull();expect(onManage).not.toHaveBeenCalled();expect(onCreate).not.toHaveBeenCalled();});
  it("rejects invalid input before requesting save confirmation",async()=>{await mount();await click("Edit space: Space");await input("admin-record-position","1000001");await submit();expect(dialog()).toBeNull();expect(onManage).not.toHaveBeenCalled();expect(container.querySelector('[role="alert"]')).toBeTruthy();});
  it("drops dirty create-space confirmation when busy without losing the draft",async()=>{await mount();await click("Create space");await input("admin-space-name","Keep");await click("Cancel");const old=button("Discard changes");await mount({pending:true});await act(async()=>old.click());await mount();expect(dialog()).toBeNull();expect((container.querySelector("#admin-space-name") as HTMLInputElement).value).toBe("Keep");expect(onCreate).not.toHaveBeenCalled();});
  it("invalidates save confirmation if the draft changes",async()=>{await mount();await click("Edit space: Space");await submit();const old=button("Confirm changes");await input("admin-record-name","Later input");expect(dialog()).toBeNull();await act(async()=>old.click());expect(onManage).not.toHaveBeenCalled();});
  it("does not replay detached confirmation after denial",async()=>{await mount();await click("Edit space: Space");await submit();const old=button("Confirm changes");await mount({error:"Denied"});await act(async()=>old.click());expect(onManage).not.toHaveBeenCalled();});
  it("shows all changed space settings before sending the captured command",async()=>{
    await mount();await click("Edit space: Space");await input("admin-record-slug","new-slug");await input("admin-record-description","New description");await input("admin-record-position","8");
    await act(async()=>{const el=container.querySelector("#admin-record-status") as HTMLSelectElement;el.value="disabled";el.dispatchEvent(new browser.Event("change",{bubbles:true}));});
    await submit();for(const value of ["space → new-slug","New description","0 → 8","Active → Disabled"]) expect(dialog()?.textContent).toContain(value);
    await click("Confirm changes");expect(onManage.mock.calls[0][0].input).toMatchObject({slug:"new-slug",description:"New description",position:8,status:"disabled"});
  });
  it("shows parent change and collection identity without changing the captured version",async()=>{
    const parent={...collection,id:"parent-2",name:"Parent"};await mount({spaces:[{...space,collections:[collection,parent]}]});await click("Edit collection: Collection");
    await act(async()=>{const el=container.querySelector("#admin-record-parent") as HTMLSelectElement;el.value="parent-2";el.dispatchEvent(new browser.Event("change",{bubbles:true}));});
    await submit();expect(dialog()?.textContent).toContain("No parent (root) → parent-2");await click("Confirm changes");expect(onManage.mock.calls[0][0]).toMatchObject({collectionId:"collection-1",input:{parentId:"parent-2",expectedUpdatedAt:"2026-09-28T00:00:00.000Z"}});
  });
  it("does not abandon an in-flight confirmed write",async()=>{onManage.mockImplementation(()=>new Promise(()=>{}));await mount();await click("Edit space: Space");await input("admin-record-name","Draft");await submit();await click("Confirm changes");expect(button("Cancel").disabled).toBe(true);await click("Cancel");expect(container.querySelector("form")).toBeTruthy();expect(onManage).toHaveBeenCalledTimes(1);});
});
