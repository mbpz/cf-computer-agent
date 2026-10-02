// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewQueueRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
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
  async function click(label:string) {const el = [...container.querySelectorAll("button")].find(b => b.textContent === label); expect(el, label).toBeTruthy(); await act(async () => el!.click()); await flush();}
  async function decide() {await click("Reject"); await click("Confirm rejection"); const final=container.querySelector("[data-confirm-action]") as HTMLButtonElement; expect(final).toBeTruthy(); await act(async () => final.click()); await flush();}
  async function leave() {await act(async () => writeWorkspaceHistory("push", "/home"));}
  function unload() {const e = new browser.Event("beforeunload", {cancelable:true}); browser.dispatchEvent(e); return e.defaultPrevented;}
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
  it.each([401,403,500])("allows leaving a read-only %s failure without a write", async status => {
    vi.stubGlobal("fetch", async()=>new Response(null,{status})); await mount(); expect(unload()).toBe(false); await leave(); expect(browser.location.pathname).toBe("/home");
  });
});
function json(value:unknown) {return new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});}
function queue(items=[{id:"review-1",title:"Review",status:"review_pending"}]) {return json({items,pagination:{page:1,pageSize:20,total:items.length,totalPages:items.length ? 1 : 0}});}
function preview(status:string,id="review-1") {return json({preview:{submissionId:id,title:"Review",status,requestedSpaceId:"default"}});}
function deferred<T>() {let resolve!:(value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;}); return {promise,resolve};}
async function flush() {await act(async()=>{await new Promise(r=>setTimeout(r,0));});}
