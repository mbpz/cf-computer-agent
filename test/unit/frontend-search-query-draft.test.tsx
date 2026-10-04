// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
describe("search query draft ownership", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => { browser = new Window({ url: "https://app.test/search?q=docs" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(handler?: (url: string, init?: RequestInit) => Promise<Response>, searchHandler?: (url: string) => Promise<Response>) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/saved-views")) return handler ? handler(url, init) : Response.json({ items: [] });
      if (searchHandler) return searchHandler(url);
      return Response.json({ items: [], degraded: false, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
    await act(async () => root.render(<SearchRoute memberId="member-a" locale={createLocaleRuntime({ navigatorLanguage: "en" })} search={browser.location.search} />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  }
  function input() { return container.querySelector('[data-saved-view-controls] input') as HTMLInputElement; }
  function edit(value: string) { props<{ onChange: (event: unknown) => void }>(input()).onChange({ currentTarget: { value } }); }
  function submit() { container.querySelector('[data-saved-view-controls] form')!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); }
  async function click(selector: string) { const button = container.querySelector(selector) as HTMLButtonElement; expect(button).toBeTruthy(); await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 20)); }); }
  function queryInput() { return container.querySelector("#knowledge-search") as HTMLInputElement; }
  function editQuery(value: string) { props<{ onChange: (event: unknown) => void }>(queryInput()).onChange({ currentTarget: { value } }); }
  function searchSubmit() { queryInput().closest("form")!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); }
  function unloadWarns() { const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; }
  it("does not append duplicate history entries for synchronous repeated submits", async () => {
    await mount(); const before = browser.history.length;
    await act(async () => { editQuery("next"); searchSubmit(); searchSubmit(); });
    expect(browser.history.length).toBe(before + 1); expect(browser.location.search).toBe("?q=next"); expect(unloadWarns()).toBe(false);
  });
  it("keeps a newer draft visible after a slow result settles", async () => {
    let resolve!: (value: Response) => void;
    await mount(undefined, () => new Promise(done => { resolve = done; }));
    await act(async () => editQuery("newer"));
    await act(async () => { resolve(Response.json({ items: [], degraded: false, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } })); await new Promise(done => setTimeout(done, 20)); });
    expect(queryInput().value).toBe("newer"); expect(unloadWarns()).toBe(true);
  });
  it("keeps the draft and its guard rendered when the initial result fails", async () => {
    await mount(undefined, async () => { throw new Error("read failed"); });
    await act(async () => editQuery("retry draft"));
    expect(queryInput().value).toBe("retry draft"); await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("deferred"));
    await click("[data-cancel-action]"); expect(queryInput().value).toBe("retry draft");
  });
  it("does not let a slow initial GET lock a clean route", async () => {
    await mount(undefined, () => new Promise(() => {}));
    expect(unloadWarns()).toBe(false); await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("committed"));
  });
  it("blocks search edit and submit synchronously while a saved-view write is pending or unknown", async () => {
    let reject!: (reason: Error) => void;
    await mount(async (_url, init) => init?.method === "POST" ? new Promise((_resolve, no) => { reject = no; }) : Response.json({ items: [] }));
    await act(async () => { edit("New view"); submit(); editQuery("forbidden"); searchSubmit(); });
    expect(queryInput().value).toBe("docs"); expect(browser.location.search).toBe("?q=docs");
    await act(async () => reject(new Error("response lost")));
    await act(async () => { editQuery("still forbidden"); searchSubmit(); });
    expect(queryInput().value).toBe("docs"); expect(browser.location.search).toBe("?q=docs"); expect(unloadWarns()).toBe(true);
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("blocked"));
  });
  it("does not clear the query when the final admission refuses an already confirmed discard", async () => {
    await mount(); await act(async () => editQuery("keep"));
    await act(async () => writeWorkspaceHistory("push", "/knowledge"));
    const remove = registerWorkspaceLeaveGuard(() => ({ kind: "block" }));
    await click("[data-confirm-action]"); expect(queryInput().value).toBe("keep"); expect(browser.location.pathname).toBe("/search");
    remove(); expect(unloadWarns()).toBe(true);
  });
  it("keeps edited input visible rather than replacing it with the previous result query", async () => {
    await mount(); await act(async () => editQuery("new draft"));
    expect(queryInput().value).toBe("new draft"); expect(unloadWarns()).toBe(true);
  });
  it("preserves input on cancel and resets only on admitted discard", async () => {
    await mount(); await act(async () => editQuery("unsent"));
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("deferred"));
    await click("[data-cancel-action]"); expect(queryInput().value).toBe("unsent"); expect(browser.location.pathname).toBe("/search");
    await act(async () => writeWorkspaceHistory("push", "/knowledge")); await click("[data-confirm-action]");
    expect(browser.location.pathname).toBe("/knowledge"); expect(unloadWarns()).toBe(false);
  });
  it("submits the latest same-event draft and accepts its normalized value as the new baseline", async () => {
    await mount(); await act(async () => { editQuery("  latest  "); searchSubmit(); });
    expect(new URLSearchParams(browser.location.search).get("q")).toBe("latest"); expect(queryInput().value).toBe("latest");
    expect(container.querySelector("[data-confirm-action]")).toBeNull(); expect(unloadWarns()).toBe(false);
  });
  it("retains the draft and releases the application reservation after another guard rejects submission", async () => {
    await mount(); const remove = registerWorkspaceLeaveGuard(() => ({ kind: "block" }));
    await act(async () => { editQuery("next"); searchSubmit(); });
    expect(browser.location.search).toBe("?q=docs"); expect(queryInput().value).toBe("next"); expect(unloadWarns()).toBe(true);
    remove(); await act(async () => searchSubmit()); expect(browser.location.search).toBe("?q=next"); expect(unloadWarns()).toBe(false);
  });
  it("respects the saved-name discard guard without discarding the submitted query", async () => {
    await mount(); await act(async () => { edit("Saved name"); editQuery("new query"); searchSubmit(); });
    expect(browser.location.search).toBe("?q=docs"); await click("[data-cancel-action]");
    expect(input().value).toBe("Saved name"); expect(queryInput().value).toBe("new query");
    await act(async () => searchSubmit()); await click("[data-confirm-action]");
    expect(new URLSearchParams(browser.location.search).get("q")).toBe("new query"); expect(queryInput().value).toBe("new query");
    expect(input().value).toBe(""); expect(unloadWarns()).toBe(false);
  });
  it("refuses saved-view writes, name edits and search edits while query discard is being decided", async () => {
    let writes = 0;
    await mount(async (_url, init) => { if (init?.method === "POST") writes++; return Response.json({ items: [view()] }); });
    const savedSubmit = props<{ onSubmit: (event: unknown) => void }>(input().closest("form")!).onSubmit;
    const nameEdit = props<{ onChange: (event: unknown) => void }>(input()).onChange;
    const deleteClick = props<{ onClick: () => void }>(container.querySelector('button[aria-label="Delete saved view: Docs"]') as HTMLElement).onClick;
    await act(async () => editQuery("unsent"));
    await act(async () => writeWorkspaceHistory("push", "/knowledge"));
    await act(async () => { nameEdit({ currentTarget: { value: "blocked name" } }); savedSubmit({ preventDefault() {} }); deleteClick(); editQuery("late"); searchSubmit(); });
    expect(writes).toBe(0); expect(input().value).toBe(""); expect(queryInput().value).toBe("unsent"); expect(browser.location.pathname).toBe("/search");
    await click("[data-cancel-action]"); expect(queryInput().value).toBe("unsent");
  });
  it("ignores old member query edit and submit callbacks after replacement", async () => {
    await mount(); await act(async () => editQuery("private a"));
    const oldEdit = props<{ onChange: (event: unknown) => void }>(queryInput()).onChange;
    const oldSubmit = props<{ onSubmit: (event: unknown) => void }>(queryInput().closest("form")!).onSubmit;
    await act(async () => root.render(<SearchRoute memberId="member-b" locale={createLocaleRuntime({ navigatorLanguage: "en" })} search={browser.location.search} />));
    await act(async () => { oldEdit({ currentTarget: { value: "late a" } }); oldSubmit({ preventDefault() {} }); });
    expect(browser.location.search).toBe("?q=docs"); expect(queryInput().value).toBe("docs"); expect(unloadWarns()).toBe(false);
  });
  it("confirms unsent query discard before applying a saved view and uses the applied view as baseline", async () => {
    await mount(async () => Response.json({ items: [{ ...view(), filters: { ...view().filters, q: "saved" } }] }));
    await act(async () => editQuery("unsent")); await click("[data-saved-view-apply]");
    expect(browser.location.search).toBe("?q=docs"); await click("[data-cancel-action]"); expect(queryInput().value).toBe("unsent");
    await click("[data-saved-view-apply]"); await click("[data-confirm-action]");
    expect(new URLSearchParams(browser.location.search).get("q")).toBe("saved"); expect(queryInput().value).toBe("saved"); expect(unloadWarns()).toBe(false);
  });
  const composerKey = "memory-garden:search-composer:v1:member-a";
  it("keeps an unsent query and view name after refresh without creating a view", async () => {
    let posts = 0;
    const handler = async (_url: string, init?: RequestInit) => { if (init?.method === "POST") posts += 1; return Response.json({ items: [] }); };
    await mount(handler);
    await act(async () => { editQuery("Keep this query"); edit("Keep name"); });
    expect(browser.sessionStorage.getItem(composerKey)).toContain("Keep this query");
    expect(unloadWarns()).toBe(true);
    await act(async () => root.unmount());
    root = createRoot(container); posts = 0;
    await mount(handler);
    expect(queryInput().value).toBe("Keep this query");
    expect(input().value).toBe("Keep name");
    expect(posts).toBe(0);
    expect(unloadWarns()).toBe(true);
  });
  it("keeps the query on screen when the tab cannot record the draft", async () => {
    await mount();
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
    await act(async () => editQuery("Unrecorded query"));
    expect(queryInput().value).toBe("Unrecorded query");
    expect(container.textContent).toContain("could not record");
  });
  it("allows leave when the search draft cannot be read and records only after discard", async () => {
    browser.sessionStorage.setItem(composerKey, "{");
    await mount();
    expect(container.textContent).toContain("can't be read");
    expect(unloadWarns()).toBe(false);
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("committed"));
    browser.history.replaceState({}, "", "/search?q=docs");
    await click("[data-search-composer-blocked] button");
    await act(async () => editQuery("After discard"));
    expect(browser.sessionStorage.getItem(composerKey)).toContain("After discard");
  });
  it("drops the stored search draft after a confirmed leave", async () => {
    await mount();
    await act(async () => editQuery("Keep this query"));
    expect(browser.sessionStorage.getItem(composerKey)).toContain("Keep this query");
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("deferred"));
    await click("[data-confirm-action]");
    expect(browser.sessionStorage.getItem(composerKey)).toBeNull();
    await act(async () => expect(writeWorkspaceHistory("push", "/search?q=docs")).toBe("committed"));
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount();
    expect(queryInput().value).toBe("docs");
    expect(input().value).toBe("");
    expect(unloadWarns()).toBe(false);
  });
  it("does not keep a submitted query as an unsent draft", async () => {
    await mount();
    await act(async () => { editQuery("submitted"); searchSubmit(); });
    expect(browser.sessionStorage.getItem(composerKey)).toBeNull();
    expect(unloadWarns()).toBe(false);
  });
});
function props<T>(element: HTMLElement): T { return (element as unknown as Record<string, T>)[Object.keys(element).find(key => key.startsWith("__reactProps$"))!]!; }

function view() { return { id: "view-1", name: "Docs", updatedAt: "2026-10-02T00:00:00.000Z", filters: { v: 1, q: "docs", spaceId: null, collectionId: null, tagIds: [], tagMode: "or" } }; }
