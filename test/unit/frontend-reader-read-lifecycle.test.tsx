// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeReaderRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
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
  const mutations = () => requests.filter(r => ["PUT", "DELETE"].includes(r.init?.method ?? ""));
  const favoriteReads = () => requests.filter(r => r.url.pathname.endsWith("/favorite") && !r.init?.method);
  const mutationReply = () => Response.json({ favorite: { knowledgeItemId: "knowledge-a" } });
  async function addFavorite() { await act(async () => button("Add to favorites").click()); await flush(); }
  async function checkFavorite() { await act(async () => button("Read current favorite").click()); await flush(); }
  function noFavoriteAction() { expect([...container.querySelectorAll("button")].some(b => ["Add to favorites", "Remove from favorites"].includes(b.textContent ?? "") && !b.disabled)).toBe(false); }

  it("reserves one favorite write before same-event clicks and blocks navigation until its receipt", async () => {
    const pending = deferred<Response>(); respond = (url, init) => init?.method === "PUT" ? pending.promise : reply(url);
    await mount(); const target = button("Add to favorites");
    await act(async () => { target.click(); target.click(); });
    expect(mutations()).toHaveLength(1); expect(target.disabled).toBe(true);
    await act(async () => { writeWorkspaceHistory("push", "/knowledge"); });
    expect(browser.location.pathname).toBe("/knowledge/knowledge-a");
    const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    await act(async () => pending.resolve(mutationReply())); await flush();
    expect(button("Remove from favorites").getAttribute("aria-pressed")).toBe("true");
    await act(async () => { writeWorkspaceHistory("push", "/knowledge"); }); expect(browser.location.pathname).toBe("/knowledge");
  });

  it.each(["lost", "invalid", "server"])("keeps %s favorite results unknown until an explicit matching read, without replay", async kind => {
    respond = (url, init) => init?.method === "PUT" ? kind === "lost" ? Promise.reject(new TypeError("Failed to fetch")) : kind === "invalid" ? Response.json({ favorite: { knowledgeItemId: "other" } }) : deny(503) : reply(url);
    await mount(); await addFavorite(); noFavoriteAction();
    expect(container.textContent).toContain("Favorite result is unconfirmed");
    expect(favoriteReads()).toHaveLength(1); expect(mutations()).toHaveLength(1);
    await checkFavorite(); noFavoriteAction(); // false cannot prove the original PUT failed
    respond = url => url.pathname.endsWith("/favorite") ? Response.json({ favorite: true }) : reply(url);
    await checkFavorite(); expect(button("Remove from favorites").getAttribute("aria-pressed")).toBe("true"); expect(mutations()).toHaveLength(1);
  });

  it("keeps a failed removal unknown and resolves only a false read", async () => {
    respond = (url, init) => init?.method === "DELETE" ? Promise.reject(new TypeError("lost")) : url.pathname.endsWith("/favorite") ? Response.json({ favorite: true }) : reply(url);
    await mount(); await act(async () => button("Remove from favorites").click()); await flush(); noFavoriteAction();
    await checkFavorite(); noFavoriteAction();
    respond = reply; await checkFavorite(); expect(button("Add to favorites").getAttribute("aria-pressed")).toBe("false"); expect(mutations().map(r => r.init?.method)).toEqual(["DELETE"]);
  });

  it("keeps unknown intent through remount, isolates members, and never replays on mount", async () => {
    respond = (url, init) => init?.method === "PUT" ? Promise.reject(new TypeError("lost")) : reply(url);
    await mount(); await addFavorite(); await act(async () => root.render(<div>Replacement</div>));
    await mount("member-b"); expect(button("Add to favorites").disabled).toBe(false);
    await mount(); noFavoriteAction(); expect(container.textContent).toContain("Favorite result is unconfirmed"); expect(mutations()).toHaveLength(1);
    respond = url => url.pathname.endsWith("/favorite") ? Response.json({ favorite: true }) : reply(url);
    await checkFavorite(); expect(button("Remove from favorites").disabled).toBe(false);
  });

  it.each([401, 403])("revokes private content on favorite write %s and preserves the unresolved intent", async status => {
    respond = (url, init) => init?.method === "PUT" ? deny(status) : reply(url);
    await mount(); await addFavorite(); expectCleared();
    respond = reply; await act(async () => button("Try again").click()); await flush();
    noFavoriteAction(); expect(container.textContent).toContain("Favorite result is unconfirmed"); expect(mutations()).toHaveLength(1);
  });

  it("ignores a retired write receipt after reauthorization and checks without issuing a second write", async () => {
    const pending = deferred<Response>(); const related = deferred<Response>();
    respond = (url, init) => init?.method === "PUT" ? pending.promise : url.pathname.endsWith("/related") ? related.promise : reply(url);
    await mount(); await addFavorite(); await act(async () => related.resolve(deny(403))); await flush(); expectCleared();
    respond = reply; await act(async () => button("Try again").click()); await flush();
    await act(async () => pending.resolve(mutationReply())); await flush(); noFavoriteAction();
    expect(container.textContent).toContain("Favorite result is unconfirmed"); expect(mutations()).toHaveLength(1);
  });

  it("deduplicates recovery reads, keeps read errors locked, and cancels recovery on unmount", async () => {
    respond = (url, init) => init?.method === "PUT" ? deny(503) : reply(url);
    await mount(); await addFavorite();
    const pending = deferred<Response>(); respond = url => url.pathname.endsWith("/favorite") ? pending.promise : reply(url);
    const check = button("Read current favorite"); await act(async () => { check.click(); check.click(); });
    expect(favoriteReads()).toHaveLength(2); noFavoriteAction();
    const read = favoriteReads().at(-1)!; await act(async () => root.render(<div>Replacement</div>)); expect(read.init?.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(Response.json({ favorite: true }))); await flush(); expect(container.textContent).toBe("Replacement");
  });

  it("recovers an initial favorite GET failure without a write or a full reader reload", async () => {
    respond = url => url.pathname.endsWith("/favorite") ? deny(503) : reply(url);
    await mount(); noFavoriteAction(); respond = reply; await checkFavorite();
    expect(button("Add to favorites").disabled).toBe(false); expect(mutations()).toHaveLength(0);
    expect(requests.filter(r => r.url.pathname === prefix)).toHaveLength(1);
  });

  it("does not send a write when tab storage cannot preserve its intent", async () => {
    await mount(); vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await addFavorite(); expect(mutations()).toHaveLength(0); noFavoriteAction();
  });

  it.each([401, 403])("revokes the entire reader on favorite recovery %s without replay", async status => {
    respond = (url, init) => init?.method === "PUT" ? deny(503) : reply(url);
    await mount(); await addFavorite();
    respond = url => url.pathname.endsWith("/favorite") ? deny(status) : reply(url);
    await checkFavorite(); expectCleared(); expect(mutations()).toHaveLength(1);
  });

  it("retains an unknown write when recovery fails ordinarily, then permits another read", async () => {
    respond = (url, init) => init?.method === "PUT" ? deny(503) : reply(url);
    await mount(); await addFavorite();
    respond = url => url.pathname.endsWith("/favorite") ? deny(503) : reply(url);
    await checkFavorite(); noFavoriteAction(); expect(container.textContent).toContain("Private body");
    await act(async () => { writeWorkspaceHistory("push", "/knowledge"); }); expect(browser.location.pathname).toBe("/knowledge/knowledge-a");
    respond = url => url.pathname.endsWith("/favorite") ? Response.json({ favorite: true }) : reply(url);
    await checkFavorite(); expect(button("Remove from favorites").disabled).toBe(false); expect(mutations()).toHaveLength(1);
  });

  it("does not settle a record if successful write cleanup fails; a matching read retries cleanup only", async () => {
    await mount(); const remove = vi.spyOn(browser.sessionStorage, "removeItem").mockImplementation(() => { throw new Error("storage"); });
    respond = (url, init) => init?.method === "PUT" ? mutationReply() : reply(url);
    await addFavorite(); noFavoriteAction();
    remove.mockRestore(); respond = url => url.pathname.endsWith("/favorite") ? Response.json({ favorite: true }) : reply(url);
    await checkFavorite(); expect(button("Remove from favorites").disabled).toBe(false); expect(mutations()).toHaveLength(1);
    await act(async () => root.render(<div>Other</div>)); await mount(); expect(button("Remove from favorites").disabled).toBe(false);
  });

  it("does not clear another operation's record with a stale successful receipt", async () => {
    const pending = deferred<Response>(); respond = (url, init) => init?.method === "PUT" ? pending.promise : reply(url);
    await mount(); await addFavorite();
    const key = "memory-garden:reader-favorite-intent:v1:member-a:knowledge-a";
    const replacement = JSON.stringify({ v: 1, member: "member-a", item: "knowledge-a", intent: { id: "other-op", desired: false } });
    browser.sessionStorage.setItem(key, replacement);
    await act(async () => pending.resolve(mutationReply())); await flush(); noFavoriteAction(); expect(browser.sessionStorage.getItem(key)).toBe(replacement);
  });

  it("leaves an unresolved record intact and ignores write denial after changing members", async () => {
    const pending = deferred<Response>(); respond = (url, init) => init?.method === "PUT" ? pending.promise : reply(url);
    await mount(); await addFavorite(); await mount("member-b");
    await act(async () => pending.resolve(deny(403))); await flush(); expect(button("Add to favorites").disabled).toBe(false); expect(container.textContent).toContain("Private body");
    await mount(); noFavoriteAction(); expect(mutations()).toHaveLength(1);
  });

  it.each(["corrupt", "wrong-member", "wrong-target"])("fails closed for a %s favorite recovery record", async kind => {
    browser.sessionStorage.setItem("memory-garden:reader-favorite-intent:v1:member-a:knowledge-a", kind === "corrupt" ? "{" : JSON.stringify({ v: 1, member: kind === "wrong-member" ? "member-b" : "member-a", item: kind === "wrong-target" ? "knowledge-b" : "knowledge-a", intent: { id: "operation-a", desired: true } }));
    await mount(); noFavoriteAction(); expect(container.textContent).toContain("recovery record is unavailable");
    await checkFavorite(); expect(mutations()).toHaveLength(0); noFavoriteAction();
  });

  it("does not render a diff whose revision pair differs from the comparison request", async () => {
    respond = async url => {
      const result = reply(url);
      if (!url.pathname.includes("/diff/")) return result;
      const body = await result.json() as { diff: { fromRevisionId: string } }; body.diff.fromRevisionId = "wrong-version";
      return Response.json(body);
    };
    await mount(); await compare(); expect(container.querySelector("[data-revision-diff]")).toBeNull();
    expect(container.textContent).toContain("Unable to load revision changes."); expect(container.textContent).toContain("Private body");
  });

});
