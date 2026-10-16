// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeRoute, MySubmissionsRoute, SearchRoute } from "../../frontend/app";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { stubListViewport } from "../helpers/list-viewport";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("reader infinite-scroll routes", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => { browser = new Window({ url: "https://app.test/knowledge" }); stubListViewport(browser, "mobile"); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("loads page one and ignores a stated page while keeping knowledge filters", async () => {
    browser.history.replaceState({}, "", "/knowledge?spaceId=default&page=2"); const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); urls.push(url); return auxiliary(url) ?? page(url, "knowledge"); });
    await act(async () => root.render(<KnowledgeRoute locale={locale()} search={browser.location.search} />)); await flush();
    const request = formalRequest(urls, "/api/knowledge");
    expect(request.searchParams.get("page")).toBe("1"); expect(request.searchParams.get("pageSize")).toBe("20"); expect(request.searchParams.get("spaceId")).toBe("default");
    expect(browser.location.search).toContain("spaceId=default");
    expect(container.innerHTML).not.toContain("Rows per page");
  });

  it("restores the search query at the first page on admitted navigation and aborts the stale request", async () => {
    browser.history.replaceState({}, "", "/search?q=worker&page=2"); const requests: Array<{ url: string; signal?: AbortSignal }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); requests.push({ url, signal: init?.signal || undefined }); return auxiliary(url) ?? page(url, "search"); });
    await act(async () => root.render(<SearchRoute locale={locale()} search={browser.location.search} />)); await flush();
    const formal = () => requests.filter(({ url }) => url.includes("/api/knowledge/search"));
    const first = new URL(formal()[0]!.url, "https://app.test");
    expect(first.searchParams.get("q")).toBe("worker"); expect(first.searchParams.get("page")).toBe("1"); expect(first.searchParams.get("pageSize")).toBe("20");
    await act(async () => { expect(writeWorkspaceHistory("push", "/search?q=new&pageSize=50")).toBe("committed"); }); await flush();
    expect(formal()[0]?.signal?.aborted).toBe(true);
    const last = new URL(formal().at(-1)!.url, "https://app.test");
    expect(last.searchParams.get("q")).toBe("new"); expect(last.searchParams.get("page")).toBe("1"); expect(last.searchParams.get("pageSize")).toBe("20");
  });

  it("preserves every repeated search tag and tag mode", async () => {
    browser.history.replaceState({}, "", "/search?q=worker&tagId=tag-a&tagId=tag-b&tagMode=and"); const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); urls.push(url); return auxiliary(url) ?? page(url, "search"); });
    await act(async () => root.render(<SearchRoute locale={locale()} search={browser.location.search} />)); await flush();
    const request = new URL(urls.find((url) => url.includes("/api/knowledge/search"))!, "https://app.test");
    expect(request.searchParams.getAll("tagId")).toEqual(["tag-a", "tag-b"]);
    expect(request.searchParams.get("tagMode")).toBe("and");
  });

  it.each([
    ["knowledge", "/knowledge", (localeValue: ReturnType<typeof locale>) => <KnowledgeRoute locale={localeValue} search={browser.location.search} />],
    ["submissions", "/my-submissions", (localeValue: ReturnType<typeof locale>) => <MySubmissionsRoute locale={localeValue} search={browser.location.search} />],
  ] as const)("retries an initial %s failure", async (kind, path, renderRoute) => {
    browser.history.replaceState({}, "", path); let formalAttempts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); const fallback = auxiliary(url); if (fallback) return fallback; if (!isFormal(url, kind)) return json({ items: [] }); formalAttempts += 1; if (formalAttempts === 1) throw new Error("offline"); return page(url, kind); });
    await act(async () => root.render(renderRoute(locale()))); await flush();
    expect(container.querySelector('[role="alert"] button')).toBeTruthy();
    await click('[role="alert"] button'); await flush();
    expect(formalAttempts).toBe(2); expect(container.textContent).toContain(kind === "knowledge" ? "Knowledge 1" : "Submission 1");
  });

  it("keeps the loaded rows and offers retry when appending a page fails", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input); const fallback = auxiliary(url); if (fallback) return fallback;
      if (!isFormal(url, "knowledge")) return json({ items: [] });
      const pageNumber = Number(new URL(url, "https://app.test").searchParams.get("page") || "1");
      attempts += 1;
      if (pageNumber === 2) throw new Error("offline");
      if (attempts === 1) return json({ items: Array.from({ length: 20 }, (_, index) => ({ id: `k-${index + 1}`, title: `Knowledge ${index + 1}`, publishedAt: "2026-10-04", tagIds: [] })), pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } });
      return json({ items: [{ id: "k-retry", title: "Retried knowledge", publishedAt: "2026-10-04", tagIds: [] }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    await act(async () => root.render(<KnowledgeRoute locale={locale()} search={browser.location.search} />)); await flush();
    expect(container.textContent).toContain("Knowledge 1"); expect(container.querySelector('[role="alert"]')).toBeNull();
    await scrollToEnd();
    expect(container.textContent).toContain("Knowledge 1");
    expect(container.querySelector('[role="alert"] button')).toBeTruthy();
    await click("[role=alert] button"); await flush();
    expect(container.textContent).toContain("Retried knowledge"); expect(container.textContent).not.toContain("Knowledge 1");
  });

  it("ignores a stated page and renders the empty first page", async () => {
    browser.history.replaceState({}, "", "/knowledge?page=3"); const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); urls.push(url); const fallback = auxiliary(url); return fallback ?? json({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }); });
    await act(async () => root.render(<KnowledgeRoute locale={locale()} search={browser.location.search} />)); await flush();
    expect(container.textContent).toContain("No published knowledge"); expect(container.textContent).not.toContain("Unable");
    expect(formalRequest(urls, "/api/knowledge").searchParams.get("page")).toBe("1");
  });

  it("appends submissions at the end of the list while preserving the status filter", async () => {
    browser.history.replaceState({}, "", "/my-submissions?status=review_pending&page=2"); const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input); urls.push(url);
      const pageNumber = Number(new URL(url, "https://app.test").searchParams.get("page") || "1");
      if (pageNumber === 2) return json({ items: [{ id: "s-21", title: "Submission 21", status: "review_pending" }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } });
      return json({ items: Array.from({ length: 20 }, (_, index) => ({ id: `s-${index + 1}`, title: `Submission ${index + 1}`, status: "review_pending" })), pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } });
    });
    await act(async () => root.render(<MySubmissionsRoute locale={locale()} search={browser.location.search} />)); await flush();
    const first = formalRequest(urls, "/api/submissions/mine");
    expect(first.searchParams.get("page")).toBe("1"); expect(first.searchParams.get("pageSize")).toBe("20"); expect(first.searchParams.get("status")).toBe("review_pending");
    expect(browser.location.search).toContain("status=review_pending");
    expect(container.innerHTML).not.toContain("Rows per page");
    expect(container.textContent).toContain("Submission 1");
    await scrollToEnd();
    expect(formalRequest(urls.slice().reverse(), "/api/submissions/mine").searchParams.get("page")).toBe("2");
    expect(container.textContent).toContain("Submission 1"); expect(container.textContent).toContain("Submission 21");
  });

  async function click(selector: string) { const button = container.querySelector(selector) as HTMLButtonElement; expect(button).toBeTruthy(); await act(async () => button.click()); }
  async function scrollToEnd() {
    const scroller = container.querySelector("div.overflow-auto") as HTMLElement;
    expect(scroller).toBeTruthy();
    await act(async () => {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new browser.Event("scroll", { bubbles: true }));
    });
    await flush();
  }
});

