// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { installWorkspaceHistoryDriver } from "../helpers/workspace-history-driver";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const locale = createLocaleRuntime({ navigatorLanguage: "en" });
const stamp = "2026-10-10T00:00:00.000Z";
const sectionPaths = ["/api/knowledge/recent", "/api/knowledge/favorites", "/api/knowledge/research-runs", "/api/knowledge/notes", "/api/activity", "/api/knowledge/review"];
const entry = (id: string) => ({ id, action: "knowledge.published", resourceType: "knowledge", resourceId: id, createdAt: stamp });
const deny = (status: number) => Response.json({ error: { code: "DENIED", message: "Denied" } }, { status });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function reply(url: URL) {
  if (url.pathname === "/api/knowledge") return Response.json({ items: Array.from({ length: 20 }, (_, index) => ({ id: `private-${index}`, title: `Private list title ${index}`, tags: [], publishedAt: stamp })), pagination: { page: Number(url.searchParams.get("page") ?? 1), pageSize: 20, total: 40, totalPages: 2 } });
  if (url.pathname === "/api/knowledge/review") return Response.json({ period: url.searchParams.get("period"), from: stamp, to: stamp, items: [] });
  if (url.pathname === "/api/knowledge/recent") return Response.json({ items: [{ knowledgeItemId: "recent-private", title: "Private recent title", lastVisitedAt: stamp, visitCount: 1 }] });
  if (url.pathname === "/api/activity") return Response.json({ items: [entry("first")], nextCursor: "cursor-a" });
  return Response.json({ items: [] });
}

