// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminSpacesRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");



describe("space write recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/spaces" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function render(runtime = locale()) { await act(async () => root.render(<AdminSpacesRoute locale={runtime} />)); await flush(); }
  function button(label: string) { return [...container.querySelectorAll("button")].find(item => item.textContent === label) as HTMLButtonElement; }
  async function click(label: string) { expect(button(label)).toBeTruthy(); await act(async () => button(label).click()); await flush(); }
  async function input(id:string,value:string) { const el=container.querySelector(`#${id}`) as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new browser.Event("input",{bubbles:true}));}); }
  async function draft(name="New space",slug="new-space") { await click("Create space");await input("admin-space-name",name);await input("admin-space-slug",slug); }
  async function submit() {await act(async()=>{container.querySelector("form")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}));});await flush();}
  function reads(url:unknown){return String(url).includes("/collections")?json({items:[]}):json({items:[space()]});}

  it("coalesces same-batch creates and reads authority rather than appending a receipt",async()=>{
    const pending=deferred<Response>();const calls:string[]=[];let created=false;
    vi.stubGlobal("fetch",async(url:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");if(init?.method==="POST")return pending.promise;return String(url).includes("/collections")?json({items:[]}):json({items:[space({name:created?"Authority":"Private space"})]});});
    await render();await draft();await act(async()=>{const form=container.querySelector("form")!;form.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}));form.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}));});
    expect(calls.filter(x=>x==="POST")).toHaveLength(1);created=true;pending.resolve(json({space:space({id:"new",name:"New space",slug:"new-space"})}));await flush();expect(container.textContent).toContain("Authority");expect(container.querySelector("form")).toBeNull();
  });
  it.each([401,403])("clears protected data and the draft on write %s",async status=>{
    const calls:string[]=[];vi.stubGlobal("fetch",async(url:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");return init?.method?new Response(null,{status}):reads(url);});await render();await draft();await submit();expect(container.textContent).not.toContain("Private space");expect(container.querySelector("form")).toBeNull();await click("Try again");await draft("Fresh","fresh");expect(calls.filter(x=>x==="POST")).toHaveLength(1);
  });
  it.each(["network","server","wrong-name","wrong-slug","wrong-kind","wrong-status"])("locks unknown %s creates until GET-only recovery while preserving input",async failure=>{
    const calls:string[]=[];vi.stubGlobal("fetch",async(url:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");if(!init?.method)return reads(url);if(failure==="network")throw new TypeError("lost");if(failure==="server")return new Response(null,{status:503});return json({space:space({id:"new",name:failure==="wrong-name"?"Other":"New space",slug:failure==="wrong-slug"?"other":"new-space",kind:failure==="wrong-kind"?"legacy":"shared",status:failure==="wrong-status"?"disabled":"active"})});});
    await render();await draft();await submit();expect((container.querySelector("#admin-space-name") as HTMLInputElement)?.value).toBe("New space");expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);await submit();expect(calls.filter(x=>x==="POST")).toHaveLength(1);await click("Try again");expect(calls.filter(x=>x==="POST")).toHaveLength(1);expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });
  it.each([401,403,503])("handles acknowledged create followed by read %s without resending",async status=>{
    let created=false;const calls:string[]=[];vi.stubGlobal("fetch",async(url:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");if(init?.method){created=true;return json({space:space({id:"new",name:"New space",slug:"new-space"})});}return created?new Response(null,{status}):reads(url);});await render();await draft();await submit();expect(calls.filter(x=>x==="POST")).toHaveLength(1);expect(button("Try again")).toBeTruthy();if(status!==503){expect(container.textContent).not.toContain("Private space");expect(container.querySelector("form")).toBeNull();}else expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });
  it.each([{},{items:[space(),space()]},{items:[space({name:""})]},{items:[space({status:"unexpected"})]}])("rejects malformed space pages %j",async payload=>{
    vi.stubGlobal("fetch",async(url:unknown)=>String(url).includes("/collections")?json({items:[]}):json(payload));await render();expect(button("Try again")).toBeTruthy();expect(container.textContent).not.toContain("Private space");
  });
  it.each([{},{items:[collection({spaceId:"other"})]},{items:[collection(),collection()]}])("rejects malformed or wrong-space collection pages %j",async payload=>{
    vi.stubGlobal("fetch",async(url:unknown)=>String(url).includes("/collections")?json(payload):json({items:[space()]}));await render();expect(button("Try again")).toBeTruthy();expect(container.textContent).not.toContain("Private space");
  });
  it("isolates a late old-scope write and requires a fresh read before another create",async()=>{
    const pending=deferred<Response>();let gets=0;const calls:string[]=[];vi.stubGlobal("fetch",async(url:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");return init?.method?pending.promise:String(url).includes("/collections")?json({items:[]}):json({items:[space({name:++gets===1?"Old scope":"New scope"})]});});await render();await draft();await submit();await render(locale());pending.resolve(new Response(null,{status:403}));await flush();expect(container.textContent).toContain("New scope");await click("Try again");expect(calls.filter(x=>x==="POST")).toHaveLength(1);expect(container.querySelector("form")).toBeNull();
  });
  it("does not unlock when scope recovery starts before a pending write finishes",async()=>{
    const write=deferred<Response>();const read=deferred<Response>();let gets=0;vi.stubGlobal("fetch",async(url:unknown,init?:RequestInit)=>init?.method?write.promise:String(url).includes("/collections")?json({items:[]}):++gets===2?read.promise:json({items:[space()]}));await render();await draft();await submit();await render(locale());write.resolve(new Response(null,{status:503}));await flush();read.resolve(json({items:[]}));await flush();expect(button("Create space").disabled).toBe(true);await click("Try again");expect(button("Create space").disabled).toBe(false);
  });
  it("pages spaces and their own collections on explicit bounded reads", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: unknown) => {
      const path = String(url); calls.push(path);
      if (path.includes("/collections")) return json(path.includes("cursor=") ? { items: [collection({ id: "c2", name: "Second collection" })] } : path.includes("space-1/") ? { items: [collection()], nextCursor: "collections+/=" } : { items: [] });
      return json(path.includes("cursor=") ? { items: [space({ id: "space-2", slug: "second", name: "Second space" })] } : { items: [space()], nextCursor: "spaces+/=" });
    });
    await render(); expect(calls).toHaveLength(2); expect(container.textContent).not.toContain("Second space");
    await click("Load more: Private space"); expect(container.textContent).toContain("Second collection");
    expect(calls.at(-1)).toContain("cursor=collections%2B%2F%3D");
    await click("Load more"); expect(container.textContent).toContain("Private space"); expect(container.textContent).toContain("Second space");
    expect(calls.some(url => url.includes("cursor=spaces%2B%2F%3D"))).toBe(true); expect(button("Load more")).toBeUndefined();
  });
  it.each(["spaces", "collections"])("coalesces %s pagination and recovers failed pages with GET only", async kind => {
    const page = deferred<Response>(); const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      expect(init?.method).toBeUndefined(); const path = String(url); calls.push(path);
      if (path.includes("cursor=")) return page.promise;
      return path.includes("/collections") ? json({ items: [collection()], ...(kind === "collections" ? { nextCursor: "next" } : {}) }) : json({ items: [space()], ...(kind === "spaces" ? { nextCursor: "next" } : {}) });
    });
    await render(); const label = kind === "spaces" ? "Load more" : "Load more: Private space";
    await act(async () => { button(label).click(); button(label).click(); });
    expect(calls.filter(url => url.includes("cursor="))).toHaveLength(1);
    page.resolve(new Response(null, { status: 503 })); await flush(); expect(button("Create space").disabled).toBe(true);
    await click("Try again"); expect(button("Create space").disabled).toBe(false); expect(calls.filter(url => url.includes("cursor="))).toHaveLength(1);
  });
  it.each(["duplicate", "repeat-cursor"])("rejects %s space pagination without partial append", async failure => {
    vi.stubGlobal("fetch", async (url: unknown) => {
      const path = String(url); if (path.includes("/collections")) return json({ items: [] });
      return json(path.includes("cursor=") ? { items: [space({ id: failure === "duplicate" ? "space-1" : "second", name: "Invalid page" })], ...(failure === "repeat-cursor" ? { nextCursor: "next" } : {}) } : { items: [space()], nextCursor: "next" });
    });
    await render(); await click("Load more"); expect(container.textContent).not.toContain("Invalid page"); expect(button("Try again")).toBeTruthy(); expect(button("Create space").disabled).toBe(true);
  });
  it("clears already loaded space data on a later collection read denial", async () => {
    vi.stubGlobal("fetch", async (url: unknown) => String(url).includes("cursor=") ? new Response(null, { status: 403 }) : String(url).includes("/collections") ? json({ items: [collection()], nextCursor: "next" }) : json({ items: [space()] }));
    await render(); await click("Load more: Private space"); expect(container.textContent).not.toContain("Private space"); expect(container.textContent).not.toContain("Private collection"); expect(button("Try again")).toBeTruthy();
  });
  it("ignores a late old-scope collection read even when fetch ignores abort", async () => {
    const old = deferred<Response>(); let spaces = 0; let collections = 0;
    vi.stubGlobal("fetch", async (url: unknown) => String(url).includes("/collections") ? ++collections === 1 ? old.promise : json({ items: [] }) : json({ items: [space({ name: ++spaces === 1 ? "Old scope" : "New scope" })] }));
    await render(); await render(locale()); old.resolve(json({ items: [collection()] })); await flush(); expect(container.textContent).toContain("New scope"); expect(container.textContent).not.toContain("Old scope"); expect(container.textContent).not.toContain("Private collection");
  });
  it("accepts the server's 80-character slug and 120-character name limits", async () => {
    const writes: unknown[] = []; vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => { if (!init?.method) return reads(url); const body = JSON.parse(String(init.body)); writes.push(body); return json({ space: space(body) }); });
    await render(); await draft("N".repeat(120), "s".repeat(80)); await submit(); expect(writes).toHaveLength(1); expect(container.querySelector("form")).toBeNull();
  });
  it("does not resurrect protected data from a GET pending when a write denies access", async () => {
    const write = deferred<Response>(); const read = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => init?.method ? write.promise : String(url).includes("/collections") ? json({ items: [] }) : ++gets === 2 ? read.promise : json({ items: [space()] }));
    await render(); await draft(); await submit(); await click("Try again");
    write.resolve(new Response(null, { status: 403 })); await flush(); expect(container.textContent).not.toContain("Private space");
    read.resolve(json({ items: [space()] })); await flush(); expect(container.textContent).not.toContain("Private space"); expect(container.querySelector("form")).toBeNull(); expect(button("Try again")).toBeTruthy();
  });
  it("enforces server-compatible names and slug grammar before POST",async()=>{
    const calls:string[]=[];vi.stubGlobal("fetch",async(url:unknown,init?:RequestInit)=>{calls.push(init?.method||"GET");return reads(url);});await render();await draft("N".repeat(121),"bad--slug");await submit();expect(calls.filter(x=>x==="POST")).toHaveLength(0);
  });
});
function space(overrides:Record<string,unknown>={}) {return {id:"space-1",name:"Private space",slug:"private-space",description:"",kind:"shared",status:"active",position:0,readOnly:false,createdAt:"2026-09-28T00:00:00.000Z",updatedAt:"2026-09-28T00:00:00.000Z",...overrides};}
function collection(overrides:Record<string,unknown>={}) {return {id:"collection-1",spaceId:"space-1",parentId:null,name:"Private collection",description:"",status:"active",position:0,createdAt:"2026-09-28T00:00:00.000Z",updatedAt:"2026-09-28T00:00:00.000Z",...overrides};}
function json(value:unknown){return new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});}
function locale(){return createLocaleRuntime({navigatorLanguage:"en"});}
async function flush(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));for(let i=0;i<12;i++)await Promise.resolve();});}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