function formalRequest(urls: string[], pathname: string): URL { const match = urls.find((url) => new URL(url, "https://app.test").pathname === pathname); if (!match) throw new Error(`MISSING_REQUEST:${pathname}`); return new URL(match, "https://app.test"); }
function page(url: string, kind: "knowledge" | "search" | "submissions"): Response { const params = new URL(url, "https://app.test").searchParams; const page = Number(params.get("page") || "1"); const pageSize = Number(params.get("pageSize") || "20"); const item = kind === "knowledge" ? { id: `k-${page}`, title: `Knowledge ${page}`, publishedAt: "2026-10-04", tagIds: [] } : kind === "search" ? { knowledgeItemId: `k-${page}`, citationId: `c-${page}`, title: `Search ${page}` } : { id: `s-${page}`, title: `Submission ${page}`, status: "review_pending" }; return json({ items: [item], ...(kind === "search" ? { degraded: false } : {}), pagination: { page, pageSize, total: page === 2 ? 21 : 1, totalPages: page === 2 ? 2 : 1 } }); }
function auxiliary(url: string): Response | null { if (url.includes("/api/knowledge/review")) return json({ period: "daily", from: "2026-10-04T00:00:00.000Z", to: "2026-10-05T00:00:00.000Z", items: [] }); if (url.includes("/recent") || url.includes("/favorites") || url.includes("/research-runs") || url.includes("/private-notes") || url.includes("/activity") || url.includes("/review")) return json({ items: [], nextCursor: null }); if (url.includes("/saved-views")) return json({ items: [] }); return null; }
function isFormal(url: string, kind: "knowledge" | "submissions"): boolean { const pathname = new URL(url, "https://app.test").pathname; return pathname === (kind === "knowledge" ? "/api/knowledge" : "/api/submissions/mine"); }
function json(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
