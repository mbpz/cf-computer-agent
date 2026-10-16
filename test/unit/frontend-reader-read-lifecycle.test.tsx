// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeReaderRoute } from "../../frontend/app";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
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
  function expectCleared() {
    expect(container.querySelector("[data-reader-layout]")).toBeNull();
    expect(container.textContent).not.toContain("Private");
    // A revoked read is its own state: no generic retryable error, and no private
    // note, shares, favorite, links or body left anywhere in the DOM.
    expect(container.querySelector("[data-page-state='forbidden']")).not.toBeNull();
    expect(container.querySelector("[data-page-state='error']")).toBeNull();
    expect(container.textContent).toContain(frontendText(locale, "KNOWLEDGE_READER_REVOKED"));
    expect(container.querySelector("[data-reader-note]")).toBeNull();
    expect(container.querySelector("[data-related-knowledge]")).toBeNull();
    expect(container.querySelector("[data-backlinks]")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("[data-test-markdown]")).toBeNull();
    expect([...container.querySelectorAll("button")].some((button) => /favorite/i.test(button.textContent ?? ""))).toBe(false);
  }
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

  it.each(["related", "backlinks"] as const)("retries only the failed %s panel and never re-issues the body, favorite, or diff", async name => {
    let attempts = 0;
    respond = url => {
      if (url.pathname === `${prefix}/${name}`) { attempts += 1; if (attempts === 1) return deny(500); }
      return reply(url);
    };
    await mount(); await compare();
    expect(container.textContent).toContain("Private body knowledge-a");
    expect(container.querySelector(panelSelector[name])!.textContent).toContain("could not be read");
    const sibling = name === "related" ? "backlinks" : "related";
    const siblingBefore = count(`${prefix}/${sibling}`);
    await act(async () => panelRetry(name).click()); await flush();
    expect(attempts).toBe(2);
    expect(container.querySelector(panelSelector[name])!.textContent).toContain(name === "related" ? "Private related" : "Private backlink");
    expect(count(`${prefix}/${name}`)).toBe(2);
    expect(count(`${prefix}/${sibling}`)).toBe(siblingBefore);
    expect(container.querySelector(panelSelector[sibling])!.textContent).toContain(sibling === "related" ? "Private related" : "Private backlink");
    expect(count(prefix)).toBe(1);
    expect(count(`${prefix}/favorite`)).toBe(1);
    expect(count(diffPath)).toBe(1);
  });

  it.each(["related", "backlinks"] as const)("reserves one %s panel retry against two clicks in one event", async name => {
    const pending = deferred<Response>();
    let attempts = 0;
    respond = url => {
      if (url.pathname === `${prefix}/${name}`) { attempts += 1; return attempts === 1 ? deny(500) : pending.promise; }
      return reply(url);
    };
    await mount();
    const target = panelRetry(name);
    await act(async () => { target.click(); target.click(); });
    expect(attempts).toBe(2);
    await act(async () => pending.resolve(reply(new URL(`${prefix}/${name}`, "https://app.test")))); await flush();
    expect(container.querySelector(panelSelector[name])!.textContent).toContain(name === "related" ? "Private related" : "Private backlink");
  });

  it.each(["related", "backlinks"] as const)("hides the %s retry control while only that panel is loading again", async name => {
    const pending = deferred<Response>();
    let attempts = 0;
    respond = url => {
      if (url.pathname === `${prefix}/${name}`) { attempts += 1; return attempts === 1 ? deny(500) : pending.promise; }
      return reply(url);
    };
    await mount();
    const sibling = name === "related" ? "backlinks" : "related";
    await act(async () => panelRetry(name).click());
    const controls = [...container.querySelector(panelSelector[name])!.querySelectorAll("button")].map(candidate => candidate.textContent);
    expect(controls).not.toContain(retryLabel[name]);
    expect(container.querySelector(panelSelector[name])!.textContent).toContain(name === "related" ? "Finding related knowledge" : "Finding backlinks");
    expect(container.querySelector(panelSelector[sibling])!.textContent).toContain(sibling === "related" ? "Private related" : "Private backlink");
    expect(container.textContent).toContain("Private body knowledge-a");
    await act(async () => pending.resolve(reply(new URL(`${prefix}/${name}`, "https://app.test")))); await flush();
    expect(container.querySelector(panelSelector[name])!.textContent).toContain(name === "related" ? "Private related" : "Private backlink");
  });

  it("retries a failed panel without cancelling a still-pending sibling read", async () => {
    const backlinks = deferred<Response>();
    let attempts = 0;
    respond = url => {
      if (url.pathname === `${prefix}/related`) { attempts += 1; return attempts === 1 ? deny(500) : reply(url); }
      if (url.pathname === `${prefix}/backlinks`) return backlinks.promise;
      return reply(url);
    };
    await mount();
    const siblingRequest = requests.filter(request => request.url.pathname === `${prefix}/backlinks`).at(-1)!;
    expect(container.querySelector(panelSelector.backlinks)!.textContent).toContain("Finding backlinks");
    await act(async () => panelRetry("related").click()); await flush();
    expect(attempts).toBe(2);
    expect(container.querySelector(panelSelector.related)!.textContent).toContain("Private related");
    expect(siblingRequest.init?.signal?.aborted).toBe(false);
    await act(async () => backlinks.resolve(reply(new URL(`${prefix}/backlinks`, "https://app.test")))); await flush();
    expect(container.querySelector(panelSelector.backlinks)!.textContent).toContain("Private backlink");
  });

  it.each([401, 403])("revokes the whole reader when a panel retry is denied with %s", async status => {
    let attempts = 0;
    respond = url => {
      if (url.pathname === `${prefix}/related`) { attempts += 1; return attempts === 1 ? deny(500) : deny(status); }
      return reply(url);
    };
    await mount();
    await act(async () => panelRetry("related").click()); await flush();
    expectCleared();
    expect(count(prefix)).toBe(1);
    expect(count(`${prefix}/favorite`)).toBe(1);
  });

  it("ignores a superseded panel retry response and never lets it repaint the current reader", async () => {
    const stale = deferred<Response>();
    let attempts = 0;
    let held = false;
    respond = url => {
      if (url.pathname === `${prefix}/related`) {
        attempts += 1;
        if (attempts === 1) return deny(500);
        if (held) return stale.promise;
      }
      return reply(url);
    };
    await mount();
    held = true;
    await act(async () => panelRetry("related").click());
    const retryRequest = requests.filter(request => request.url.pathname === `${prefix}/related`).at(-1)!;
    held = false;
    await mount("member-b");
    expect(retryRequest.init?.signal?.aborted).toBe(true);
    await act(async () => stale.resolve(Response.json({ related: { items: [{ id: "related-stale", title: "Stale related", publishedAt: stamp, reasonFields: ["title"] }] } }))); await flush();
    expect(container.textContent).toContain("Private body knowledge-a");
    expect(container.querySelector(panelSelector.related)!.textContent).toContain("Private related");
    expect(container.textContent).not.toContain("Stale related");
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

  it.each([401, 403])("re-authorizes the note, shares, links and favorite behind an explicit %s revocation", async (status) => {
    const privateNote = { id: "note-a", ownerId: "member-a", knowledgeItemId: "knowledge-a", title: "Private note title", body: "Private note body", visibility: "private", access: "owner", citations: [{ revisionId: "revision-a", chunkId: "chunk-a", startLine: 1, endLine: 2 }], updatedAt: stamp };
    const activeShare = { noteId: "note-a", recipientMemberId: "member-b", createdAt: stamp, revokedAt: null };
    let revoked = false;
    respond = url => {
      if (url.pathname.endsWith("/note")) return Response.json({ note: privateNote });
      if (url.pathname.endsWith("/shares")) return Response.json({ shares: [activeShare] });
      if (url.pathname.endsWith("/favorite")) return Response.json({ favorite: true });
      if (url.pathname === diffPath) return revoked ? deny(status) : reply(url);
      return reply(url);
    };
    await mount();
    expect(container.querySelector("[data-test-markdown]")!.textContent).toContain("Private body knowledge-a");
    const note = container.querySelector("[data-reader-note]")!;
    expect(note).not.toBeNull();
    expect((note.querySelector("#reader-note-body") as HTMLTextAreaElement).value).toBe("Private note body");
    expect(note.textContent).toContain("member-b");
    expect(container.textContent).toContain("Private related");
    expect(container.textContent).toContain("Private backlink");
    expect(button("Remove from favorites").getAttribute("aria-pressed")).toBe("true");

    revoked = true;
    await compare();
    expectCleared();
    expect(container.textContent).not.toContain("Private note body");
    expect(container.textContent).not.toContain("member-b");
    expect(container.querySelectorAll("select")).toHaveLength(0);
    expect(container.textContent).not.toContain("Private related");
    expect(container.textContent).not.toContain("Private backlink");

    revoked = false;
    await act(async () => button("Try again").click()); await flush();
    expect(container.querySelector("[data-test-markdown]")!.textContent).toContain("Private body knowledge-a");
    expect((container.querySelector("#reader-note-body") as HTMLTextAreaElement).value).toBe("Private note body");
    expect(container.textContent).toContain("Private related");
    expect(container.textContent).toContain("Private backlink");
    expect(button("Remove from favorites").getAttribute("aria-pressed")).toBe("true");
    expect(requests.every(request => !request.init?.method || request.init.method === "GET")).toBe(true);
  });
  const mutations = () => requests.filter(r => ["PUT", "DELETE"].includes(r.init?.method ?? ""));
  const favoriteReads = () => requests.filter(r => r.url.pathname.endsWith("/favorite") && !r.init?.method);
  const operationPrefix = "/api/knowledge/favorites/operations/";
  const recordKey = "memory-garden:reader-favorite-intent:v1:member-a:knowledge-a";
  const foreignOpReceipt = (operationId: string, favorited: boolean) => ({ operationId, kind: favorited ? "knowledge.favorite.add" : "knowledge.favorite.remove", knowledgeItemId: "knowledge-a", favorited, createdAt: stamp });
  const foreignOpReply = (operationId: string, favorited: boolean) => Response.json({ operation: foreignOpReceipt(operationId, favorited) });
  const panelSelector = { related: "[data-related-knowledge]", backlinks: "[data-backlinks]" } as const;
  const retryLabel = { related: "Retry related knowledge", backlinks: "Retry backlinks" } as const;
  const operationReads = () => requests.filter(r => r.url.pathname.startsWith(operationPrefix));
  const count = (pathname: string) => requests.filter(r => r.url.pathname === pathname).length;
  function panelRetry(name: "related" | "backlinks"): HTMLButtonElement {
    const target = [...container.querySelector(panelSelector[name])!.querySelectorAll<HTMLButtonElement>("button")]
      .find(candidate => candidate.textContent === retryLabel[name]);
    expect(target, `${name} retry control`).toBeDefined();
    return target!;
  }
  function mutationOperationId(method: "PUT" | "DELETE" = "PUT"): string {
    const request = requests.find(r => r.init?.method === method);
    expect(request, `${method} request`).toBeDefined();
    const body: unknown = JSON.parse(String(request!.init?.body));
    if (!body || typeof body !== "object" || !("operationId" in body) || typeof body.operationId !== "string") {
      throw new Error(`the ${method} request body has no operation id`);
    }
    return body.operationId;
  }
  // Mirror the server: the receipt carries the operation number the client sent,
  // so a client cannot pass by accepting an unrelated or reused receipt.
  function operationReceipt(operationId: string, favorited: boolean) {
    return {
      operationId,
      kind: favorited ? "knowledge.favorite.add" : "knowledge.favorite.remove",
      knowledgeItemId: "knowledge-a",
      favorited,
      createdAt: stamp,
    };
  }
  const addReply = () => Response.json({ favorite: { knowledgeItemId: "knowledge-a" }, operation: operationReceipt(mutationOperationId("PUT"), true) });
  const receiptReply = (favorited: boolean) => Response.json({ operation: operationReceipt(mutationOperationId(favorited ? "PUT" : "DELETE"), favorited) });
  async function addFavorite() { await act(async () => button("Add to favorites").click()); await flush(); }
  async function checkFavorite() { await act(async () => button("Read current favorite").click()); await flush(); }
  async function signalStorage(key: string | null) { await act(async () => { browser.dispatchEvent(new browser.StorageEvent("storage", { key, storageArea: browser.localStorage })); }); }
  function noFavoriteAction() { expect([...container.querySelectorAll("button")].some(b => ["Add to favorites", "Remove from favorites"].includes(b.textContent ?? "") && !b.disabled)).toBe(false); }

  it("reserves one favorite write before same-event clicks and blocks navigation until its receipt", async () => {
    const pending = deferred<Response>(); respond = (url, init) => init?.method === "PUT" ? pending.promise : reply(url);
    await mount(); const target = button("Add to favorites");
    await act(async () => { target.click(); target.click(); });
    expect(mutations()).toHaveLength(1); expect(target.disabled).toBe(true);
    await act(async () => { writeWorkspaceHistory("push", "/knowledge"); });
    expect(browser.location.pathname).toBe("/knowledge/knowledge-a");
    const event = new browser.Event("beforeunload", { cancelable: true }); browser.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    await act(async () => pending.resolve(addReply())); await flush();
    expect(button("Remove from favorites").getAttribute("aria-pressed")).toBe("true");
    await act(async () => { writeWorkspaceHistory("push", "/knowledge"); }); expect(browser.location.pathname).toBe("/knowledge");
  });

  it.each(["lost", "invalid", "server"])("keeps %s favorite results unknown until an exact operation receipt, without replay", async kind => {
    respond = (url, init) => init?.method === "PUT" ? kind === "lost" ? Promise.reject(new TypeError("Failed to fetch")) : kind === "invalid" ? Response.json({ favorite: { knowledgeItemId: "other" } }) : deny(503) : reply(url);
    await mount(); await addFavorite(); noFavoriteAction();
    expect(container.textContent).toContain("Favorite result is unconfirmed");
    expect(favoriteReads()).toHaveLength(1); expect(mutations()).toHaveLength(1);
    // A boolean read that happens to match the intent is not the server's record
    // of this operation, so it is not requested and cannot settle anything.
    await checkFavorite(); noFavoriteAction();
    expect(favoriteReads()).toHaveLength(1); expect(operationReads()).toHaveLength(1);
    expect(container.textContent).toContain("Favorite result is unconfirmed");
    respond = url => url.pathname.startsWith(operationPrefix) ? receiptReply(true) : reply(url);
    await checkFavorite(); expect(button("Remove from favorites").getAttribute("aria-pressed")).toBe("true"); expect(mutations()).toHaveLength(1);
  });

  it("keeps a failed removal unknown and resolves only the recorded removal receipt", async () => {
    respond = (url, init) => init?.method === "DELETE" ? Promise.reject(new TypeError("lost")) : url.pathname.endsWith("/favorite") ? Response.json({ favorite: true }) : reply(url);
    await mount(); await act(async () => button("Remove from favorites").click()); await flush(); noFavoriteAction();
    // The still-true boolean read is not evidence that the lost DELETE did or did not happen.
    await checkFavorite(); noFavoriteAction(); expect(favoriteReads()).toHaveLength(1);
    respond = url => url.pathname.startsWith(operationPrefix) ? receiptReply(false) : reply(url);
    await checkFavorite(); expect(button("Add to favorites").getAttribute("aria-pressed")).toBe("false"); expect(mutations().map(r => r.init?.method)).toEqual(["DELETE"]);
  });

  it("keeps unknown intent through remount, isolates members, and never replays on mount", async () => {
    respond = (url, init) => init?.method === "PUT" ? Promise.reject(new TypeError("lost")) : reply(url);
    await mount(); await addFavorite(); await act(async () => root.render(<div>Replacement</div>));
    await mount("member-b"); expect(button("Add to favorites").disabled).toBe(false);
    await mount(); noFavoriteAction(); expect(container.textContent).toContain("Favorite result is unconfirmed"); expect(mutations()).toHaveLength(1);
    respond = url => url.pathname.startsWith(operationPrefix) ? receiptReply(true) : reply(url);
    await checkFavorite(); expect(button("Remove from favorites").disabled).toBe(false);
    expect(operationReads()).toHaveLength(1);
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
    await act(async () => pending.resolve(addReply())); await flush(); noFavoriteAction();
    expect(container.textContent).toContain("Favorite result is unconfirmed"); expect(mutations()).toHaveLength(1);
  });

  it("deduplicates recovery reads, keeps read errors locked, and cancels recovery on unmount", async () => {
    respond = (url, init) => init?.method === "PUT" ? deny(503) : reply(url);
    await mount(); await addFavorite();
    const pending = deferred<Response>(); respond = url => url.pathname.startsWith(operationPrefix) ? pending.promise : reply(url);
    const check = button("Read current favorite"); await act(async () => { check.click(); check.click(); });
    expect(favoriteReads()).toHaveLength(1); expect(operationReads()).toHaveLength(1); noFavoriteAction();
    const read = operationReads().at(-1)!; await act(async () => root.render(<div>Replacement</div>)); expect(read.init?.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(receiptReply(true))); await flush(); expect(container.textContent).toBe("Replacement");
  });

  it("recovers an initial favorite GET failure without a write, an operation query, or a full reader reload", async () => {
    respond = url => url.pathname.endsWith("/favorite") ? deny(503) : reply(url);
    await mount(); noFavoriteAction(); respond = reply; await checkFavorite();
    expect(button("Add to favorites").disabled).toBe(false); expect(mutations()).toHaveLength(0);
    expect(operationReads()).toHaveLength(0);
    expect(requests.filter(r => r.url.pathname === prefix)).toHaveLength(1);
  });

  it("does not send a write when tab storage cannot preserve its intent", async () => {
    await mount(); vi.spyOn(browser.localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await addFavorite(); expect(mutations()).toHaveLength(0); noFavoriteAction();
  });

  it.each([401, 403])("revokes the entire reader on favorite recovery %s without replay", async status => {
    respond = (url, init) => init?.method === "PUT" ? deny(503) : reply(url);
    await mount(); await addFavorite();
    respond = url => url.pathname.startsWith(operationPrefix) ? deny(status) : reply(url);
    await checkFavorite(); expectCleared(); expect(mutations()).toHaveLength(1);
  });

  it("retains an unknown write when recovery fails ordinarily, then permits another receipt read", async () => {
    respond = (url, init) => init?.method === "PUT" ? deny(503) : reply(url);
    await mount(); await addFavorite();
    respond = url => url.pathname.startsWith(operationPrefix) ? deny(503) : reply(url);
    await checkFavorite(); noFavoriteAction(); expect(container.textContent).toContain("Private body");
    await act(async () => { writeWorkspaceHistory("push", "/knowledge"); }); expect(browser.location.pathname).toBe("/knowledge/knowledge-a");
    respond = url => url.pathname.startsWith(operationPrefix) ? receiptReply(true) : reply(url);
    await checkFavorite(); expect(button("Remove from favorites").disabled).toBe(false); expect(mutations()).toHaveLength(1);
  });

  it("does not settle a record if successful write cleanup fails; a matching receipt retries cleanup only", async () => {
    await mount(); const remove = vi.spyOn(browser.localStorage, "removeItem").mockImplementation(() => { throw new Error("storage"); });
    respond = (url, init) => init?.method === "PUT" ? addReply() : reply(url);
    await addFavorite(); noFavoriteAction();
    remove.mockRestore(); respond = url => url.pathname.startsWith(operationPrefix) ? receiptReply(true) : url.pathname.endsWith("/favorite") ? Response.json({ favorite: true }) : reply(url);
    await checkFavorite(); expect(button("Remove from favorites").disabled).toBe(false); expect(mutations()).toHaveLength(1);
    await act(async () => root.render(<div>Other</div>)); await mount(); expect(button("Remove from favorites").disabled).toBe(false);
  });

  it("does not clear another operation's record with a stale successful receipt", async () => {
    const pending = deferred<Response>(); respond = (url, init) => init?.method === "PUT" ? pending.promise : reply(url);
    await mount(); await addFavorite();
    const key = "memory-garden:reader-favorite-intent:v1:member-a:knowledge-a";
    const replacement = JSON.stringify({ v: 1, member: "member-a", item: "knowledge-a", intent: { id: "other-op", desired: false } });
    browser.localStorage.setItem(key, replacement);
    await act(async () => pending.resolve(addReply())); await flush(); noFavoriteAction(); expect(browser.localStorage.getItem(key)).toBe(replacement);
  });

  it("leaves an unresolved record intact and ignores write denial after changing members", async () => {
    const pending = deferred<Response>(); respond = (url, init) => init?.method === "PUT" ? pending.promise : reply(url);
    await mount(); await addFavorite(); await mount("member-b");
    await act(async () => pending.resolve(deny(403))); await flush(); expect(button("Add to favorites").disabled).toBe(false); expect(container.textContent).toContain("Private body");
    await mount(); noFavoriteAction(); expect(mutations()).toHaveLength(1);
  });

  it.each(["corrupt", "wrong-member", "wrong-target"])("fails closed for a %s favorite recovery record", async kind => {
    browser.localStorage.setItem("memory-garden:reader-favorite-intent:v1:member-a:knowledge-a", kind === "corrupt" ? "{" : JSON.stringify({ v: 1, member: kind === "wrong-member" ? "member-b" : "member-a", item: kind === "wrong-target" ? "knowledge-b" : "knowledge-a", intent: { id: "operation-a", desired: true } }));
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

  it("surfaces a pending record left by another tab on mount without a write or receipt read", async () => {
    browser.localStorage.setItem(recordKey, JSON.stringify({ v: 1, member: "member-a", item: "knowledge-a", intent: { id: "other-tab-op", desired: true } }));
    await mount(); noFavoriteAction();
    expect(container.textContent).toContain("Favorite result is unconfirmed");
    expect(favoriteReads()).toHaveLength(1); expect(mutations()).toHaveLength(0); expect(operationReads()).toHaveLength(0);
    respond = url => url.pathname.startsWith(operationPrefix) ? foreignOpReply("other-tab-op", true) : reply(url);
    await checkFavorite();
    expect(button("Remove from favorites").getAttribute("aria-pressed")).toBe("true");
    expect(mutations()).toHaveLength(0); expect(browser.localStorage.getItem(recordKey)).toBeNull();
  });

  it("adopts the unconfirmed state from a cross-tab signal without a write or receipt read", async () => {
    await mount(); expect(button("Add to favorites").disabled).toBe(false);
    browser.localStorage.setItem(recordKey, JSON.stringify({ v: 1, member: "member-a", item: "knowledge-a", intent: { id: "other-tab-op", desired: true } }));
    await signalStorage(recordKey); noFavoriteAction();
    expect(container.textContent).toContain("Favorite result is unconfirmed");
    expect(mutations()).toHaveLength(0); expect(operationReads()).toHaveLength(0);
    respond = url => url.pathname.startsWith(operationPrefix) ? foreignOpReply("other-tab-op", true) : reply(url);
    await checkFavorite();
    expect(button("Remove from favorites").getAttribute("aria-pressed")).toBe("true"); expect(mutations()).toHaveLength(0);
  });

  it.each(["member-b", "knowledge-b"])("ignores a cross-tab signal for a foreign %s", async other => {
    const member = other === "member-b" ? "member-b" : "member-a";
    const item = other === "knowledge-b" ? "knowledge-b" : "knowledge-a";
    const foreignKey = `memory-garden:reader-favorite-intent:v1:${member}:${item}`;
    await mount();
    browser.localStorage.setItem(foreignKey, JSON.stringify({ v: 1, member, item, intent: { id: "foreign-op", desired: true } }));
    await signalStorage(foreignKey);
    expect(button("Add to favorites").disabled).toBe(false);
    expect(container.textContent).not.toContain("Favorite result is unconfirmed");
    expect(mutations()).toHaveLength(0); expect(operationReads()).toHaveLength(0);
  });

  it("does not resurrect a settled record from a stale cross-tab signal", async () => {
    respond = (url, init) => init?.method === "PUT" ? addReply() : reply(url);
    await mount(); await addFavorite();
    expect(button("Remove from favorites").disabled).toBe(false); expect(browser.localStorage.getItem(recordKey)).toBeNull();
    await signalStorage(recordKey);
    expect(button("Remove from favorites").disabled).toBe(false);
    expect(container.textContent).not.toContain("Favorite result is unconfirmed");
    expect(browser.localStorage.getItem(recordKey)).toBeNull();
    expect(mutations()).toHaveLength(1); expect(operationReads()).toHaveLength(0);
  });

  it("returns to idle when a cross-tab signal clears the record, re-reading only the boolean favourite", async () => {
    respond = (url, init) => init?.method === "PUT" ? Promise.reject(new TypeError("lost")) : reply(url);
    await mount(); await addFavorite();
    expect(container.textContent).toContain("Favorite result is unconfirmed");
    const readsBefore = favoriteReads().length;
    browser.localStorage.removeItem(recordKey);
    await signalStorage(recordKey); await flush();
    expect(container.textContent).not.toContain("Favorite result is unconfirmed");
    expect(button("Add to favorites").disabled).toBe(false);
    expect(favoriteReads()).toHaveLength(readsBefore + 1);
    expect(mutations()).toHaveLength(1); expect(operationReads()).toHaveLength(0);
  });

  it("does not stick blocked or lose the unresolved intent when a cross-tab signal corrupts the record mid-check", async () => {
    respond = (url, init) => init?.method === "PUT" ? Promise.reject(new TypeError("lost")) : reply(url);
    await mount(); await addFavorite();
    expect(container.textContent).toContain("Favorite result is unconfirmed");
    const operationId = mutationOperationId("PUT");
    const pending = deferred<Response>();
    respond = url => url.pathname.startsWith(operationPrefix) ? pending.promise : reply(url);
    await act(async () => button("Read current favorite").click());
    // Another tab corrupts the shared record while this tab's exact query is in flight.
    browser.localStorage.setItem(recordKey, "{");
    await signalStorage(recordKey);
    expect(container.textContent).toContain("recovery record is unavailable");
    // The in-flight exact receipt still owns the resolution: it must not stay blocked.
    await act(async () => pending.resolve(foreignOpReply(operationId, false)));
    await flush();
    expect(container.textContent).toContain("Favorite result is unconfirmed");
    expect(container.textContent).not.toContain("recovery record is unavailable");
    expect(mutations()).toHaveLength(1); expect(operationReads()).toHaveLength(1);
    // The unresolved in-memory intent survived: restore the record and settle explicitly.
    browser.localStorage.setItem(recordKey, JSON.stringify({ v: 1, member: "member-a", item: "knowledge-a", intent: { id: operationId, desired: true } }));
    respond = url => url.pathname.startsWith(operationPrefix) ? foreignOpReply(operationId, true) : reply(url);
    await checkFavorite();
    expect(button("Remove from favorites").getAttribute("aria-pressed")).toBe("true");
    expect(mutations()).toHaveLength(1);
  });

});