describe("knowledge page read ownership and revocation", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  let respond: (url: URL, init?: RequestInit) => Response | Promise<Response>;
  let requests: Array<{ url: URL; init?: RequestInit }>;
  beforeEach(async () => {
    browser = new Window({ url: "https://app.test/knowledge" });
    installWorkspaceHistoryDriver(browser as unknown as Window & typeof globalThis);
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("HTMLElement", browser.HTMLElement); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const element = browser.document.createElement("div"); browser.document.body.append(element);
    container = element as unknown as HTMLElement;
    const { createRoot } = await import("react-dom/client"); root = createRoot(container);
    requests = []; respond = reply;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => { const url = new URL(String(input), "https://app.test"); requests.push({ url, init }); return Promise.resolve(respond(url, init)); });
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  const mount = async (memberId = "member-a") => { await act(async () => root.render(<KnowledgeRoute locale={locale} search="" memberId={memberId} />)); await flush(); };
  const click = async (selector: string) => { const target = container.querySelector<HTMLButtonElement>(selector); expect(target).not.toBeNull(); await act(async () => target!.click()); await flush(); };
  const more = () => click("[data-workspace-activity] button");
  const next = () => click('[data-pagination-mobile] button[aria-label="Next page"]');

  it.each([401, 403])("clears all private sections on list %s and only recovers by explicit reads", async status => {
    await mount(); expect(container.textContent).toContain("Private recent title");
    respond = url => url.pathname === "/api/knowledge" ? deny(status) : reply(url);
    await next();
    expect(container.textContent).not.toContain("Private list title");
    expect(container.textContent).not.toContain("Private recent title");
    expect(container.querySelector("[data-workspace-activity]")).toBeNull();
    const before = requests.length; await flush(); expect(requests).toHaveLength(before);
    respond = reply; await click("button");
    expect(container.textContent).toContain("Private list title");
    expect(container.textContent).toContain("Private recent title");
    expect(requests.every(request => !request.init?.method || request.init.method === "GET")).toBe(true);
  });

  it.each(sectionPaths.flatMap(path => [401, 403].map(status => ({ path, status }))))("revokes the composite page on $path $status and ignores late siblings", async ({ path, status }) => {
    const failure = deferred<Response>(); const late = deferred<Response>();
    respond = url => url.pathname === path ? failure.promise : url.pathname === "/api/knowledge/recent" ? late.promise : reply(url);
    await mount(); expect(container.textContent).toContain("Private list title");
    await act(async () => failure.resolve(deny(status))); await flush();
    expect(container.textContent).not.toContain("Private list title");
    await act(async () => late.resolve(reply(new URL("https://app.test/api/knowledge/recent")))); await flush();
    expect(container.textContent).not.toContain("Private recent title");
    expect(container.querySelector("[data-workspace-activity]")).toBeNull();
  });

  it.each([401, 403])("revokes every private section on activity append %s", async status => {
    await mount();
    respond = url => url.searchParams.has("cursor") ? deny(status) : reply(url);
    await more();
    expect(container.textContent).not.toContain("Private list title");
    expect(container.textContent).not.toContain("Private recent title");
    expect(container.querySelector("[data-workspace-activity]")).toBeNull();
    const before = requests.length; await flush(); expect(requests).toHaveLength(before);
    respond = reply; await click("button");
    expect(container.textContent).toContain("Private list title");
    expect(container.querySelector('[href="/knowledge/first"]')).not.toBeNull();
    expect(requests.filter(request => request.url.searchParams.has("cursor"))).toHaveLength(1);
  });

  it.each([401, 403])("does not resurrect the page from a late main read after section %s", async status => {
    const main = deferred<Response>(); const failure = deferred<Response>();
    respond = url => url.pathname === "/api/knowledge" ? main.promise : url.pathname === "/api/knowledge/favorites" ? failure.promise : reply(url);
    await mount();
    const original = requests.find(request => request.url.pathname === "/api/knowledge")!;
    await act(async () => failure.resolve(deny(status))); await flush();
    expect(original.init?.signal?.aborted).toBe(true);
    await act(async () => main.resolve(reply(new URL("https://app.test/api/knowledge")))); await flush();
    expect(container.textContent).not.toContain("Private list title");
    expect(container.textContent).not.toContain("Private recent title");
    expect(container.querySelector("[data-workspace-activity]")).toBeNull();
  });

  it("ignores a previous denied generation even after explicit recovery reopens reads", async () => {
    const oldRecent = deferred<Response>(); const failure = deferred<Response>();
    respond = url => url.pathname === "/api/knowledge/recent" ? oldRecent.promise : url.pathname === "/api/knowledge/favorites" ? failure.promise : reply(url);
    await mount();
    await act(async () => failure.resolve(deny(403))); await flush();
    respond = reply; await click("button");
    expect(container.textContent).toContain("Private recent title");
    await act(async () => oldRecent.resolve(Response.json({ items: [{ knowledgeItemId: "stale-private", title: "Stale private title", lastVisitedAt: stamp, visitCount: 1 }] }))); await flush();
    expect(container.textContent).not.toContain("Stale private title");
    expect(container.textContent).toContain("Private recent title");
    expect(requests.every(request => !request.init?.method || request.init.method === "GET")).toBe(true);
  });

  it("keeps ordinary list read failures recoverable without dropping existing rows", async () => {
    await mount(); respond = url => url.pathname === "/api/knowledge" ? deny(500) : reply(url);
    await next(); expect(container.textContent).toContain("Private list title"); expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("reserves activity append synchronously against same-event double clicks", async () => {
    const pending = deferred<Response>(); await mount();
    respond = url => url.searchParams.has("cursor") ? pending.promise : reply(url);
    const button = container.querySelector<HTMLButtonElement>("[data-workspace-activity] button")!;
    await act(async () => { button.click(); button.click(); });
    expect(requests.filter(request => request.url.searchParams.has("cursor"))).toHaveLength(1);
    await act(async () => pending.resolve(Response.json({ items: [entry("second")], nextCursor: null }))); await flush();
    expect(container.querySelectorAll('[data-workspace-activity] a[href="/knowledge/second"]')).toHaveLength(1);
  });

  it("keeps failed append rows and cursor with a visible retryable error", async () => {
    await mount(); respond = url => url.searchParams.has("cursor") ? deny(500) : reply(url);
    await more();
    expect(container.querySelector('[data-workspace-activity] a[href="/knowledge/first"]')).not.toBeNull();
    expect(container.querySelector('[data-workspace-activity] [role="alert"]')).not.toBeNull();
    respond = url => url.searchParams.has("cursor") ? Response.json({ items: [entry("second")], nextCursor: null }) : reply(url);
    await more();
    expect(requests.filter(request => request.url.searchParams.has("cursor")).map(request => request.url.searchParams.get("cursor"))).toEqual(["cursor-a", "cursor-a"]);
    expect(container.querySelector('[data-workspace-activity] [role="alert"]')).toBeNull();
  });

  it("aborts an old append when sections restart and ignores its late result", async () => {
    const pending = deferred<Response>();
    respond = url => url.pathname === "/api/knowledge/favorites" ? deny(500) : reply(url);
    await mount(); respond = url => url.searchParams.has("cursor") ? pending.promise : reply(url);
    await more(); const append = requests.find(request => request.url.searchParams.has("cursor"))!;
    await click('[data-knowledge-section-error="favorites"] button');
    expect(append.init?.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(Response.json({ items: [entry("stale")], nextCursor: "stale-cursor" }))); await flush();
    expect(container.querySelector('[href="/knowledge/stale"]')).toBeNull();
  });

  it("aborts every in-flight read on unmount", async () => {
    const pending = deferred<Response>(); respond = () => pending.promise; await mount();
    const started = [...requests]; await act(async () => root.render(null));
    expect(started).toHaveLength(7);
    expect(started.every(request => request.init?.signal?.aborted)).toBe(true);
    await act(async () => pending.resolve(Response.json({ items: [] }))); await flush();
  });

  it("isolates a direct member switch and discards a late old activity page", async () => {
    const pending = deferred<Response>(); await mount(); respond = url => url.searchParams.has("cursor") ? pending.promise : reply(url);
    await more(); const old = requests.find(request => request.url.searchParams.has("cursor"))!;
    respond = url => url.pathname === "/api/knowledge" ? Response.json({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }) : reply(url);
    await mount("member-b"); expect(old.init?.signal?.aborted).toBe(true);
    expect(container.textContent).not.toContain("Private list title");
    await act(async () => pending.resolve(Response.json({ items: [entry("member-a-only")], nextCursor: null }))); await flush();
    expect(container.querySelector('[href="/knowledge/member-a-only"]')).toBeNull();
  });

  it("offers explicit retry of the same review period without changing the selection", async () => {
    respond = url => url.pathname === "/api/knowledge/review" ? deny(500) : reply(url); await mount();
    expect(container.textContent).toContain("Unable to prepare the review list.");
    respond = reply; await click('[data-knowledge-review] button');
    expect(container.textContent).toContain("Nothing needs your attention in this period.");
    expect(requests.filter(request => request.url.pathname === "/api/knowledge/review").map(request => request.url.searchParams.get("period"))).toEqual(["daily", "daily"]);
  });
});

async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); for (let index = 0; index < 12; index++) await Promise.resolve(); }); }
