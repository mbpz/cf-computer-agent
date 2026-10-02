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
describe("saved view route ownership", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => { browser = new Window({ url: "https://app.test/search?q=docs" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(handler?: (url: string, init?: RequestInit) => Promise<Response>) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/saved-views")) return handler ? handler(url, init) : Response.json({ items: [] });
      return Response.json({ items: [], degraded: false, pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    });
    await act(async () => root.render(<SearchRoute memberId="member-a" locale={createLocaleRuntime({ navigatorLanguage: "en" })} search={browser.location.search} />));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  }
  function input() { return container.querySelector('[data-saved-view-controls] input') as HTMLInputElement; }
  function edit(value: string) { props<{ onChange: (event: unknown) => void }>(input()).onChange({ currentTarget: { value } }); }
  function submit() { container.querySelector('[data-saved-view-controls] form')!.dispatchEvent(new browser.Event("submit", { bubbles: true, cancelable: true })); }
  async function click(selector: string) { const button = container.querySelector(selector) as HTMLButtonElement; expect(button).toBeTruthy(); await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 20)); }); }
  it("does not release an unknown delete on a generic 404, only a verified owner-scoped absence", async () => {
    let deletes = 0; let valid = false; const methods: string[] = [];
    await mount(async (url, init) => {
      methods.push(init?.method ?? "GET");
      if (init?.method === "DELETE") { deletes++; throw new Error("response lost"); }
      if (url.includes("?")) return Response.json({ items: [view()] });
      return valid ? Response.json({ error: { code: "SAVED_VIEW_NOT_FOUND", message: "Not found", retryable: false } }, { status: 404 }) : new Response("not found", { status: 404 });
    });
    await act(async () => edit("Keep draft")); await click('button[aria-label="Delete saved view: Docs"]'); await click("[data-confirm-action]");
    await click("[data-saved-view-check]");
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("blocked"));
    valid = true; await click("[data-saved-view-check]");
    expect(deletes).toBe(1); expect(methods.filter(method => method !== "GET")).toEqual(["DELETE"]);
    expect(input().value).toBe("Keep draft"); expect(container.querySelector('button[aria-label="Delete saved view: Docs"]')).toBeNull();
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("deferred"));
  });
  it("preserves rejected drafts, warns before unload, and allows editing after a definite rejection", async () => {
    await mount(async (_url, init) => init?.method === "POST"
      ? Response.json({ error: { code: "SAVED_VIEW_NAME_CONFLICT", message: "Conflict", retryable: false } }, { status: 409 }) : Response.json({ items: [] }));
    await act(async () => { edit("Docs"); submit(); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(input().value).toBe("Docs"); expect(input().disabled).toBe(false);
    const unload = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    await act(async () => { edit("Different"); expect(writeWorkspaceHistory("push", "/knowledge")).toBe("deferred"); });
    await click("[data-cancel-action]"); expect(input().value).toBe("Different");
  });
  it("does not let an initial stale list overwrite the accepted create", async () => {
    let finishList!: (response: Response) => void;
    await mount(async (_url, init) => init?.method === "POST" ? Response.json(view(), { status: 201 }) : new Promise(resolve => { finishList = resolve; }));
    await act(async () => { edit("Docs"); submit(); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(input().value).toBe(""); expect(container.querySelector("[data-saved-view-apply]")).not.toBeNull();
    await act(async () => { finishList(Response.json({ items: [] })); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.querySelector("[data-saved-view-apply]")).not.toBeNull();
  });
  it("aborts old member transport and ignores a late receipt without clearing the new draft", async () => {
    let finish!: (response: Response) => void; let signal: AbortSignal | null | undefined;
    await mount(async (_url, init) => {
      if (init?.method !== "POST") return Response.json({ items: [] });
      signal = init.signal; return new Promise(resolve => { finish = resolve; });
    });
    await act(async () => { edit("Docs"); submit(); });
    await act(async () => root.render(<SearchRoute memberId="member-b" locale={createLocaleRuntime({ navigatorLanguage: "en" })} search={browser.location.search} />));
    expect(signal?.aborted).toBe(true); await act(async () => edit("Member B"));
    await act(async () => { finish(Response.json(view(), { status: 201 })); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(input().value).toBe("Member B"); expect(container.querySelector("[data-saved-view-apply]")).toBeNull();
  });
  it("keeps the name after another guard blocks final admission and disallows writes during discard confirmation", async () => {
    let writes = 0; await mount(async (_url, init) => { if (init?.method === "POST") writes++; return Response.json({ items: [] }); });
    await act(async () => { edit("Docs"); writeWorkspaceHistory("push", "/knowledge"); });
    await act(async () => submit()); expect(writes).toBe(0);
    const remove = registerWorkspaceLeaveGuard(() => ({ kind: "block" }));
    await click("[data-confirm-action]"); expect(input().value).toBe("Docs"); expect(browser.location.pathname).toBe("/search"); remove();
  });
  it("does not apply an old member's captured saved view callback", async () => {
    await mount(async () => Response.json({ items: [view()] }));
    const apply = props<{ onClick: () => void }>(container.querySelector("[data-saved-view-apply]") as HTMLElement).onClick;
    await act(async () => root.render(<SearchRoute memberId="member-b" locale={createLocaleRuntime({ navigatorLanguage: "en" })} search={browser.location.search} />));
    const before = browser.location.href;
    await act(async () => apply()); expect(browser.location.href).toBe(before);
  });
  it("does not let a stale cancel callback cancel a newer delete confirmation", async () => {
    await mount(async () => Response.json({ items: [view()] }));
    await click('button[aria-label="Delete saved view: Docs"]');
    const cancel = props<{ onClick: () => void }>(container.querySelector("[data-cancel-action]") as HTMLElement).onClick;
    await act(async () => cancel()); await click('button[aria-label="Delete saved view: Docs"]');
    await act(async () => cancel()); expect(container.querySelector("[data-confirm-action]")).not.toBeNull();
  });
  it("saves and reapplies the complete supported filter snapshot, not only q", async () => {
    browser.history.replaceState({}, "", "/search?q=docs&spaceId=space-a&collectionId=collection-a&tagId=tag-a&tagId=tag-b&tagMode=and&page=2");
    let sent: Record<string, unknown> | undefined;
    const filters = { ...view().filters, spaceId: "space-a", collectionId: "collection-a", tagIds: ["tag-a", "tag-b"], tagMode: "and" };
    await mount(async (_url, init) => {
      if (init?.method === "POST") { sent = JSON.parse(String(init.body)); return Response.json({ ...view(), filters }, { status: 201 }); }
      return Response.json({ items: [{ ...view(), filters }] });
    });
    await act(async () => { edit("Docs"); submit(); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(sent).toEqual({ name: "Docs", filters: { q: "docs", spaceId: "space-a", collectionId: "collection-a", tagIds: ["tag-a", "tag-b"], tagMode: "and" } });
    await act(async () => writeWorkspaceHistory("push", "/search?q=other"));
    await click("[data-saved-view-controls] [data-saved-view-apply]");
    const query = new URLSearchParams(browser.location.search);
    expect(query.get("q")).toBe("docs"); expect(query.get("spaceId")).toBe("space-a"); expect(query.get("collectionId")).toBe("collection-a");
    expect(query.getAll("tagId")).toEqual(["tag-a", "tag-b"]); expect(query.get("tagMode")).toBe("and"); expect(query.has("page")).toBe(false);
  });
  it("invalidates old member confirmation and name draft on member replacement", async () => {
    let deletes = 0;
    await mount(async (_url, init) => { if (init?.method === "DELETE") deletes++; return Response.json({ items: [view()] }); });
    await act(async () => edit("Private draft")); await click('button[aria-label="Delete saved view: Docs"]');
    const confirm = props<{ onClick: () => void }>(container.querySelector("[data-confirm-action]") as HTMLElement).onClick;
    await act(async () => root.render(<SearchRoute memberId="member-b" locale={createLocaleRuntime({ navigatorLanguage: "en" })} search={browser.location.search} />));
    await act(async () => confirm());
    expect(deletes).toBe(0); expect(input().value).toBe(""); expect(container.querySelector("[data-confirm-action]")).toBeNull();
  });
  it("reconciles unknown creation through paginated reads only; absence remains blocked", async () => {
    let writes = 0; let checking = false; let present = false; const reads: string[] = [];
    await mount(async (url, init) => {
      if (init?.method === "POST") { writes++; throw new Error("lost response"); }
      if (!checking) return Response.json({ items: [] });
      reads.push(url);
      return Response.json(url.includes("cursor=") ? { items: present ? [view()] : [] } : { items: [], nextCursor: "next-page" });
    });
    await act(async () => { edit("Docs"); submit(); await new Promise(resolve => setTimeout(resolve, 20)); }); checking = true;
    await click("[data-saved-view-check]");
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("blocked"));
    expect(input().value).toBe("Docs"); present = true;
    await click("[data-saved-view-check]");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(writes).toBe(1); expect(reads.some(url => url.includes("cursor=next-page"))).toBe(true); expect(input().value).toBe("");
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("committed"));
  });
  it("requires an exact delete confirmation, defaults to cancel, and consumes it once", async () => {
    let deletes = 0; let finish!: (response: Response) => void;
    await mount(async (_url, init) => {
      if (init?.method !== "DELETE") return Response.json({ items: [view()] });
      deletes++; return new Promise(resolve => { finish = resolve; });
    });
    await click('button[aria-label="Delete saved view: Docs"]');
    expect(deletes).toBe(0); expect(browser.document.activeElement?.hasAttribute("data-cancel-action")).toBe(true);
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("blocked"));
    await click("[data-cancel-action]"); expect(deletes).toBe(0);
    await click('button[aria-label="Delete saved view: Docs"]');
    const confirm = props<{ onClick: () => void }>(container.querySelector("[data-confirm-action]") as HTMLElement).onClick;
    await act(async () => { confirm(); confirm(); }); expect(deletes).toBe(1);
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("blocked"));
    await act(async () => { finish(new Response(null, { status: 204 })); await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(container.querySelector('button[aria-label="Delete saved view: Docs"]')).toBeNull();
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("committed"));
  });
  it("reserves one create synchronously and blocks leave while pending or unknown without clearing the name", async () => {
    let fail!: (error: Error) => void; let writes = 0;
    await mount(async (_url, init) => {
      if (init?.method !== "POST") return Response.json({ items: [] });
      writes++; return new Promise<Response>((_resolve, reject) => { fail = reject; });
    });
    await act(async () => { edit("Docs"); submit(); submit(); expect(writeWorkspaceHistory("push", "/knowledge")).toBe("blocked"); });
    expect(writes).toBe(1); expect(input().value).toBe("Docs");
    await act(async () => fail(new Error("offline")));
    await act(async () => { submit(); expect(writeWorkspaceHistory("push", "/knowledge")).toBe("blocked"); });
    expect(writes).toBe(1); expect(input().value).toBe("Docs"); expect(container.querySelector("[data-confirm-action]")).toBeNull();
  });
  it("keeps the name on canceled navigation and clears it only after admitted discard", async () => {
    await mount(); await act(async () => edit("My docs"));
    await act(async () => expect(writeWorkspaceHistory("push", "/knowledge")).toBe("deferred"));
    expect(input().value).toBe("My docs");
    await click("[data-cancel-action]"); expect(browser.location.pathname).toBe("/search"); expect(input().value).toBe("My docs");
    await act(async () => writeWorkspaceHistory("push", "/knowledge")); await click("[data-confirm-action]");
    expect(browser.location.pathname).toBe("/knowledge"); expect(input().value).toBe("");
  });
});
function props<T>(element: HTMLElement): T { return (element as unknown as Record<string, T>)[Object.keys(element).find(key => key.startsWith("__reactProps$"))!]!; }

function view() { return { id: "view-1", name: "Docs", updatedAt: "2026-10-02T00:00:00.000Z", filters: { v: 1, q: "docs", spaceId: null, collectionId: null, tagIds: [], tagMode: "or" } }; }
