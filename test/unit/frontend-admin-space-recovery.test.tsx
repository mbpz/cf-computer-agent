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
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/spaces" }); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function render(runtime = locale()) { await act(async () => root.render(<AdminSpacesRoute locale={runtime} />)); await flush(); }
  function button(label: string) { return [...container.querySelectorAll("button")].find(item => item.textContent === label) as HTMLButtonElement; }
  async function click(label: string) { expect(button(label)).toBeTruthy(); await act(async () => button(label).click()); await flush(); }
  async function input(id:string,value:string) { const el=container.querySelector(`#${id}`) as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new browser.Event("input",{bubbles:true}));}); }
  async function draft(name="New space",slug="new-space") { await click("Create space");await input("admin-space-name",name);await input("admin-space-slug",slug); }
  async function submit() {await act(async()=>{container.querySelector("form")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}));});await flush();if(container.querySelector("[data-confirm-action]")) await click("Confirm changes");}
  function reads(url:unknown){return String(url).includes("/collections")?json({items:[]}):json({items:[space()]});}

  async function select(id: string, value: string) {
    const el = container.querySelector(`#${id}`) as HTMLSelectElement;
    await act(async () => { el.value = value; el.dispatchEvent(new browser.Event("change", { bubbles: true })); });
  }
  function managementFetch(writes: { url: string; body: Record<string, unknown> }[], failure?: string) {
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      if (!init?.method) return String(url).includes("/collections") ? json({ items: [collection()] }) : json({ items: [space()] });
      const body = JSON.parse(String(init.body)); writes.push({ url: String(url), body });
      if (failure === "server") return new Response(null, { status: 503 });
      if (failure === "denied") return new Response(null, { status: 403 });
      const item = String(url).includes("collections") ? collection({ ...body, id: init.method === "POST" ? "new-collection" : "collection-1", updatedAt: "2026-09-29T00:00:00.000Z" }) : space({ ...body, updatedAt: "2026-09-29T00:00:00.000Z" });
      if (failure === "wrong-id") item.id = "other";
      if (failure === "wrong-name") item.name = "Not requested";
      return json(String(url).includes("collections") ? { collection: item } : { space: item });
    });
  }
  it.each(["Edit space: Private space", "Edit collection: Private collection"])("canceling %s confirmation sends no PATCH and keeps the draft", async label => {
    const writes: {url:string;body:Record<string,unknown>}[] = []; managementFetch(writes);
    await render();await click(label);await input("admin-record-name","Unsaved");
    await act(async()=>{container.querySelector("form")!.dispatchEvent(new browser.Event("submit",{bubbles:true,cancelable:true}));});
    expect(container.querySelector('[role="alertdialog"]')).toBeTruthy();expect(writes).toHaveLength(0);
    await act(async()=>{(container.querySelector("[data-cancel-action]") as HTMLButtonElement).click();});
    expect(writes).toHaveLength(0);expect((container.querySelector("#admin-record-name") as HTMLInputElement).value).toBe("Unsaved");
  });
  it("rejects a stale editor snapshot after recovery rather than rebasing it", async () => {
    const bodies: Record<string,unknown>[] = [];let updated=false;
    vi.stubGlobal("fetch",async(url:unknown,init?:RequestInit)=>{
      if(init?.method){bodies.push(JSON.parse(String(init.body)));updated=true;return new Response(null,{status:409});}
      return String(url).includes("/collections")?json({items:[]}):json({items:[space({updatedAt:updated?"2026-10-01T00:00:00.000Z":"2026-09-28T00:00:00.000Z"})]});
    });
    await render();await click("Edit space: Private space");await input("admin-record-name","Stale");await submit();await click("Try again");
    expect(bodies).toHaveLength(1);await submit();expect(bodies).toHaveLength(2);
    expect(bodies.map(body=>body.expectedUpdatedAt)).toEqual(["2026-09-28T00:00:00.000Z","2026-09-28T00:00:00.000Z"]);
    expect((container.querySelector("#admin-record-name") as HTMLInputElement).value).toBe("Stale");
  });
  it("edits a space through its full management form and refreshes authoritative data", async () => {
    const writes: { url: string; body: Record<string, unknown> }[] = []; managementFetch(writes);
    await render(); await click("Edit space: Private space");
    await input("admin-record-name", "Renamed"); await input("admin-record-slug", "renamed");
    await input("admin-record-description", "Description"); await input("admin-record-position", "8"); await select("admin-record-status", "disabled");
    await submit(); expect(writes).toEqual([{ url: "/api/admin/spaces/space-1", body: { name: "Renamed", slug: "renamed", description: "Description", status: "disabled", position: 8, expectedUpdatedAt: "2026-09-28T00:00:00.000Z" } }]);
    expect(container.querySelector("form")).toBeNull(); expect(container.textContent).toContain("Private space");
  });
  it("creates a collection with the selected space and parent, and edits it back to root", async () => {
    const writes: { url: string; body: Record<string, unknown> }[] = []; managementFetch(writes);
    await render(); await click("Create collection: Private space"); await input("admin-record-name", "Child"); await select("admin-record-parent", "collection-1"); await submit();
    expect(writes[0]).toEqual({ url: "/api/admin/collections", body: { spaceId: "space-1", parentId: "collection-1", name: "Child", description: "", position: 0, status: "active" } });
    await click("Edit collection: Private collection"); await input("admin-record-name", "Renamed collection"); await select("admin-record-parent", ""); await submit();
    expect(writes[1]).toEqual({ url: "/api/admin/collections/collection-1", body: { parentId: null, name: "Renamed collection", description: "", position: 0, status: "active", expectedUpdatedAt: "2026-09-28T00:00:00.000Z" } }); expect(container.querySelector("form")).toBeNull();
  });
  it.each(["server", "wrong-id", "wrong-name"])("locks a %s edit until GET recovery without replay", async failure => {
    const writes: { url: string; body: Record<string, unknown> }[] = []; managementFetch(writes, failure);
    await render(); await click("Edit space: Private space"); await input("admin-record-name", "My draft"); await submit();
    expect(button("Save changes").disabled).toBe(true); expect((container.querySelector("#admin-record-name") as HTMLInputElement).value).toBe("My draft");
    await click("Try again"); expect(button("Save changes").disabled).toBe(false); expect(writes).toHaveLength(1);
  });
  it("discards protected edit state after denial", async () => {
    const writes: { url: string; body: Record<string, unknown> }[] = []; managementFetch(writes, "denied");
    await render(); await click("Edit collection: Private collection"); await submit(); expect(container.querySelector("form")).toBeNull(); expect(container.textContent).not.toContain("Private collection");
  });
  it("prevents write controls on legacy readonly spaces", async () => {
    vi.stubGlobal("fetch", async (url: unknown) => String(url).includes("/collections") ? json({ items: [collection()] }) : json({ items: [space({ kind: "legacy", readOnly: true })] }));
    await render(); expect(button("Edit space: Private space")?.disabled).toBe(true); expect(button("Create collection: Private space")?.disabled).toBe(true); expect(button("Edit collection: Private collection")?.disabled).toBe(true);
  });
  it("rejects invalid position before edit and cancel leaves no writes", async () => {
    const writes: { url: string; body: Record<string, unknown> }[] = []; managementFetch(writes);
    await render(); await click("Edit space: Private space"); await input("admin-record-position", "1000001"); await submit(); expect(writes).toHaveLength(0);
    await click("Cancel"); await click("Discard changes"); expect(container.querySelector("form")).toBeNull();
  });
  it("coalesces collection submits and reuses its request key after response loss", async () => {
    const first = deferred<Response>(); const requests: { key: string | null; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      if (!init?.method) return reads(url);
      requests.push({ key: new Headers(init.headers).get("idempotency-key"), body: JSON.parse(String(init.body)) });
      if (requests.length === 1) return first.promise;
      return json({ collection: collection({ ...requests[0]!.body as object, id: "created-once" }) });
    });
    await render(); await click("Create collection: Private space"); await input("admin-record-name", "Once");
    await act(async () => { const form = container.querySelector("form")!; form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); });
    expect(requests).toHaveLength(1); expect(button("Cancel").disabled).toBe(true);
    first.resolve(new Response(null, { status: 503 })); await flush(); await click("Try again"); expect(requests).toHaveLength(1);
    await submit(); expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]); expect(requests[0]!.key).toMatch(/^[a-f0-9-]{36}$/); expect(container.querySelector("form")).toBeNull();
  });
  it("closes an acknowledged collection draft even if its post-write GET fails", async () => {
    let writes = 0;
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      if (!init?.method) return writes ? new Response(null, { status: 503 }) : reads(url);
      writes++; return json({ collection: collection({ ...JSON.parse(String(init.body)), id: "created" }) });
    });
    await render(); await click("Create collection: Private space"); await input("admin-record-name", "Saved"); await submit();
    expect(container.querySelector("form")).toBeNull(); expect(button("Try again")).toBeTruthy(); expect(button("Create collection: Private space").disabled).toBe(true); expect(writes).toBe(1);
  });
  it.each(["spaceId", "parentId", "position", "status", "description"])("rejects mismatched collection %s receipts", async field => {
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => !init?.method ? reads(url) : json({ collection: collection({ ...JSON.parse(String(init.body)), [field]: field === "position" ? 10 : field === "status" ? "disabled" : "mismatch" }) }));
    await render(); await click("Create collection: Private space"); await input("admin-record-name", "Draft"); await submit(); expect(button("Save changes").disabled).toBe(true); expect(container.querySelector("form")).not.toBeNull();
  });
  it("excludes a collection and its descendants from its parent options", async () => {
    vi.stubGlobal("fetch", async (url: unknown) => String(url).includes("/collections") ? json({ items: [collection(), collection({ id: "child", parentId: "collection-1", name: "Child" }), collection({ id: "root", name: "Other root" }), collection({ id: "disabled", name: "Disabled", status: "disabled" })] }) : json({ items: [space()] }));
    await render(); await click("Edit collection: Private collection"); expect([...container.querySelectorAll("#admin-record-parent option")].map(item => (item as HTMLOptionElement).value)).toEqual(["", "root"]);
  });
  it("retains an unloaded existing parent without silently moving the collection", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
      if (init?.method) { const body = JSON.parse(String(init.body)); bodies.push(body); return json({ collection: collection({ ...body, updatedAt: "2026-09-29T00:00:00.000Z" }) }); }
      return String(url).includes("/collections") ? json({ items: [collection({ parentId: "unloaded-parent" })], nextCursor: "more" }) : json({ items: [space()] });
    });
    await render(); await click("Edit collection: Private collection"); expect((container.querySelector("#admin-record-parent") as HTMLSelectElement).value).toBe("unloaded-parent"); await submit(); expect(bodies[0]).toMatchObject({ parentId: "unloaded-parent" });
  });
  it("ignores an old collection write denial after changing scope", async () => {
    const old = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => init?.method ? old.promise : String(url).includes("/collections") ? json({ items: [] }) : json({ items: [space({ name: ++gets === 1 ? "Private space" : "New scope" })] }));
    await render(); await click("Create collection: Private space"); await input("admin-record-name", "Old draft"); await submit(); await render(locale());
    old.resolve(new Response(null, { status: 403 })); await flush(); expect(container.textContent).toContain("New scope"); expect(container.querySelector("form")).toBeNull();
  });
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
