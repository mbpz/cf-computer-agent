// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeReaderRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";
vi.mock("../../frontend/lib/markdown-renderer", () => ({ renderSafeMarkdown: (text: string) => <div data-test-markdown>{text}</div> }));
const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");


const locale = createLocaleRuntime({ navigatorLanguage: "en" });
const prefix = "/api/knowledge/knowledge-a";
const sectionNames = ["favorite", "related", "backlinks"];
const stamp = "2026-10-10T00:00:00.000Z";
const diffPath = `${prefix}/revisions/revision-old/diff/revision-a`;
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const deny = (status: number) => Response.json({ error: { code: "DENIED", message: "Denied" } }, { status });
function reply(url: URL) {
  if (url.pathname.includes("/diff/")) return Response.json({ diff: { fromRevisionId: "revision-old", toRevisionId: "revision-a", changed: true, metadataChanges: [], stats: { added: 1, removed: 0, unchanged: 0, truncated: false }, hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: "added", text: "Private diff", oldLine: null, newLine: 1 }] }] } });
  if (url.pathname.endsWith("/favorite")) return Response.json({ favorite: false });
  if (url.pathname.endsWith("/related")) return Response.json({ related: { items: [{ id: "related-a", title: "Private related", publishedAt: stamp, reasonFields: ["title"] }] } });
  if (url.pathname.endsWith("/backlinks")) return Response.json({ backlinks: { items: [{ id: "backlink-a", revisionId: "back-rev", chunkId: "back-chunk", title: "Private backlink", publishedAt: stamp, startLine: 1, endLine: 1 }] } });
  if (url.pathname.endsWith("/note")) return Response.json({ note: null });
  if (/^\/api\/knowledge\/knowledge-[ab]$/.test(url.pathname)) {
    const id = url.pathname.split("/").at(-1)!;
    return Response.json({ knowledge: { currentRevision: { id: "revision-a", knowledgeItemId: id, title: `Private ${id}`, markdown: `Private body ${id}`, publishedAt: stamp, isCurrent: true, previousRevisionId: "revision-old", sourceVersionId: "source-a", indexStatus: "indexed", chunks: [] } } });
  }
  return Response.json({ items: [], shares: [] });
}
async function flush() { for (let i = 0; i < 4; i++) await act(async () => { await new Promise(done => setTimeout(done, 0)); }); }
describe("knowledge reader composite read ownership", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  let respond: (url: URL, init?: RequestInit) => Response | Promise<Response>;
  let requests: { url: URL; init?: RequestInit }[];
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/knowledge/knowledge-a" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, history: browser.history, location: browser.location, HTMLElement: browser.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) vi.stubGlobal(key, value);
    const element = browser.document.createElement("div"); browser.document.body.append(element); container = element as unknown as HTMLElement;
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    requests = []; respond = reply;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => { const url = new URL(String(input), "https://app.test"); requests.push({ url, init }); return Promise.resolve(respond(url, init)); });
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function mount(memberId = "member-a", knowledgeItemId = "knowledge-a") { await act(async () => root.render(<KnowledgeReaderRoute locale={locale} memberId={memberId} knowledgeItemId={knowledgeItemId} />)); await flush(); }
  function button(label: string) { const target = [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label); expect(target).toBeDefined(); return target!; }
  async function compare() { await act(async () => button("Compare with previous").click()); await flush(); }
  function expectCleared() { expect(container.querySelector("[data-reader-layout]")).toBeNull(); expect(container.textContent).not.toContain("Private"); expect(container.textContent).toContain("Unable to load this knowledge entry."); }
  function readRequests() { return requests.filter(r => sectionNames.some(name => r.url.pathname.endsWith(`/${name}`)) || r.url.pathname.includes("/diff/")); }

  it.each(sectionNames.flatMap(name => [401, 403].map(status => ({ name, status }))))("revokes body and all panels on $name $status, aborting and retiring late reads", async ({ name, status }) => {
    const failure = deferred<Response>(); const lateDiff = deferred<Response>();
    respond = url => url.pathname === `${prefix}/${name}` ? failure.promise : url.pathname === diffPath ? lateDiff.promise : reply(url);
    await mount(); expect(container.textContent).toContain("Private body knowledge-a");
    await compare();
    await act(async () => failure.resolve(deny(status))); await flush();
    expectCleared();
    expect(readRequests().every(request => request.init?.signal?.aborted === true)).toBe(true);
    await act(async () => lateDiff.resolve(reply(new URL(diffPath, "https://app.test")))); await flush();
    expectCleared();
    const before = requests.length; await flush(); expect(requests).toHaveLength(before);
  });

  it.each([401, 403])("revokes reader on diff %s and does not accept late siblings", async status => {
    const late = deferred<Response>();
    respond = url => url.pathname.endsWith("/related") ? late.promise : url.pathname === diffPath ? deny(status) : reply(url);
    await mount(); await compare(); expectCleared();
    await act(async () => late.resolve(reply(new URL(`${prefix}/related`, "https://app.test")))); await flush(); expectCleared();
  });

  it("aborts all auxiliary reads and diff when leaving the reader", async () => {
    const pending = deferred<Response>(); respond = url => sectionNames.some(name => url.pathname.endsWith(`/${name}`)) || url.pathname.includes("/diff/") ? pending.promise : reply(url);
    await mount(); await compare(); expect(readRequests()).toHaveLength(4);
    await act(async () => root.render(<div>Other route</div>));
    expect(readRequests().every(request => request.init?.signal?.aborted === true)).toBe(true);
    await act(async () => pending.resolve(deny(403))); await flush(); expect(container.textContent).toBe("Other route");
  });

  it.each(["member", "target"])("retires old requests on %s switch without revoking the next reader", async kind => {
    const pending = deferred<Response>(); respond = url => url.pathname.endsWith("/related") ? pending.promise : reply(url);
    await mount(); const oldReads = readRequests();
    respond = reply; await mount(kind === "member" ? "member-b" : "member-a", kind === "target" ? "knowledge-b" : "knowledge-a");
    expect(oldReads.every(request => request.init?.signal?.aborted === true)).toBe(true);
    await act(async () => pending.resolve(deny(403))); await flush();
    expect(container.querySelector("[data-reader-layout]")).not.toBeNull(); expect(container.textContent).toContain("Private body");
  });

  it("reserves a diff synchronously against two clicks in one event", async () => {
    const pending = deferred<Response>(); respond = url => url.pathname.includes("/diff/") ? pending.promise : reply(url);
    await mount(); const target = button("Compare with previous");
    await act(async () => { target.click(); target.click(); });
    expect(requests.filter(request => request.url.pathname === diffPath)).toHaveLength(1);
    await act(async () => pending.resolve(reply(new URL(diffPath, "https://app.test")))); await flush();
    expect(container.textContent).toContain("Private diff");
  });

  it.each(sectionNames)("preserves authorized body on ordinary %s failure", async name => {
    respond = url => url.pathname === `${prefix}/${name}` ? deny(500) : reply(url);
    await mount(); expect(container.textContent).toContain("Private body knowledge-a");
    expect(container.querySelector("[data-reader-layout]")).not.toBeNull();
  });

  it("releases a failed diff for explicit retry without reloading the body", async () => {
    respond = url => url.pathname === diffPath ? deny(500) : reply(url);
    await mount(); await compare(); expect(container.textContent).toContain("Private body knowledge-a");
    respond = reply; await compare(); expect(container.textContent).toContain("Private diff");
    expect(requests.filter(request => request.url.pathname === prefix)).toHaveLength(1);
  });

  it("recovers only by explicit reauthorization and ignores a prior epoch failure", async () => {
    const related = deferred<Response>(); const backlink = deferred<Response>();
    respond = url => url.pathname.endsWith("/related") ? related.promise : url.pathname.endsWith("/backlinks") ? backlink.promise : reply(url);
    await mount(); await act(async () => related.resolve(deny(403))); await flush(); expectCleared();
    respond = reply; await act(async () => button("Try again").click()); await flush();
    expect(container.textContent).toContain("Private body knowledge-a");
    await act(async () => backlink.resolve(deny(401))); await flush();
    expect(container.textContent).toContain("Private body knowledge-a");
    expect(requests.every(request => !request.init?.method || request.init.method === "GET")).toBe(true);
  });
});
