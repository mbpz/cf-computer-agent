// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminMenusRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");



describe("menu write recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/submissions?page=2" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });



  async function render(runtime = locale()) { await act(async () => root.render(<AdminMenusRoute locale={runtime} />)); await flush(); }
  function button(label: string) { return [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement; }
  async function click(label: string) { expect(button(label)).toBeTruthy(); await act(async () => button(label).click()); await flush(); }

  async function confirmChange(label: string) {
    await click(label); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click("Confirm change");
  }

  async function field(name: string, value: string) {
    const input = container.querySelector(`[name="${name}"]`) as HTMLInputElement;
    expect(input).toBeTruthy();
    await act(async () => { const proto = input.tagName === "SELECT" ? browser.HTMLSelectElement.prototype : browser.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(input, value); input.dispatchEvent(new browser.Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }) as unknown as Event); });
  }
  it.each(["Disable", "Hide", "Delete", "Save menu"])("canceling %s does not send a mutation", async label => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { calls.push(init?.method || "GET"); return json({tree:[menu()]}); });
    await render(); if(label === "Save menu") { await click("Edit menu"); await field("path", "/draft"); }
    await click(label); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await act(async () => (container.querySelector('[data-cancel-action]') as HTMLButtonElement).click());
    expect(calls).toEqual(["GET"]);
    if(label === "Save menu") expect((container.querySelector('[name="path"]') as HTMLInputElement).value).toBe("/draft");
  });
  it("discards a deletion confirmation on unmount without replaying it", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { calls.push(init?.method || "GET"); return json({tree:[menu()]}); });
    await render(); await click("Delete"); const stale = button("Confirm change");
    await act(async()=>root.render(<div>Other route</div>)); await act(async()=>stale.click()); await render();
    expect(calls).toEqual(["GET", "GET"]); expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it("creates from an empty tree and closes the acknowledged draft even if refresh fails", async () => {
    const calls: string[] = []; let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { const method = init?.method || "GET"; calls.push(method); if (method === "POST") { body = JSON.parse(init!.body as string); return json({ menu: menu({ ...body, id: "created" }) }); } return calls.length === 1 ? json({ tree: [] }) : new Response(null, { status: 503 }); });
    await render(); await click("Create menu"); await field("key", "new-menu"); await field("path", "/new-menu"); await click("Create");
    expect(body).toMatchObject({ key: "new-menu", path: "/new-menu", parentId: null, labelKey: "NAV_HOME", groupName: "workspace", requiredBits: "0x0" });
    expect(calls).toEqual(["GET", "POST", "GET"]); expect(container.querySelector("form")).toBeNull(); expect(button("Create menu").disabled).toBe(true);
  });
  it("edits hierarchy with the opened snapshot and excludes self and descendants", async () => {
    const original = menu({ children: [menu({ id: "child", key: "child", path: "/child", parentId: "custom" })] }); let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { if (init?.method) { body = JSON.parse(init.body as string); return json({ menu: menu({ ...body, children: [] }) }); } return json({ tree: [original, menu({ id: "other", key: "other", path: "/other" })] }); });
    await render(); await click("Edit menu");
    const options = [...container.querySelectorAll<HTMLSelectElement>('[name="parentId"] option')].map(option => option.value);
    expect(options).toEqual(["", "other"]);
    await field("parentId", "other"); await field("labelKey", "NAV_SEARCH"); await field("path", "/moved"); await field("requiredBits", "0xA"); await confirmChange("Save menu");
    expect(body).toMatchObject({ parentId: "other", labelKey: "NAV_SEARCH", path: "/moved", requiredBits: "0xa", expected: { parentId: null, path: "/private-menu", position: 1 } });
    expect(container.querySelector("form")).toBeNull();
  });
  it.each(["network", "receipt", "conflict"])("retains draft and does not auto-replay an uncertain create: %s", async failure => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { const method = init?.method || "GET"; calls.push(method); if (method === "GET") return json({ tree: [] }); if (failure === "network") throw new TypeError("lost"); if (failure === "conflict") return new Response(null, { status: 409 }); return json({ menu: menu({ key: "wrong" }) }); });
    await render(); await click("Create menu"); await field("key", "new-menu"); await click("Create"); expect(button("Create").disabled).toBe(true); expect(container.querySelector("form")).not.toBeNull();
    await click("Try again"); expect(calls).toEqual(["GET", "POST", "GET"]); expect((container.querySelector('[name="key"]') as HTMLInputElement).value).toBe("new-menu");
  });
  it("keeps a stale editor snapshot across recovery reads", async () => {
    let reads = 0; const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { if (init?.method) { bodies.push(JSON.parse(init.body as string)); return new Response(null, { status: 409 }); } return json({ tree: [menu({ path: ++reads === 1 ? "/private-menu" : "/winner" })] }); });
    await render(); await click("Edit menu"); await field("path", "/loser"); await confirmChange("Save menu"); await click("Try again"); await confirmChange("Save menu");
    expect(bodies).toHaveLength(2); expect(bodies[1]).toMatchObject({ path: "/loser", expected: { path: "/private-menu" } });
  });
  it.each([401,403])("clears the creation draft on denial %s", async status => {
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => init?.method ? new Response(null, { status }) : json({ tree: [] }));
    await render(); await click("Create menu"); await field("key", "private-draft"); await click("Create"); expect(container.querySelector("form")).toBeNull(); await click("Try again"); await click("Create menu"); expect((container.querySelector('[name="key"]') as HTMLInputElement).value).toBe("");
  });
  it.each([["key", "a"], ["key", "Bad key"], ["path", "https://evil.test"], ["position", ""], ["position", "-1"], ["position", "10001"], ["position", "1.5"], ["requiredBits", "0x10000000000000000"], ["requiredBits", "not-hex"]])("rejects invalid form %s=%s before sending", async (name, value) => {
    const calls: string[] = []; vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { calls.push(init?.method || "GET"); return json({ tree: [] }); });
    await render(); await click("Create menu"); await field("key", "valid-key"); await field(name, value); await click("Create");
    expect(calls).toEqual(["GET"]); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Check the key");
  });
  it("serializes double submissions and disables row actions while editing", async () => {
    const pending = deferred<Response>(); const calls: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { calls.push(init?.method || "GET"); return init?.method ? pending.promise : json({ tree: [menu()] }); });
    await render(); await click("Create menu"); await field("key", "new-key"); expect(button("Disable").disabled).toBe(true); expect(button("Delete").disabled).toBe(true);
    await act(async () => { button("Create").click(); button("Create").click(); }); expect(calls).toEqual(["GET", "POST"]);
    pending.resolve(new Response(null, { status: 409 })); await flush(); await click("Cancel"); await click("Discard changes"); expect(button("Disable").disabled).toBe(true); await click("Try again"); expect(button("Disable").disabled).toBe(false);
  });
  it("excludes parents that would exceed the four-level limit", async () => {
    const fourth = menu({ id: "four", key: "four", path: "/four", parentId: "three" });
    const third = menu({ id: "three", key: "three", path: "/three", parentId: "two", children: [fourth] });
    const second = menu({ id: "two", key: "two", path: "/two", parentId: "custom", children: [third] });
    vi.stubGlobal("fetch", async () => json({ tree: [menu({ children: [second] })] }));
    await render(); await click("Create menu"); expect([...container.querySelectorAll<HTMLOptionElement>('[name="parentId"] option')].map(option => option.value)).toEqual(["", "custom", "two", "three"]);
  });
  it.each(["parentId", "path", "labelKey", "requiredBits"])("does not accept a wrong %s editing receipt", async key => {
    const calls: string[] = []; vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { calls.push(init?.method || "GET"); if (init?.method) { const body = JSON.parse(init.body as string); return json({ menu: menu({ ...body, [key]: key === "parentId" ? "wrong-parent" : key === "requiredBits" ? "0x2" : "wrong" }) }); } return json({ tree: [menu()] }); });
    await render(); await click("Edit menu"); await confirmChange("Save menu"); expect(calls).toEqual(["GET", "PATCH"]); expect(button("Save menu").disabled).toBe(true); expect(container.querySelector("form")).not.toBeNull();
  });
  it("admits only one same-batch write and reads the authoritative hierarchy", async () => {
    const pending=deferred<Response>();const calls:string[]=[];let refreshed=false;
    vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{const method=init?.method||"GET";calls.push(method);return method==="PATCH"?pending.promise:json({tree:[menu({labelKey:refreshed?"Fresh label":"NAV_HOME",status:refreshed?"disabled":"active"})]});});
    await render();await act(async()=>{button("Disable").click();button("Disable").click();});expect(calls).toEqual(["GET"]);
    await act(async()=>{button("Confirm change").click();button("Confirm change").click();});expect(calls).toEqual(["GET","PATCH"]);
    refreshed=true;pending.resolve(json({menu:menu({status:"disabled"})}));await flush();expect(calls).toEqual(["GET","PATCH","GET"]);expect(container.textContent).toContain("Fresh label");expect(button("Enable").disabled).toBe(false);
  });
  it.each([401,403])("clears the menu tree on write %s and recovers with GET only",async status=>{
    const calls:string[]=[];vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");return init?.method?new Response(null,{status}):json({tree:[menu()]});});
    await render();await confirmChange("Disable");expect(container.textContent).not.toContain("/private-menu");await click("Try again");expect(calls).toEqual(["GET","PATCH","GET"]);
  });
  it.each(["network","server","wrong-id","wrong-status","wrong-position"])("locks writes after %s until a read-only recovery",async failure=>{
    const calls:string[]=[];vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{const method=init?.method||"GET";calls.push(method);if(method==="GET")return json({tree:[menu()]});if(failure==="network")throw new TypeError("lost");if(failure==="server")return new Response(null,{status:503});return json({menu:menu({id:failure==="wrong-id"?"other":"custom",status:failure==="wrong-status"?"active":"disabled",position:failure==="wrong-position"?99:1})});});
    await render();if(failure==="wrong-position"){await position(4);await confirmChange("Save");}else await confirmChange("Disable");expect(button("Delete").disabled).toBe(true);expect(calls).toEqual(["GET","PATCH"]);await click("Try again");expect(calls).toEqual(["GET","PATCH","GET"]);expect(button("Delete").disabled).toBe(false);
  });
  it.each([401,403,503])("does not unlock after acknowledged write then GET %s",async status=>{
    const calls:string[]=[];vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{const method=init?.method||"GET";calls.push(method);return method==="PATCH"?json({menu:menu({status:"disabled"})}):calls.length>1?new Response(null,{status}):json({tree:[menu()]});});
    await render();await confirmChange("Disable");expect(calls).toEqual(["GET","PATCH","GET"]);if(status===503)expect(button("Delete").disabled).toBe(true);else expect(container.textContent).not.toContain("/private-menu");
  });
  it.each([{}, {menu:{id:"other"}}, {menu:menu({id:"other"})}])("rejects a malformed or wrong-target DELETE receipt %j",async receipt=>{
    const calls:string[]=[];vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");return json(init?.method?receipt:{tree:[menu()]});});await render();await confirmChange("Delete");expect(container.textContent).toContain("/private-menu");expect(button("Disable").disabled).toBe(true);await click("Try again");expect(calls).toEqual(["GET","DELETE","GET"]);
  });
  it("reads after DELETE instead of pruning the local tree optimistically",async()=>{
    let count=0;const pending=deferred<Response>();vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>init?.method==="DELETE"?json({menu:menu()}):++count===1?json({tree:[menu()]}):pending.promise);
    await render();await confirmChange("Delete");expect(container.textContent).toContain("/private-menu");expect(button("Disable").disabled).toBe(true);pending.resolve(json({tree:[]}));await flush();expect(container.textContent).toContain("No menus configured.");
  });
  it.each([{},{tree:[menu({children:[{}]})]},{tree:[menu(),menu()]},{tree:[menu({parentId:"missing"})]},{tree:[menu({children:[menu({id:"child",key:"child",parentId:null})]})]}])("rejects malformed hierarchy rather than presenting partial success %j",async data=>{
    vi.stubGlobal("fetch",async()=>json(data));await render();expect(container.textContent).toContain("Menus are temporarily unavailable.");expect(button("Try again")).toBeTruthy();
  });
  it("refreshes position input from authoritative read after an uncertain write",async()=>{
    let gets=0;vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>init?.method?new Response(null,{status:503}):json({tree:[menu({position:++gets===1?1:7})]}));await render();await position(4);await confirmChange("Save");expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("4");await click("Try again");expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("7");expect(button("Save").disabled).toBe(true);
  });
  it("does not let a late old-scope denial clear a freshly read tree",async()=>{
    const pending=deferred<Response>();let gets=0;const calls:string[]=[];vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");return init?.method?pending.promise:json({tree:[menu({labelKey:++gets===1?"Old":"New scope"})]});});await render();await confirmChange("Disable");await render(locale());pending.resolve(new Response(null,{status:403}));await flush();expect(container.textContent).toContain("New scope");expect(button("Disable").disabled).toBe(true);await click("Try again");expect(calls).toEqual(["GET","PATCH","GET","GET"]);expect(button("Disable").disabled).toBe(false);
  });
  it("does not unlock when a scope read started before the old write finished",async()=>{
    const write=deferred<Response>();const read=deferred<Response>();let gets=0;vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>init?.method?write.promise:++gets===2?read.promise:json({tree:[menu()]}));await render();await confirmChange("Disable");await render(locale());write.resolve(json({menu:menu({status:"disabled"})}));await flush();read.resolve(json({tree:[menu()]}));await flush();expect(button("Disable").disabled).toBe(true);await click("Try again");expect(button("Disable").disabled).toBe(false);
  });
  it("retains read-only recovery when a new scope returns an empty hierarchy during an old write",async()=>{
    const write=deferred<Response>();let gets=0;const calls:string[]=[];
    vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");return init?.method?write.promise:json({tree:++gets===2?[]:[menu()]});});
    await render();await confirmChange("Disable");await render(locale());write.resolve(new Response(null,{status:503}));await flush();
    await click("Try again");expect(calls).toEqual(["GET","PATCH","GET","GET"]);expect(button("Disable").disabled).toBe(false);
  });
  it("can reveal a hidden menu without removing it from management",async()=>{
    let visible=false;const bodies:unknown[]=[];vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{if(init?.method){bodies.push(JSON.parse(String(init.body)));visible=true;return json({menu:menu({visible})});}return json({tree:[menu({visible})]});});await render();await confirmChange("Show");expect(bodies).toEqual([{visible:true,expected:{parentId:null,labelKey:"NAV_HOME",path:"/private-menu",position:1,requiredBits:"0x0",status:"active",visible:false}}]);expect(button("Hide").disabled).toBe(false);expect(container.textContent).toContain("/private-menu");
  });
  it("rejects a visibility receipt that did not apply the intended value",async()=>{
    const calls:string[]=[];vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");return json(init?.method?{menu:menu()}:{tree:[menu()]});});await render();await confirmChange("Hide");expect(button("Disable").disabled).toBe(true);expect(calls).toEqual(["GET","PATCH"]);await click("Try again");expect(calls).toEqual(["GET","PATCH","GET"]);
  });
  it("locks all rows for a pending write and coalesces recovery reads",async()=>{
    const pending=deferred<Response>();const recovery=deferred<Response>();let gets=0;const calls:string[]=[];vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");return init?.method?pending.promise:++gets===1?json({tree:[menu(),menu({id:"second",key:"second",path:"/second"})]}):recovery.promise;});await render();await confirmChange("Disable");expect([...container.querySelectorAll("button")].filter(item=>item.textContent==="Delete").every(item=>item.disabled)).toBe(true);pending.resolve(new Response(null,{status:503}));await flush();await act(async()=>{button("Try again").click();button("Try again").click();});expect(calls).toEqual(["GET","PATCH","GET"]);recovery.resolve(json({tree:[menu()]}));await flush();expect(button("Disable").disabled).toBe(false);
  });
  it.each([menu({requiredBits:"0x10000000000000000"}), menu({children:undefined}), menu({position:10001})])("rejects out-of-contract menu data %j",async node=>{
    vi.stubGlobal("fetch",async()=>json({tree:[node]}));await render();expect(container.textContent).toContain("Menus are temporarily unavailable.");
  });
  it("rejects duplicate paths in an otherwise valid tree",async()=>{
    vi.stubGlobal("fetch",async()=>json({tree:[menu(),menu({id:"other",key:"other"})]}));await render();expect(container.textContent).toContain("Menus are temporarily unavailable.");
  });
  async function position(value:number){const el=container.querySelector('input[type="number"]') as HTMLInputElement;await act(async()=>{const setter=Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,"value")!.set!;setter.call(el,String(value));el.dispatchEvent(new browser.Event("input",{bubbles:true}));});}
});
function menu(overrides:Record<string,unknown>={}){return {id:"custom",parentId:null,key:"custom",labelKey:"NAV_HOME",path:"/private-menu",icon:null,groupName:"workspace",position:1,requiredBits:"0x0",status:"active",visible:true,isSystem:false,children:[],...overrides};}
function json(value:unknown){return new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});}
function locale(){return createLocaleRuntime({navigatorLanguage:"en"});}
async function flush(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));for(let i=0;i<12;i++)await Promise.resolve();});}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
