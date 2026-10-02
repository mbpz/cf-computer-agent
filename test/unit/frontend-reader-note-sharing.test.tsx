// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeReaderPage } from "../../frontend/pages/knowledge-reader-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("../../frontend/lib/markdown-renderer", () => ({ renderSafeMarkdown: (text: string) => <div data-test-markdown>{text}</div> }));
const { Window } = await import("happy-dom");

import { registerWorkspaceLeaveGuard, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
describe("private note sharing decisions", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  const locale = createLocaleRuntime({ navigatorLanguage: "en" });
  const revision = { id: "revision-a", knowledgeItemId: "knowledge-a", markdown: "Hello", chunks: [{ id: "chunk-a", startLine: 1, endLine: 2, text: "Hello", ordinal: 0, headingPath: [] }] };
  const note = { id: "note-a", ownerId: "member-a", knowledgeItemId: "knowledge-a", title: "Saved title", body: "Saved body", visibility: "private", access: "owner", citations: [{ revisionId: "revision-a", chunkId: "chunk-a", startLine: 1, endLine: 2 }], updatedAt: "2026-10-02T00:00:00Z" };
  const share = { noteId: "note-a", recipientMemberId: "member-b", createdAt: "2026-10-02T00:00:00Z", revokedAt: null };
  let rows: unknown[]; let writes: string[];
  beforeEach(() => { rows = []; writes = []; browser = new Window({ url: "https://app.test/knowledge/knowledge-a" }); for (const [key, value] of Object.entries({ window: browser, document: browser.document, HTMLElement: browser.HTMLElement, navigator: browser.navigator, history: browser.history, location: browser.location, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); }
  async function render(memberId = "member-a") { await act(async () => root.render(<KnowledgeReaderPage memberId={memberId} revision={revision} renderMarkdown={text => text} locale={locale} />)); await settle(); }
  async function mount(write: (method: string) => Promise<Response> = async method => method === "POST" ? Response.json({ share }, { status: 201 }) : new Response(null, { status: 204 }), read?: () => Response) {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); const method = init?.method ?? "GET";
      if (method !== "GET") { writes.push(method); return write(method); }
      if (url.endsWith("/note")) return Response.json({ note });
      if (url.endsWith("/shares")) return read ? read() : Response.json({ shares: rows });
      return Response.json({ items: [{ id: "member-a", email: "owner@test.dev", role: "admin" }, { id: "member-b", email: "recipient@test.dev", role: "contributor" }] });
    }); await render(); await settle();
  }
  function button(text: string) { return Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(b => b.textContent === text)!; }
  function select() { return container.querySelector("[data-reader-note] select") as HTMLSelectElement; }
  function body() { return container.querySelector("#reader-note-body") as HTMLTextAreaElement; }
  function unload() { const e = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(e); return e.defaultPrevented; }
  async function choose() { await act(async () => { select().value = "member-b"; select().dispatchEvent(new browser.Event("change", { bubbles: true })); }); }
  async function openShare() { await choose(); await act(async () => button("Share").click()); }
  async function confirm() { const b = container.querySelector<HTMLButtonElement>("[data-confirm-action]"); expect(b).not.toBeNull(); await act(async () => b!.click()); await settle(); }
  it("requires exact recipient and saved-note confirmation, with cancellation doing no write", async () => {
    await mount(); await openShare(); expect(writes).toEqual([]); const dialog = container.querySelector("[role=alertdialog]"); expect(dialog?.textContent).toContain("recipient@test.dev"); expect(dialog?.textContent).toContain("Saved title"); expect(unload()).toBe(true);
    await act(async () => (container.querySelector("[data-cancel-action]") as HTMLButtonElement).click()); expect(writes).toEqual([]); expect(unload()).toBe(false);
  });
  it("consumes a confirmed share once and blocks navigation and note edits until receipt", async () => {
    let finish!: (r: Response) => void; await mount(() => new Promise(r => { finish = r; })); await openShare(); const c = container.querySelector("[data-confirm-action]"); expect(c).not.toBeNull(); const accept = props<{onClick: () => void}>(c!).onClick;
    await act(async () => { accept(); accept(); props<{onChange: (e: unknown) => void}>(body()).onChange({ currentTarget: { value: "race" } }); button("Save note").click(); writeWorkspaceHistory("push", "/tasks"); });
    expect(writes).toEqual(["POST"]); expect(body().value).toBe("Saved body"); expect(browser.location.pathname).toBe("/knowledge/knowledge-a"); expect(unload()).toBe(true);
    await act(async () => finish(Response.json({ share }, { status: 201 }))); await settle(); expect(unload()).toBe(false); expect(button("Revoke")).toBeDefined();
  });
  it("keeps unknown share locked and checks without replaying POST", async () => {
    await mount(async () => { throw new TypeError("Failed to fetch"); }); await openShare(); await confirm(); expect(unload()).toBe(true); expect(container.querySelector("[data-note-share-check]")).not.toBeNull();
    await act(async () => (container.querySelector("[data-note-share-check]") as HTMLButtonElement).click()); await settle(); expect(unload()).toBe(true);
    rows = [share]; await act(async () => (container.querySelector("[data-note-share-check]") as HTMLButtonElement).click()); await settle(); expect(unload()).toBe(false); expect(writes).toEqual(["POST"]);
  });
  it("confirms revocation and retains unknown DELETE until a complete read proves absence", async () => {
    rows = [share]; await mount(async () => { throw new TypeError("Failed to fetch"); }); await act(async () => button("Revoke").click()); expect(writes).toEqual([]); await confirm(); expect(unload()).toBe(true);
    rows = []; await act(async () => (container.querySelector("[data-note-share-check]") as HTMLButtonElement).click()); await settle(); expect(unload()).toBe(false); expect(writes).toEqual(["DELETE"]);
  });
  it.each([{ noteId: "wrong" }, { recipientMemberId: "wrong" }, { revokedAt: "2026-10-02T00:00:01Z" }])("does not accept mismatched sharing receipt %j", async extra => {
    await mount(async () => Response.json({ share: { ...share, ...extra } }, { status: 201 })); await openShare(); await confirm(); expect(unload()).toBe(true); expect(container.querySelector("[data-note-share-check]")).not.toBeNull();
  });
  it("refuses malformed share lists instead of proving revoked", async () => {
    let malformed = false; rows = [share]; await mount(async () => { throw new TypeError("Failed to fetch"); }, () => Response.json(malformed ? { shares: [{ invalid: true }] } : { shares: rows })); await act(async () => button("Revoke").click()); await confirm(); malformed = true;
    await act(async () => (container.querySelector("[data-note-share-check]") as HTMLButtonElement).click()); await settle(); expect(unload()).toBe(true); expect(writes).toEqual(["DELETE"]);
  });
  it("does not allow a stale confirmation after cancellation or a member change", async () => {
    await mount(); await openShare(); const c = container.querySelector("[data-confirm-action]"); expect(c).not.toBeNull(); const old = props<{onClick: () => void}>(c!).onClick;
    await act(async () => (container.querySelector("[data-cancel-action]") as HTMLButtonElement).click()); await openShare(); await act(async () => old()); expect(writes).toEqual([]);
    const current = props<{onClick: () => void}>(container.querySelector("[data-confirm-action]")!).onClick; await render("member-c"); await act(async () => current()); expect(writes).toEqual([]);
  });
  it.each([200, 202, 204])("keeps unexpected POST status %i unresolved", async status => {
    await mount(async () => status === 204 ? new Response(null, { status }) : Response.json({ share }, { status })); await openShare(); await confirm(); expect(unload()).toBe(true); expect(writes).toEqual(["POST"]);
  });
  it("does not accept DELETE 202 as revocation or an active row as proof of absence", async () => {
    rows = [share]; await mount(async () => Response.json({}, { status: 202 })); await act(async () => button("Revoke").click()); await confirm();
    await act(async () => (container.querySelector("[data-note-share-check]") as HTMLButtonElement).click()); await settle(); expect(unload()).toBe(true); expect(writes).toEqual(["DELETE"]);
  });
  it.each([{ shares: [{ ...share, noteId: "wrong" }] }, { shares: [share, share] }, {}])("does not infer revoked from invalid complete listing %j", async invalid => {
    let checking = false; rows = [share]; await mount(async () => { throw new TypeError("Failed to fetch"); }, () => Response.json(checking ? invalid : { shares: rows })); await act(async () => button("Revoke").click()); await confirm(); checking = true;
    await act(async () => (container.querySelector("[data-note-share-check]") as HTMLButtonElement).click()); await settle(); expect(unload()).toBe(true);
  });
  it("allows explicit retry after an initial share-list error without issuing writes", async () => {
    let fail = true; await mount(undefined, () => fail ? Response.json({ shares: [{}] }) : Response.json({ shares: [] })); expect(select().disabled).toBe(true); expect(unload()).toBe(false); fail = false;
    await act(async () => (container.querySelector("[data-note-share-retry]") as HTMLButtonElement).click()); await settle(); await openShare(); expect(container.querySelector("[role=alertdialog]")).not.toBeNull(); expect(writes).toEqual([]);
  });
  it("requires list refresh after known pre-write rejection instead of marking success", async () => {
    await mount(async () => Response.json({ error: { code: "PRIVATE_NOTE_SHARE_TARGET_INVALID", message: "Unavailable", retryable: false } }, { status: 404 })); await openShare(); await confirm(); expect(unload()).toBe(false); expect(select().disabled).toBe(true); expect(container.querySelector("[data-note-share-retry]")).not.toBeNull(); expect(button("Revoke")).toBeUndefined();
  });
  it("protects dirty input after a sharing confirmation is canceled", async () => {
    await mount(); await act(async () => props<{onChange: (e: unknown) => void}>(body()).onChange({ currentTarget: { value: "unsaved body" } })); await openShare(); expect(container.querySelector("[role=alertdialog]")?.textContent).toContain("Unsaved edits are not shared");
    await act(async () => (container.querySelector("[data-cancel-action]") as HTMLButtonElement).click()); expect(body().value).toBe("unsaved body"); expect(unload()).toBe(true); expect(writes).toEqual([]);
  });
  it("refuses sharing while a note-save callback has synchronously claimed the write", async () => {
    let finish!: (r: Response) => void; await mount(() => new Promise(r => { finish = r; })); await choose(); const requestShare = props<{onClick: () => void}>(button("Share")).onClick;
    await act(async () => { button("Save note").click(); requestShare(); }); expect(writes).toEqual(["PUT"]); expect(container.querySelector("[role=alertdialog]")).toBeNull();
    await act(async () => finish(Response.json({ note }))); await settle(); expect(unload()).toBe(false);
  });
  it("does not allow sharing from a dirty-navigation confirmation", async () => {
    await mount(); await choose(); const requestShare = props<{onClick: () => void}>(button("Share")).onClick;
    await act(async () => { props<{onChange: (e: unknown) => void}>(body()).onChange({ currentTarget: { value: "dirty" } }); writeWorkspaceHistory("push", "/tasks"); requestShare(); });
    expect(container.querySelectorAll("[role=alertdialog]")).toHaveLength(1); expect(container.querySelector("[role=alertdialog]")?.textContent).not.toContain("recipient@test.dev"); expect(writes).toEqual([]);
  });
  it("ignores a late sharing receipt after a member changes", async () => {
    let finish!: (r: Response) => void; await mount(() => new Promise(r => { finish = r; })); await openShare(); await confirm(); await render("member-c");
    await act(async () => finish(Response.json({ share }, { status: 201 }))); await settle(); expect(button("Revoke")).toBeUndefined(); expect(writes).toEqual(["POST"]); expect(body().value).toBe("");
  });
  it("loads sharing controls after saving a previously absent note", async () => {
    let exists = false; await mount(async () => { exists = true; return Response.json({ note }); }); const original = fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => String(input).endsWith("/note") && !init?.method ? Promise.resolve(Response.json({ note: exists ? note : null })) : original(input, init));
    await act(async () => root.unmount()); root = createRoot(container); await render(); expect(select().disabled).toBe(true);
    await act(async () => { props<{onChange: (e: unknown) => void}>(container.querySelector("#reader-note-title")!).onChange({ currentTarget: { value: "Saved title" } }); props<{onChange: (e: unknown) => void}>(body()).onChange({ currentTarget: { value: "Saved body" } }); button("Save note").click(); });
    await vi.waitFor(async () => { await settle(); expect(select().disabled).toBe(false); }); await openShare(); expect(container.querySelector("[role=alertdialog]")?.textContent).toContain("Saved title"); expect(writes).toEqual(["PUT"]);
  });
  it("invalidates an old row callback after revocation and re-sharing the same recipient", async () => {
    rows = [share]; await mount(); const oldRevoke = props<{onClick: () => void}>(button("Revoke")).onClick; await act(async () => oldRevoke()); await confirm(); await openShare(); await confirm();
    await act(async () => oldRevoke()); expect(container.querySelector("[role=alertdialog]")).toBeNull(); expect(writes).toEqual(["DELETE", "POST"]);
  });
  it("cannot confirm an unknown share from another member's note read", async () => {
    await mount(async () => { throw new TypeError("Failed to fetch"); }); await openShare(); await confirm(); rows = [share]; const original = fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => String(input).endsWith("/note") ? Promise.resolve(Response.json({ note: { ...note, ownerId: "member-c" } })) : original(input, init));
    await act(async () => (container.querySelector("[data-note-share-check]") as HTMLButtonElement).click()); await settle(); expect(unload()).toBe(true); expect(writes).toEqual(["POST"]);
  });
  it("does not offer self-sharing", async () => { await mount(); expect(select().querySelector('option[value="member-a"]')).toBeNull(); });
});
function props<T>(node: Element): T { const key = Object.keys(node).find(key => key.startsWith("__reactProps$")); if (!key) throw new Error("Missing React props"); return (node as unknown as Record<string, T>)[key]; }
