// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewQueueRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");


describe("review queue leave ownership", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root; let driver: ReturnType<typeof installWorkspaceHistoryDriver>;
  beforeEach(async () => {
    browser = new Window({url:"https://app.test/admin/submissions"}); driver = installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    for (const [key,value] of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})) vi.stubGlobal(key,value);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node);
    const {createRoot} = await import("react-dom/client"); root = createRoot(container);
  });
  afterEach(async () => {await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals();});
  const locale = () => createLocaleRuntime({storage:{getItem:()=>"en",setItem:()=>{}}});
  async function mount() {await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search}/>)); await flush();}
  async function mountMember() {await act(async () => root.render(<ReviewQueueRoute locale={locale()} memberId="member-a" search={browser.location.search}/>)); await flush();}
  async function click(label:string) {const el = [...container.querySelectorAll("button")].find(b => b.textContent === label); expect(el, label).toBeTruthy(); await act(async () => el!.click()); await flush();}
  async function decide() {await click("Reject"); await click("Confirm rejection"); const final=container.querySelector("[data-confirm-action]") as HTMLButtonElement; expect(final).toBeTruthy(); await act(async () => final.click()); await flush();}
  async function leave() {await act(async () => writeWorkspaceHistory("push", "/home"));}
  function unload() {const e = new browser.Event("beforeunload", {cancelable:true}); browser.dispatchEvent(e); return e.defaultPrevented;}
  async function typeNote(value:string, index=0) { const input=container.querySelectorAll("textarea[data-review-note]")[index] as HTMLTextAreaElement; expect(input).toBeTruthy(); await act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new browser.Event("input",{bubbles:true}));input.dispatchEvent(new browser.Event("change",{bubbles:true}));}); }
  async function dismissLeave(confirm=false) {const button=container.querySelector(confirm ? "[data-confirm-action]" : "[data-cancel-action]") as HTMLButtonElement;expect(button).toBeTruthy();await act(async()=>button.click());await flush();}
  it.each(["missing", "denied"])("retains an independent note after a %s refresh and restores it only to its own row", async outcome=>{
    let reads=0; let posts=0;
    vi.stubGlobal("fetch",async (_:unknown,init?:RequestInit)=>{if(init?.method==="POST") {posts++;return json({});} reads++;return reads===2 ? (outcome==="denied" ? new Response(null,{status:403}) : queue([{id:"review-2",title:"Other",status:"review_pending"}])) : queue();});
    await mount();await click("Reject");await typeNote("Private unsent note");await mount();
    expect(container.textContent).not.toContain("Private unsent note");expect(unload()).toBe(true);
    await leave();expect(browser.location.pathname).toBe("/admin/submissions");expect(container.querySelector('[role="alertdialog"]')).toBeTruthy();await dismissLeave();
    await mount();const note=container.querySelector("textarea[data-review-note]") as HTMLTextAreaElement;expect(note?.value).toBe("Private unsent note");expect(posts).toBe(0);
    await leave();await dismissLeave(true);expect(browser.location.pathname).toBe("/home");expect(unload()).toBe(false);
  });
  it("does not silently erase an unsent note when another reviewer makes its row terminal", async()=>{
    let reads=0;
    vi.stubGlobal("fetch",async()=>++reads===1 ? queue() : queue([{id:"review-1",title:"Review",status:"rejected"}]));
    await mount();await click("Reject");await typeNote("Independent draft");await mount();expect(unload()).toBe(true);
    await leave();expect(container.querySelector('[role="alertdialog"]')).toBeTruthy();await dismissLeave();expect(browser.location.pathname).toBe("/admin/submissions");
  });
  it("keeps another row's unsent note when a submitted row completes and the next list omits both", async()=>{
    let reads=0;let posts=0;
    vi.stubGlobal("fetch",async(_:unknown,init?:RequestInit)=>{if(init?.method==="POST"){posts++;return json({decision:{submissionId:"review-1",decision:"rejected"}});}return ++reads===1 ? queue([{id:"review-1",title:"One",status:"review_pending"},{id:"review-2",title:"Two",status:"review_pending"}]) : queue([]);});
    await mount();const rejects=[...container.querySelectorAll("button")].filter(b=>b.textContent==="Reject");await act(async()=>rejects[1]!.click());await typeNote("Other row note");await decide();
    expect(posts).toBe(1);expect(unload()).toBe(true);await leave();expect(container.querySelector('[role="alertdialog"]')).toBeTruthy();await dismissLeave();
  });
  it("preserves a hidden draft when final navigation admission refuses, then clears only on actual commit", async()=>{
    let reads=0;
    vi.stubGlobal("fetch",async()=>++reads===2 ? queue([]) : queue());
    await mount();await click("Request changes");await typeNote("Retained revision request");await mount();
    const unregister=registerWorkspaceLeaveGuard(()=>({kind:"allow",beforeCommit:()=>false}));
    try {await leave();await dismissLeave(true);expect(browser.location.pathname).toBe("/admin/submissions");expect(unload()).toBe(true);} finally {unregister();}
    await mount();expect((container.querySelector("textarea[data-review-note]") as HTMLTextAreaElement).value).toBe("Retained revision request");
    expect([...container.querySelectorAll("button")].some(b=>b.textContent==="Confirm request for changes")).toBe(true);
    await leave();await dismissLeave(true);expect(unload()).toBe(false);
    await act(async()=>writeWorkspaceHistory("push","/admin/submissions"));await mount();expect(container.querySelector("textarea[data-review-note]")?.textContent ?? "").not.toContain("Retained revision request");expect(unload()).toBe(false);
  });
  it("cannot discard a submitted unknown note after its row vanishes", async()=>{
    let reads=0;let posts=0;
    vi.stubGlobal("fetch",async(input:unknown,init?:RequestInit)=>{
      if(init?.method==="POST"){posts++;return new Response(null,{status:503});}
      if(String(input).endsWith("/review-1")) return preview("review_pending");
      return ++reads===1 ? queue() : queue([]);
    });
    await mount();await click("Reject");await typeNote("Unknown submission note");await click("Confirm rejection");await dismissLeave(true);await click("Reload current state");
    await leave();expect(container.querySelector('[role="alertdialog"]')).toBeNull();expect(browser.location.pathname).toBe("/admin/submissions");expect(unload()).toBe(true);expect(posts).toBe(1);
  });
  it("starts a fresh draft owner after forced session teardown", async()=>{
    vi.stubGlobal("fetch",async()=>queue());await mount();await click("Reject");await typeNote("Previous session note");
    await act(async()=>root.render(null));await mount();expect(container.querySelector("textarea[data-review-note]")).toBeNull();expect(unload()).toBe(false);
  });
  it("does not treat an empty revision form as a dirty draft", async()=>{
    vi.stubGlobal("fetch",async()=>queue());await mount();await click("Request changes");expect(unload()).toBe(false);await leave();expect(browser.location.pathname).toBe("/home");
  });
  it("blocks pending and unknown navigation, then resolves terminal detail with GET only", async () => {
    const post = deferred<Response>(); let posts=0; let reads=0; const details:string[]=[];
    vi.stubGlobal("fetch", async (input:unknown, init?:RequestInit) => {
      if(init?.method === "POST") {posts++; return post.promise;}
      if(String(input).endsWith("/review-1")) {details.push(String(input)); return preview("rejected");}
      return ++reads === 1 ? queue() : queue([]);
    });
    await mount(); await decide(); await leave(); expect(browser.location.pathname).toBe("/admin/submissions"); expect(unload()).toBe(true);
    await act(async () => post.resolve(new Response(null,{status:500}))); await flush(); await leave();
    expect(browser.location.pathname).toBe("/admin/submissions"); expect(unload()).toBe(true);
    await click("Reload current state"); expect(posts).toBe(1); expect(details).toHaveLength(1); expect(unload()).toBe(false);
    await leave(); expect(browser.location.pathname).toBe("/home");
  });
  it.each([401,403])("retains unknown guard through POST %s and denied editor unmount", async status => {
    let posts=0; let reads=0;
    vi.stubGlobal("fetch", async (input:unknown, init?:RequestInit) => {
      if(init?.method === "POST") {posts++; return new Response(null,{status});}
      if(String(input).endsWith("/review-1")) return preview("rejected");
      return ++reads === 1 ? queue() : queue([]);
    });
    await mount(); await decide(); expect(container.querySelector('[data-page-state="forbidden"]')).toBeTruthy(); await leave();
    expect(browser.location.pathname).toBe("/admin/submissions"); expect(unload()).toBe(true);
    await click("Try again"); expect(unload()).toBe(false); expect(posts).toBe(1);
  });
  it("keeps the POST token through a concurrent locale read denial and does not start another read", async () => {
    const post=deferred<Response>(); let reads=0; let posts=0;
    vi.stubGlobal("fetch", async (_:unknown, init?:RequestInit) => {
      if(init?.method === "POST") {posts++; return post.promise;}
      return ++reads === 1 ? queue() : new Response(null,{status:403});
    });
    await mount(); await decide(); await mount(); expect(reads).toBe(2);
    await leave(); expect(browser.location.pathname).toBe("/admin/submissions"); expect(unload()).toBe(true);
    await click("Try again"); expect(reads).toBe(2); expect(posts).toBe(1);
    await act(async () => post.resolve(new Response(null,{status:500}))); await flush();
    await leave(); expect(browser.location.pathname).toBe("/admin/submissions"); expect(unload()).toBe(true);
  });
  it("retains unknown intent after a locale refresh returns a still-pending object", async () => {
    let posts=0;
    vi.stubGlobal("fetch", async (_:unknown, init?:RequestInit) => {if(init?.method === "POST") {posts++; throw new TypeError("lost");} return queue();});
    await mount(); await decide(); await mount(); await leave(); expect(unload()).toBe(true);
    expect(browser.location.pathname).toBe("/admin/submissions"); expect(posts).toBe(1);
    expect([...container.querySelectorAll("button")].some(b=>b.textContent === "Retry same decision")).toBe(true);
  });
  it.each(["pending", "denied", "invalid", "missing"])("does not resolve unknown outcome from %s detail", async outcome => {
    let reads=0; let posts=0;
    vi.stubGlobal("fetch", async (input:unknown, init?:RequestInit) => {
      if(init?.method === "POST") {posts++; throw new TypeError("lost");}
      if(String(input).endsWith("/review-1")) return outcome === "pending" ? preview("review_pending") : outcome === "invalid" ? preview("rejected", "other") : new Response(null,{status:outcome === "denied" ? 403 : 404});
      return ++reads === 1 ? queue() : queue([]);
    });
    await mount(); await decide(); await click("Reload current state"); await leave();
    expect(unload()).toBe(true); expect(browser.location.pathname).toBe("/admin/submissions"); expect(posts).toBe(1);
  });
  it("restores a simulated native traversal to its anchor without replay while pending", async () => {
    await act(async () => writeWorkspaceHistory("push", "/admin/submissions?page=2"));
    const post=deferred<Response>(); let posts=0;
    vi.stubGlobal("fetch", async (_:unknown, init?:RequestInit) => {if(init?.method === "POST") {posts++; return post.promise;} return queue();});
    await mount(); await decide();
    await act(async () => driver.arrive(0)); await flush(); expect(driver.requests).toHaveLength(1); expect(driver.requests[0]!.index).toBe(1);
    await act(async () => {driver.arrive(1); driver.requests[0]!.resolve();}); await flush();
    expect(driver.requests).toHaveLength(1); expect(browser.location.search).toBe("?page=2"); expect(unload()).toBe(true); expect(posts).toBe(1);
  });
  it("releases leave protection after a matching receipt even if its following GET fails", async () => {
    let reads=0; let posts=0;
    vi.stubGlobal("fetch", async (_:unknown, init?:RequestInit) => {
      if(init?.method === "POST") {posts++; return json({decision:{submissionId:"review-1",decision:"rejected"}});}
      return ++reads === 1 ? queue() : new Response(null,{status:500});
    });
    await mount(); await decide(); expect(unload()).toBe(false); await leave(); expect(browser.location.pathname).toBe("/home"); expect(posts).toBe(1);
  });
  it("does not POST a delayed publish preview after a concurrent access denial", async () => {
    const detail=deferred<Response>(); let reads=0; let posts=0;
    vi.stubGlobal("fetch", async (input:unknown, init?:RequestInit) => {
      if(init?.method === "POST") {posts++; return json({});}
      if(String(input).endsWith("/review-1")) return detail.promise;
      return ++reads === 1 ? queue() : new Response(null,{status:403});
    });
    await mount(); await click("Publish"); const final=container.querySelector("[data-confirm-action]") as HTMLButtonElement;
    await act(async () => {final.click(); writeWorkspaceHistory("push", "/home");}); expect(browser.location.pathname).toBe("/admin/submissions");
    await mount(); await act(async () => detail.resolve(preview("review_pending"))); await flush();
    expect(posts).toBe(0); expect(unload()).toBe(false); expect(container.querySelector('[data-page-state="forbidden"]')).toBeTruthy();
  });
  it("keeps an unknown queue decision after refresh and retries the same body", async () => {
    const bodies: string[] = []; let posts = 0;
    vi.stubGlobal("fetch", async (input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; bodies.push(String(init.body)); if (posts === 1) return new Response(null, { status: 503 }); return json({ decision: { submissionId: "review-1", decision: "rejected" } }); }
      if (String(input).endsWith("/review-1")) return preview("review_pending");
      return queue();
    });
    await mountMember(); await decide();
    expect(browser.sessionStorage.getItem("memory-garden:review-decision:v1:member-a:review-1")).toContain("reject");
    await act(async () => root.unmount());
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    await mountMember();
    expect(posts).toBe(1);
    expect(container.textContent).toContain("The result is unknown");
    expect(unload()).toBe(true);
    await click("Retry same decision");
    expect(posts).toBe(2); expect(bodies[1]).toBe(bodies[0]);
    expect(browser.sessionStorage.getItem("memory-garden:review-decision:v1:member-a:review-1")).toBeNull();
  });
  it("does not send a queue decision when the tab cannot record it", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") posts++;
      return queue();
    });
    await mountMember();
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
    await decide();
    expect(posts).toBe(0);
    expect(container.textContent).toContain("could not record");
  });
  it("blocks a queue decision when its record cannot be read, and allows leave until it is discarded", async () => {
    let posts = 0;
    browser.sessionStorage.setItem("memory-garden:review-decision-current:v1:member-a", "{");
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return json({ decision: { submissionId: "review-1", decision: "rejected" } }); }
      return queue();
    });
    await mountMember();
    expect(container.textContent).toContain("can't be read");
    await leave(); expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/submissions");
    await click("Discard record");
    await decide();
    expect(posts).toBe(1);
  });
  it("restores an unsent review note after the queue owner is recreated", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_: unknown, init?: RequestInit) => {
      if (init?.method === "POST") posts++;
      return queue();
    });
    await mountMember();
    await click("Reject");
    await typeNote("Keep this note");
    expect(browser.sessionStorage.getItem("memory-garden:review-note-draft:v1:member-a")).toContain("Keep this note");
    await act(async () => root.render(null));
    await mountMember();
    expect((container.querySelector("textarea[data-review-note]") as HTMLTextAreaElement).value).toBe("Keep this note");
    expect(unload()).toBe(true);
    expect(posts).toBe(0);
    await leave();
    await dismissLeave(true);
    expect(browser.location.pathname).toBe("/home");
    expect(unload()).toBe(false);
    expect(container.textContent).not.toContain("Keep this note");
    expect(browser.sessionStorage.getItem("memory-garden:review-note-draft:v1:member-a")).toBeNull();
    browser.history.replaceState({}, "", "/admin/submissions");
    await act(async () => root.render(null));
    await mountMember();
    expect(container.querySelector("textarea[data-review-note]")).toBeNull();
  });
  it("keeps a typed review note on screen when the tab cannot record it", async () => {
    vi.stubGlobal("fetch", async () => queue());
    await mountMember();
    await click("Reject");
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
    await typeNote("Unrecorded note");
    expect((container.querySelector("textarea[data-review-note]") as HTMLTextAreaElement).value).toBe("Unrecorded note");
    expect(container.textContent).toContain("could not record");
    expect(unload()).toBe(true);
  });
  it("allows leaving when a saved review note cannot be read until it is discarded", async () => {
    browser.sessionStorage.setItem("memory-garden:review-note-draft:v1:member-a", "{");
    vi.stubGlobal("fetch", async () => queue());
    await mountMember();
    expect(container.textContent).toContain("can't be read");
    await leave();
    expect(browser.location.pathname).toBe("/home");
    browser.history.replaceState({}, "", "/admin/submissions");
    await click("Discard record");
    await click("Reject");
    await typeNote("After discard");
    expect(browser.sessionStorage.getItem("memory-garden:review-note-draft:v1:member-a")).toContain("After discard");
  });
  it.each([401,403,500])("allows leaving a read-only %s failure without a write", async status => {
    vi.stubGlobal("fetch", async()=>new Response(null,{status})); await mount(); expect(unload()).toBe(false); await leave(); expect(browser.location.pathname).toBe("/home");
  });
});
function json(value:unknown) {return new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});}
function queue(items=[{id:"review-1",title:"Review",status:"review_pending"}]) {return json({items,pagination:{page:1,pageSize:20,total:items.length,totalPages:items.length ? 1 : 0}});}
function preview(status:string,id="review-1") {return json({preview:{submissionId:id,title:"Review",status,requestedSpaceId:"default"}});}
function deferred<T>() {let resolve!:(value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;}); return {promise,resolve};}
async function flush() {await act(async()=>{await new Promise(r=>setTimeout(r,0));});}
