// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAssetsRoute, AdminDuplicateRoute, ReviewQueueRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("moderation numbered routes", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => { browser = new Window({ url: "https://app.test/admin/submissions?page=2" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container); });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  const queues = [
    { name: "review", path: "/admin/submissions", render: (search: string) => <ReviewQueueRoute locale={locale()} search={search} />, item: (id: string) => ({ id, title: id, submitterId: "m1", status: "review_pending" }) },
    { name: "assets", path: "/admin/assets", render: (search: string) => <AdminAssetsRoute locale={locale()} search={search} />, item: (id: string) => ({ asset: { id, originalName: id }, job: { status: "queued" } }) },
    { name: "duplicates", path: "/admin/duplicates", render: (search: string) => <AdminDuplicateRoute locale={locale()} search={search} />, item: (id: string) => duplicate("pending", id) },
  ] as const;

  it.each(queues)("restores $name URL state on initialization and browser back/forward", async ({ path, render, item }) => {
    browser.history.replaceState({}, "", `${path}?page=2&pageSize=20`); const gets: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); gets.push(url); return pageResponse(url, item); });
    await act(async () => root.render(render(browser.location.search))); await flush();
    expect(queryOf(gets.at(-1)!, "page")).toBe("2");
    await act(async () => { browser.history.pushState({}, "", `${path}?pageSize=20`); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(queryOf(gets.at(-1)!, "page") || "1").toBe("1");
    await act(async () => browser.history.back()); await flush();
    expect(queryOf(gets.at(-1)!, "page")).toBe("2");
    await act(async () => browser.history.forward()); await flush();
    expect(queryOf(gets.at(-1)!, "page") || "1").toBe("1");
  });

  it.each(queues)("resets $name to page one with one history write when pageSize changes", async ({ path, render, item }) => {
    browser.history.replaceState({}, "", `${path}?page=2`); const gets: string[] = []; const push = vi.spyOn(browser.history, "pushState");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); gets.push(url); return pageResponse(url, item); });
    await act(async () => root.render(render(browser.location.search))); await flush(); push.mockClear();
    await changeSelect('select[aria-label="Rows per page"]', "50");
    expect(push).toHaveBeenCalledTimes(1); expect(browser.location.search).toBe("?pageSize=50");
    expect(queryOf(gets.at(-1)!, "page") || "1").toBe("1"); expect(queryOf(gets.at(-1)!, "pageSize")).toBe("50");
  });

  it("resets asset status to page one with one history write", async () => {
    browser.history.replaceState({}, "", "/admin/assets?page=2&status=queued"); const gets: string[] = []; const push = vi.spyOn(browser.history, "pushState");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => { const url = String(input); gets.push(url); return pageResponse(url, (id) => ({ asset: { id, originalName: id }, job: { status: "failed_retryable" } })); });
    await act(async () => root.render(<AdminAssetsRoute locale={locale()} search={browser.location.search} />)); await flush(); push.mockClear();
    await changeSelect('select[aria-label="Asset status"]', "failed_retryable");
    expect(push).toHaveBeenCalledTimes(1); expect(browser.location.search).toBe("?status=failed_retryable");
    expect(queryOf(gets.at(-1)!, "status")).toBe("failed_retryable"); expect(queryOf(gets.at(-1)!, "page")).toBe("1");
  });

  it("refreshes review actions through the current generation and replaces an empty page", async () => {
    const gets: string[] = []; const replace = vi.spyOn(browser.history, "replaceState");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (init?.method === "POST") return json({ submission: {} }); gets.push(url); return gets.length === 1 ? numbered([{ id: "review-1", title: "Review", submitterId: "m1", status: "review_pending" }], 2, 21) : numbered([], url.includes("page=2") ? 2 : 1, 0); });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await flush();
    expect(gets.map((url) => new URL(url, "https://app.test").searchParams.get("page") || "1")).toEqual(["2", "2", "1"]);
    expect(replace).toHaveBeenCalledTimes(1); expect(browser.location.search).not.toContain("page=2");
  });

  it("preserves the asset filter while retry refresh backs up once", async () => {
    browser.history.replaceState({}, "", "/admin/assets?status=failed_retryable&page=2"); const gets: string[] = []; const replace = vi.spyOn(browser.history, "replaceState");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (init?.method === "POST") return json({}); gets.push(url); return gets.length === 1 ? numbered([{ asset: { id: "asset-1", originalName: "broken.pdf" }, job: { status: "failed_retryable" } }], 2, 21) : numbered([], url.includes("page=2") ? 2 : 1, 0); });
    await act(async () => root.render(<AdminAssetsRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Retry"); await flush();
    expect(gets).toHaveLength(3); expect(gets.every((url) => url.includes("status=failed_retryable"))).toBe(true); expect(replace).toHaveBeenCalledTimes(1); expect(browser.location.search).toContain("status=failed_retryable"); expect(browser.location.search).not.toContain("page=2");
  });

  it("does not expose cursor loading after a duplicate decision and corrects total zero", async () => {
    browser.history.replaceState({}, "", "/admin/duplicates?page=2"); const gets: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (init?.method === "POST") return json({ candidate: duplicate("associate") }); gets.push(url); return gets.length === 1 ? numbered([duplicate("pending")], 2, 21) : numbered([], url.includes("page=2") ? 2 : 1, 0); });
    await act(async () => root.render(<AdminDuplicateRoute locale={locale()} search={browser.location.search} />)); await flush();
    expect(container.textContent).not.toContain("Load more"); await clickButton("Associate"); await flush();
    expect(gets).toHaveLength(3); expect(browser.location.search).not.toContain("page=2");
  });

  it("does not let a completed duplicate mutation refresh overwrite a newer query", async () => {
    browser.history.replaceState({}, "", "/admin/duplicates?page=2"); const mutation = deferred<Response>(); const gets: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (init?.method === "POST") return mutation.promise; gets.push(url); return queryOf(url, "page") === "2" ? numbered([duplicate("pending", "old")], 2, 21) : numbered(Array.from({ length: 20 }, (_, index) => duplicate("pending", index === 0 ? "latest" : `latest-${index}`)), 1, 20); });
    await act(async () => root.render(<AdminDuplicateRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Associate");
    await act(async () => { browser.history.pushState({}, "", "/admin/duplicates"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(container.textContent).toContain("latest"); mutation.resolve(json({ candidate: duplicate("associate", "old") })); await flush();
    expect(container.textContent).toContain("latest"); expect(container.textContent).not.toContain("old"); expect(gets).toHaveLength(2);
  });

  it("keeps the old review list and shows a local error when mutation refresh fails", async () => {
    let gets = 0;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => { if (init?.method === "POST") return json({ submission: {} }); gets += 1; if (gets > 1) throw new Error("refresh failed"); return numbered([{ id: "review-kept", title: "Review kept", submitterId: "m1", status: "review_pending" }], 2, 21); });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await flush();
    expect(container.textContent).toContain("Review kept"); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable");
  });

  async function clickButton(label: string) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label)) as HTMLButtonElement; expect(button).toBeTruthy(); await act(async () => button.click()); }
  async function changeSelect(selector: string, value: string) { const select = container.querySelector(selector) as HTMLSelectElement; expect(select).toBeTruthy(); await act(async () => { select.value = value; select.dispatchEvent(new browser.Event("change", { bubbles: true })); }); await flush(); }
});

function numbered(items: unknown[], page: number, total: number): Response { return json({ items, pagination: { page, pageSize: 20, total, totalPages: total === 0 ? 0 : Math.ceil(total / 20) } }); }
function pageResponse(url: string, item: (id: string) => unknown): Response { const params = new URL(url, "https://app.test").searchParams; const page = Number(params.get("page") || "1"); const pageSize = Number(params.get("pageSize") || "20") as 20 | 50 | 100; const total = page === 2 ? 21 : 1; const count = Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)); return json({ items: Array.from({ length: count }, (_, index) => item(`item-${page}-${index}`)), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }); }
function queryOf(url: string, key: string): string | null { return new URL(url, "https://app.test").searchParams.get(key); }
function duplicate(decision: "pending" | "associate", id = "dup-1") { return { submissionId: id, canonicalSubmissionId: `${id}-canonical`, canonicalSourceId: `${id}-source`, canonicalSourceVersionId: `${id}-version`, submissionTitle: id, canonicalTitle: `Canonical ${id}`, decision }; }
function json(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
