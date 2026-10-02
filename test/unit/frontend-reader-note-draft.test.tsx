// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeReaderRoute } from "../../frontend/app";
import { KnowledgeReaderPage } from "../../frontend/pages/knowledge-reader-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("../../frontend/lib/markdown-renderer", () => ({ renderSafeMarkdown: (text: string) => <div data-test-markdown>{text}</div> }));
const { Window } = await import("happy-dom");

import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
describe("private reader note draft ownership", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const citations = [{ revisionId: "revision-a", chunkId: "chunk-a", startLine: 1, endLine: 2 }];
  const revision = { id: "revision-a", knowledgeItemId: "knowledge-a", markdown: "Hello", chunks: [{ id: "chunk-a", startLine: 1, endLine: 2, text: "Hello", ordinal: 0, headingPath: [] }] };
  const receipt = (extra = {}) => ({ id: "note-a", ownerId: "member-a", knowledgeItemId: "knowledge-a", title: "Title", body: "Body", visibility: "private", access: "owner", citations, createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T00:00:01.000Z", ...extra });
  beforeEach(() => { browser = new Window({ url: "https://app.test/knowledge/knowledge-a" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function render(memberId = "member-a", item = "knowledge-a") { await act(async () => root.render(<KnowledgeReaderPage memberId={memberId} revision={{ ...revision, knowledgeItemId: item }} renderMarkdown={text => text} locale={locale} />)); await settle(); }
  async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
  async function mount(handler: (init?: RequestInit) => Promise<Response> = async () => Response.json({ note: null })) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => String(input).endsWith("/note") ? handler(init) : Response.json(String(input).endsWith("/shares") ? { shares: [] } : { items: [] }));
    await render();
  }
  function title() { return container.querySelector("#reader-note-title") as HTMLInputElement; }
  function body() { return container.querySelector("#reader-note-body") as HTMLTextAreaElement; }
  function edit(name: "title" | "body", value: string) { props<{onChange: (event: unknown) => void}>(name === "title" ? title() : body()).onChange({ currentTarget: { value } }); }
  function save() { return Array.from(container.querySelectorAll<HTMLButtonElement>("[data-reader-note] button")).find(button => /^(Save note|Saving)/.test(button.textContent ?? ""))!; }
  function unloadWarns() { const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); return event.defaultPrevented; }
  async function click(selector: string) { await act(async () => { (container.querySelector(selector) as HTMLButtonElement).click(); }); await settle(); }
  it("requires a successful permission read before accepting edits or saves", async () => {
    let finish!: (value: Response) => void; let writes = 0;
    await mount(init => init?.method === "PUT" ? (writes++, Promise.resolve(Response.json({ note: receipt() }))) : new Promise(resolve => { finish = resolve; }));
    await act(async () => { edit("title", "racing"); save().click(); });
    expect(title().value).toBe(""); expect(writes).toBe(0);
    await act(async () => finish(Response.json({ note: receipt() }))); await settle(); expect(title().value).toBe("Title"); expect(unloadWarns()).toBe(false);
  });
  it("never restores an unscoped legacy cache for a signed-in member", async () => {
    browser.localStorage.setItem("memory-garden:knowledge-note:v1:knowledge-a", JSON.stringify({ v: 1, knowledgeItemId: "knowledge-a", title: "Someone else's secret", body: "secret", visibility: "private", updatedAt: "2026-10-02T00:00:00Z" }));
    await mount(); expect(title().value).toBe(""); expect(body().value).toBe("");
  });
  it("protects dirty notes and only discards after final navigation admission", async () => {
    await mount(); await act(async () => edit("body", "unsaved")); expect(unloadWarns()).toBe(true);
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); });
    expect(browser.location.pathname).toBe("/knowledge/knowledge-a"); expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click("[data-cancel-action]"); expect(body().value).toBe("unsaved");
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); await click("[data-confirm-action]");
    expect(browser.location.pathname).toBe("/tasks"); expect(body().value).toBe(""); expect(unloadWarns()).toBe(false);
  });
  it("submits the latest synchronous draft once and blocks navigation until an exact receipt", async () => {
    let finish!: (value: Response) => void; const sent: unknown[] = [];
    await mount(init => init?.method === "PUT" ? (sent.push(JSON.parse(String(init.body))), new Promise(resolve => { finish = resolve; })) : Promise.resolve(Response.json({ note: null })));
    const submit = props<{onClick: () => void}>(save()).onClick;
    await act(async () => { edit("title", " Title "); edit("body", " Body "); submit(); submit(); writeWorkspaceHistory("push", "/tasks"); });
    expect(sent).toEqual([{ title: "Title", body: "Body", citations }]); expect(browser.location.pathname).toBe("/knowledge/knowledge-a"); expect(unloadWarns()).toBe(true);
    await act(async () => finish(Response.json({ note: receipt() }))); await settle(); expect(unloadWarns()).toBe(false); expect(container.textContent).toContain("Saved");
  });
  it("keeps ambiguous saves locked and only checks the original content without resending", async () => {
    let reads = 0; let writes = 0;
    await mount(async init => { if (init?.method === "PUT") { writes++; throw new TypeError("Failed to fetch"); } reads++; return Response.json({ note: reads === 1 ? null : receipt({ body: reads === 2 ? "different" : "Body" }) }); });
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); await settle();
    expect(container.querySelector("[data-note-check]")).not.toBeNull(); expect(unloadWarns()).toBe(true);
    await click("[data-note-check]"); await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); expect(browser.location.pathname).toBe("/knowledge/knowledge-a"); expect(body().value).toBe("Body");
    await click("[data-note-check]"); expect(unloadWarns()).toBe(false); expect(writes).toBe(1);
  });
  it.each([{ ownerId: "member-b" }, { knowledgeItemId: "knowledge-b" }, { body: "wrong" }, { citations: [] }, { access: "shared" }])("rejects mismatched save receipts %j", async extra => {
    await mount(async init => Response.json({ note: init?.method === "PUT" ? receipt(extra) : null }));
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); await settle();
    expect(container.querySelector("[data-note-check]")).not.toBeNull(); expect(unloadWarns()).toBe(true); expect(body().value).toBe("Body");
  });
  it("invalidates old member callbacks and draft state on member changes", async () => {
    let writes = 0; await mount(async init => { if (init?.method === "PUT") writes++; return Response.json({ note: null }); });
    await act(async () => { edit("title", "Title"); edit("body", "secret-a"); }); const oldSave = props<{onClick: () => void}>(save()).onClick;
    await render("member-b"); await act(async () => { oldSave(); }); expect(body().value).toBe(""); expect(writes).toBe(0); expect(unloadWarns()).toBe(false);
  });
  it("does not treat a malformed read envelope as permission to write", async () => {
    let writes = 0; await mount(async init => { if (init?.method === "PUT") writes++; return Response.json({}); });
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); expect(writes).toBe(0); expect(body().value).toBe("");
  });
  it("restores only the same member's rejected draft as dirty and removes it after a successful save", async () => {
    let reject = true;
    await mount(async init => init?.method === "PUT"
      ? reject ? Response.json({ error: { code: "PRIVATE_NOTE_INVALID", message: "Invalid", retryable: false } }, { status: 400 }) : Response.json({ note: receipt() })
      : Response.json({ note: null }));
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); await settle();
    await render("member-b"); expect(body().value).toBe("");
    await render("member-a"); expect(body().value).toBe("Body"); expect(unloadWarns()).toBe(true);
    reject = false; await act(async () => { save().click(); }); await settle(); expect(unloadWarns()).toBe(false);
    await render("member-b"); await render("member-a"); expect(body().value).toBe("");
  });
  it("does not resurrect a rejected cached draft after an admitted discard", async () => {
    await mount(async init => init?.method === "PUT" ? Response.json({ error: { code: "PRIVATE_NOTE_INVALID", message: "Invalid", retryable: false } }, { status: 400 }) : Response.json({ note: null }));
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); await settle();
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); await click("[data-confirm-action]");
    await render("member-b"); await render("member-a"); expect(body().value).toBe(""); expect(unloadWarns()).toBe(false);
  });
  it.each(["throws", "silently keeps the value"])("refuses discard when cache removal %s, then allows an explicit retry", async mode => {
    await mount(async init => init?.method === "PUT" ? Response.json({ error: { code: "PRIVATE_NOTE_INVALID", message: "Invalid", retryable: false } }, { status: 400 }) : Response.json({ note: null }));
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); await settle();
    const remove = vi.spyOn(browser.localStorage, "removeItem").mockImplementation(() => { if (mode === "throws") throw new Error("Storage unavailable"); });
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); await click("[data-confirm-action]");
    expect(browser.location.pathname).toBe("/knowledge/knowledge-a"); expect(body().value).toBe("Body"); expect(unloadWarns()).toBe(true);
    expect(container.querySelector("[data-note-discard-error]")?.textContent).toContain("cache");
    remove.mockRestore();
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); await click("[data-confirm-action]");
    expect(browser.location.pathname).toBe("/tasks"); expect(body().value).toBe(""); expect(unloadWarns()).toBe(false);
    await render("member-b"); await render("member-a"); expect(body().value).toBe("");
  });
  it("preserves cached recovery when another guard rejects the approved discard", async () => {
    await mount(async init => init?.method === "PUT" ? Response.json({ error: { code: "PRIVATE_NOTE_INVALID", message: "Invalid", retryable: false } }, { status: 400 }) : Response.json({ note: null }));
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); await settle();
    let blocked = false; const unregister = registerWorkspaceLeaveGuard(() => ({ kind: blocked ? "block" : "allow" }));
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); blocked = true; await click("[data-confirm-action]");
    expect(browser.location.pathname).toBe("/knowledge/knowledge-a"); unregister();
    await render("member-b"); await render("member-a"); expect(body().value).toBe("Body"); expect(unloadWarns()).toBe(true);
  });
  it("keeps the cached draft when the user cancels discard", async () => {
    await mount(async init => init?.method === "PUT" ? Response.json({ error: { code: "PRIVATE_NOTE_INVALID", message: "Invalid", retryable: false } }, { status: 400 }) : Response.json({ note: null }));
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); await settle();
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); await click("[data-cancel-action]");
    await render("member-b"); await render("member-a"); expect(body().value).toBe("Body"); expect(browser.location.pathname).toBe("/knowledge/knowledge-a");
  });
  it("does not discard when the cache removal readback fails", async () => {
    await mount(async init => init?.method === "PUT" ? Response.json({ error: { code: "PRIVATE_NOTE_INVALID", message: "Invalid", retryable: false } }, { status: 400 }) : Response.json({ note: null }));
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); await settle();
    const get = vi.spyOn(browser.localStorage, "getItem").mockImplementation(() => { throw new Error("storage denied"); });
    await act(async () => { writeWorkspaceHistory("push", "/tasks"); }); await click("[data-confirm-action]");
    expect(browser.location.pathname).toBe("/knowledge/knowledge-a"); expect(body().value).toBe("Body"); expect(unloadWarns()).toBe(true); get.mockRestore();
  });
  it("keeps a saved draft locked when old cached input cannot be removed, and retries cleanup only by reading", async () => {
    let writes = 0;
    await mount(async init => { if (init?.method === "PUT") { writes++; return writes === 1 ? Response.json({ error: { code: "PRIVATE_NOTE_INVALID", message: "Invalid", retryable: false } }, { status: 400 }) : Response.json({ note: receipt() }); } return Response.json({ note: writes > 1 ? receipt() : null }); });
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); await settle();
    const remove = vi.spyOn(browser.localStorage, "removeItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    await act(async () => { save().click(); }); await settle(); expect(unloadWarns()).toBe(true); expect(container.querySelector("[data-note-check]")).not.toBeNull();
    remove.mockRestore(); await click("[data-note-check]"); expect(unloadWarns()).toBe(false); expect(writes).toBe(2);
  });
  it("keeps shared notes read-only even when an old callback is invoked", async () => {
    let writes = 0; await mount(async init => { if (init?.method === "PUT") writes++; return Response.json({ note: receipt({ ownerId: "member-b", access: "shared" }) }); });
    await act(async () => { edit("body", "mutated"); }); expect(body().value).toBe("Body"); expect(body().readOnly).toBe(true); expect(save()).toBeUndefined(); expect(writes).toBe(0); expect(unloadWarns()).toBe(false);
  });
  it("blocks edits and saves while another navigation guard declines the draft discard", async () => {
    await mount(); let blocked = false; const remove = registerWorkspaceLeaveGuard(() => ({ kind: blocked ? "block" : "allow" }));
    await act(async () => { edit("body", "unsaved"); writeWorkspaceHistory("push", "/tasks"); });
    blocked = true;
    await act(async () => { edit("body", "overwrite"); }); await click("[data-confirm-action]");
    expect(body().value).toBe("unsaved"); expect(browser.location.pathname).toBe("/knowledge/knowledge-a"); expect(unloadWarns()).toBe(true); remove();
  });
  it("retries failed permission reads explicitly before accepting input", async () => {
    let reads = 0; await mount(async () => { if (++reads === 1) throw new TypeError("Failed to fetch"); return Response.json({ note: null }); });
    expect(title().readOnly).toBe(true); await click("[data-note-load-retry]"); await act(async () => edit("body", "recovered")); expect(body().value).toBe("recovered"); expect(unloadWarns()).toBe(true);
  });
  it.each([202, 204])("does not accept HTTP %i as a completed save", async status => {
    await mount(async init => init?.method === "PUT" ? status === 204 ? new Response(null, { status }) : Response.json({ note: receipt() }, { status }) : Response.json({ note: null }));
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); }); await settle(); expect(unloadWarns()).toBe(true); expect(container.querySelector("[data-note-check]")).not.toBeNull();
  });

  it("wires the member identity through the real reader route and aborts a previous member's pending note load", async () => {
    let finish!: (value: Response) => void; let oldSignal: AbortSignal | null | undefined; let reads = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/knowledge/knowledge-a") return Response.json({ knowledge: { currentRevision: revision } });
      if (url.endsWith("/note")) { if (++reads === 1) { oldSignal = init?.signal; return new Promise<Response>(resolve => { finish = resolve; }); } return Response.json({ note: null }); }
      return Response.json(url.endsWith("/shares") ? { shares: [] } : { items: [] });
    });
    await act(async () => root.render(<KnowledgeReaderRoute locale={locale} memberId="member-a" knowledgeItemId="knowledge-a" />)); await settle();
    expect(title().readOnly).toBe(true);
    await act(async () => root.render(<KnowledgeReaderRoute locale={locale} memberId="member-b" knowledgeItemId="knowledge-a" />)); await settle();
    expect(oldSignal?.aborted).toBe(true);
    await vi.waitFor(async () => { await settle(); expect(title().readOnly).toBe(false); });
    expect(reads).toBe(2); await act(async () => edit("body", "member-b draft"));
    expect(body().value).toBe("member-b draft");
    await act(async () => finish(Response.json({ note: receipt() }))); await settle();
    expect(body().value).toBe("member-b draft"); expect(unloadWarns()).toBe(true);
  });
  it("ignores a late save receipt and stale editor callback after changing knowledge item", async () => {
    let finish!: (value: Response) => void;
    await mount(init => init?.method === "PUT" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(Response.json({ note: null })));
    const oldEdit = props<{onChange: (event: unknown) => void}>(body()).onChange;
    await act(async () => { edit("title", "Title"); edit("body", "Body"); save().click(); });
    await render("member-a", "knowledge-b");
    await act(async () => { oldEdit({ currentTarget: { value: "leak" } }); finish(Response.json({ note: receipt() })); }); await settle();
    expect(body().value).toBe(""); expect(unloadWarns()).toBe(false); expect(container.querySelector("[data-reader-note] [role=status]")?.textContent).not.toBe("Saved");
  });

});
function props<T>(element: Element): T { const key = Object.keys(element).find(key => key.startsWith("__reactProps$")); if (!key) throw new Error("React props not found"); return (element as unknown as Record<string, T>)[key]!; }
