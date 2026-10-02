// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { AdminRolesRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");



describe("role write recovery", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/submissions?page=2" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });



  async function render(runtime = locale()) { await act(async () => root.render(<AdminRolesRoute locale={runtime} />)); await flush(); }
  function button(label: string) { return [...container.querySelectorAll("button")].find((item) => item.textContent === label) as HTMLButtonElement; }
  async function click(label: string) { expect(button(label)).toBeTruthy(); await act(async () => button(label).click()); await flush(); }
  async function confirmChange(label: string) {
    await click(label); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click("Confirm change");
  }
  async function input(label: string, value: string) { const el = container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement; expect(el).toBeTruthy(); await act(async () => { const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, "value")!.set!; setter.call(el, value); el.dispatchEvent(new browser.Event("input", {bubbles: true})); }); }

  it.each(["pending", "unknown", "forbidden"])("keeps %s writes route-locked, including when the editor disappears", async outcome => {
    const response = deferred<Response>(); let reads = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") return response.promise;
      reads++; return json({ items: [role()] });
    });
    await render(); await click("Save permissions");
    await act(async () => { button("Confirm change").click(); writeWorkspaceHistory("push", "/tasks"); });
    expect(browser.location.pathname).toBe("/admin/submissions");
    if (outcome === "unknown") { response.reject(new TypeError("Failed to fetch")); await flush(); }
    if (outcome === "forbidden") { response.resolve(json({}, 403)); await flush(); }
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); });
    expect(browser.location.pathname).toBe("/admin/submissions");
    const e = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(e); expect(e.defaultPrevented).toBe(true);
    if (outcome !== "pending") {
      await click("Try again"); expect(reads).toBe(2);
      await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); expect(browser.location.pathname).toBe("/tasks");
    } else { response.resolve(json({ role: role() })); await flush(); }
  });
  it.each(["Save permissions", "Assign member", "Remove"])("canceling %s never sends a mutation", async (label) => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      requests.push(init?.method || "GET"); return json({ items: [role()] });
    });
    await render();
    if (label === "Assign member") await input("Assigned members", "member-new");
    await click(label); await click("Cancel");
    expect(requests).toEqual(["GET"]);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("discards unconfirmed permission writes on route unmount", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      requests.push(init?.method || "GET"); return json({ items: [role()] });
    });
    await render(); await click("Save permissions");
    const staleConfirm = button("Confirm change");
    await act(async () => root.render(<div>Other route</div>));
    await act(async () => staleConfirm.click());
    await render();
    expect(requests).toEqual(["GET", "GET"]);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("synchronously admits one mask write and refreshes authoritative roles", async () => {
    const patch = deferred<Response>(); const requests: string[] = []; let changed = false;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { const method = init?.method || "GET"; requests.push(method); return method === "PATCH" ? patch.promise : json({items: [role({name: changed ? "Fresh editor" : "Editor"})]}); });
    await render(); await act(async () => { button("Save permissions").click(); button("Save permissions").click(); });
    expect(requests).toEqual(["GET"]);
    await act(async () => { button("Confirm change").click(); button("Confirm change").click(); });
    expect(requests).toEqual(["GET", "PATCH"]);
    changed = true; patch.resolve(json({role: role()})); await flush();
    expect(requests).toEqual(["GET", "PATCH", "GET"]); expect(container.textContent).toContain("Fresh editor");
  });

  it.each([401,403])("clears private role and member data on write %s and retries only GET", async (status) => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => { const method = init?.method || "GET"; requests.push(method); return method === "GET" ? json({items:[role()]}) : new Response(null,{status}); });
    await render(); await confirmChange("Save permissions"); expect(container.textContent).not.toContain("member-secret"); expect(button("Save permissions")).toBeUndefined();
    await click("Try again"); expect(requests).toEqual(["GET","PATCH","GET"]); expect(container.textContent).toContain("member-secret");
  });

  it.each(["network","500","wrong-id","wrong-mask"])("requires explicit read after %s without repeating a write", async (failure) => {
    const requests: string[]=[];
    vi.stubGlobal("fetch",async (_: unknown,init?:RequestInit)=>{const method=init?.method||"GET"; requests.push(method); if(method==="GET")return json({items:[role()]}); if(failure==="network")throw new TypeError("lost"); if(failure==="500")return new Response(null,{status:500}); return json({role:role(failure==="wrong-id"?{id:"other"}:{allowBits:"0x2"})});});
    await render(); await confirmChange("Save permissions"); expect(button("Save permissions").disabled).toBe(true); expect(requests).toEqual(["GET","PATCH"]);
    await click("Try again"); expect(requests).toEqual(["GET","PATCH","GET"]); expect(button("Save permissions").disabled).toBe(false);
  });

  it("keeps writes locked when acknowledged write refresh fails and coalesces manual reads",async()=>{
    const read=deferred<Response>(); let gets=0; let writes=0;
    vi.stubGlobal("fetch",async (_:unknown,init?:RequestInit)=>{if(init?.method==="PATCH"){writes++;return json({role:role()});} gets++;return gets===1?json({items:[role()]}):gets===2?new Response(null,{status:500}):read.promise;});
    await render(); await confirmChange("Save permissions"); expect(button("Save permissions").disabled).toBe(true);
    await act(async()=>{button("Try again").click();button("Try again").click();});expect(gets).toBe(3);expect(writes).toBe(1);
    read.resolve(json({items:[role({assignedMemberIds:[],memberCount:0})]}));await flush(); expect(container.textContent).not.toContain("member-secret");expect(button("Save permissions").disabled).toBe(false);
  });

  it.each([401,403])("clears roles on post-write read %s",async(status)=>{
    let gets=0;vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>init?.method==="PATCH"?json({role:role()}):++gets===1?json({items:[role()]}):new Response(null,{status}));
    await render();await confirmChange("Save permissions");expect(container.textContent).not.toContain("member-secret");expect(button("Save permissions")).toBeUndefined();
  });

  it.each(["false","malformed"])("rejects %s unassignment receipts without optimistic member removal",async(receipt)=>{
    const requests:string[]=[];vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{requests.push(init?.method||"GET");return init?.method==="DELETE"?json(receipt==="false"?{assigned:true}:{}):json({items:[role()]});});
    await render();await confirmChange("Remove");expect(container.textContent).toContain("member-secret");expect(button("Save permissions").disabled).toBe(true);await click("Try again");expect(requests).toEqual(["GET","DELETE","GET"]);
  });

  it("refreshes member assignments rather than inventing counts after unassignment",async()=>{
    let gets=0;vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>init?.method==="DELETE"?json({assigned:false}):json({items:[++gets===1?role():role({assignedMemberIds:["member-new"],memberCount:1})]}));
    await render();await confirmChange("Remove");expect(container.textContent).not.toContain("member-secret");expect(container.textContent).toContain("member-new");expect(gets).toBe(2);
  });

  it("preserves creation draft on failed create and uses explicit read for recovery",async()=>{
    let writes=0;vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{if(init?.method==="POST"){writes++;return new Response(null,{status:500});}return json({items:[role()]});});
    await render();await input("Role key","custom");await input("Role name","Custom");await click("Create role");
    expect((container.querySelector('input[aria-label="Role key"]') as HTMLInputElement).value).toBe("custom");expect(button("Create role").disabled).toBe(true);await click("Try again");expect(writes).toBe(1);
  });

  it.each(["missing-items","bad-row","duplicate-id","bad-members"])("fails closed for %s role lists",async(shape)=>{
    vi.stubGlobal("fetch",async()=>json(shape==="missing-items"?{}:{items:shape==="duplicate-id"?[role(),role()]:[role(shape==="bad-row"?{allowBits:"oops"}:shape==="bad-members"?{assignedMemberIds:["member-secret","member-secret"]}:{})]}));
    await render();expect(button("Save permissions")).toBeUndefined();expect(container.querySelector('[data-page-state="error"]')).toBeTruthy();
  });
  it("edits task and VM permission bits without discarding other bits",async()=>{
    let sent="";vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{if(init?.method==="PATCH"){sent=String(init.body);return json({role:role({allowBits:"0x300001"})});}return json({items:[role()]});});
    await render();for(const name of ["Use workspace tasks","Use workspace VM"]){const checkbox=container.querySelector(`input[aria-label="${name}"]`) as HTMLInputElement;expect(checkbox).toBeTruthy();await act(async()=>checkbox.click());}
    await confirmChange("Save permissions");expect(JSON.parse(sent)).toEqual({allowBits:"0x300001"});
  });

  it.each(["success","denial"])("ignores old-scope %s while keeping the write locked until a fresh read",async(outcome)=>{
    const write=deferred<Response>();let gets=0;
    vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>init?.method==="PATCH"?write.promise:json({items:[role({name:++gets===1?"Old scope":"New scope"})]}));
    await render();await confirmChange("Save permissions");await render(locale());
    write.resolve(outcome==="success"?json({role:role()}):new Response(null,{status:403}));await flush();
    expect(container.textContent).toContain("New scope");expect(button("Save permissions").disabled).toBe(true);await click("Try again");expect(gets).toBe(3);expect(button("Save permissions").disabled).toBe(false);
  });

  it("does not unlock a new-scope read that started before the old write settled",async()=>{
    const write=deferred<Response>();const secondRead=deferred<Response>();let gets=0;
    vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>init?.method==="PATCH"?write.promise:++gets===2?secondRead.promise:json({items:[role()]}));
    await render();await confirmChange("Save permissions");await render(locale());write.resolve(json({role:role()}));await flush();secondRead.resolve(json({items:[role()]}));await flush();
    expect(button("Save permissions").disabled).toBe(true);await click("Try again");expect(gets).toBe(3);expect(button("Save permissions").disabled).toBe(false);
  });

  it.each(["create","assign"])("submits %s once and clears its draft only after acknowledgement and read",async(operation)=>{
    const write=deferred<Response>();let posts=0;let gets=0;
    vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{if(init?.method==="POST"){posts++;return write.promise;}gets++;return json({items:[role(),...(gets>1&&operation==="create"?[role({id:"custom",key:"custom",name:"Custom"})]:[])]});});
    await render();if(operation==="create"){await input("Role key","custom");await input("Role name","Custom");}else{await input("Assigned members","new-member");}
    const label=operation==="create"?"Create role":"Assign member";await act(async()=>{button(label).click();button(label).click();});
    if (operation === "assign") { expect(posts).toBe(0); await act(async()=>{button("Confirm change").click();button("Confirm change").click();}); }
    expect(posts).toBe(1);
    write.resolve(json(operation==="create"?{role:role({id:"custom",key:"custom",name:"Custom",allowBits:"0x0"})}:{assigned:true}));await flush();expect(gets).toBe(2);expect(posts).toBe(1);
    expect((container.querySelector(`input[aria-label="${operation==="create"?"Role key":"Assigned members"}"]`) as HTMLInputElement).value).toBe("");
  });

  it.each(["create-key","create-mask","assign-false"])("does not accept an unrelated %s receipt or discard its draft",async(failure)=>{
    const requests:string[]=[];vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{requests.push(init?.method||"GET");if(init?.method!=="POST")return json({items:[role()]});return json(failure==="assign-false"?{assigned:false}:{role:role({id:"custom",key:failure==="create-key"?"other":"custom",name:"Custom",allowBits:failure==="create-mask"?"0x2":"0x0"})});});
    await render();if(failure==="assign-false"){await input("Assigned members","member-new");await confirmChange("Assign member");}else{await input("Role key","custom");await input("Role name","Custom");await click("Create role");}
    expect(button("Save permissions").disabled).toBe(true);expect(requests).toEqual(["GET","POST"]);
    expect((container.querySelector(`input[aria-label="${failure==="assign-false"?"Assigned members":"Role key"}"]`) as HTMLInputElement).value).toBe(failure==="assign-false"?"member-new":"custom");await click("Try again");expect(requests).toEqual(["GET","POST","GET"]);
  });

});
function role(overrides: Record<string,unknown>={}) { return {id:"role-editor",key:"editor",name:"Editor",description:"Private role",allowBits:"0x1",memberCount:1,assignedMemberIds:["member-secret"],status:"active",isSystem:false,...overrides}; }
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json"}});}
function locale(){return createLocaleRuntime({navigatorLanguage:"en"});}
async function flush(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));for(let i=0;i<12;i++)await Promise.resolve();});}
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
