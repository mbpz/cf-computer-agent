// @vitest-environment node
import React, { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminAssetsRoute, AdminDuplicateRoute, ReviewQueueRoute } from "../../frontend/app";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { ReviewQueuePage } from "../../frontend/pages/admin/review-queue-page";
import { DuplicateQueuePage } from "../../frontend/pages/admin/duplicate-queue-page";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("moderation numbered routes", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(async () => { browser = new Window({ url: "https://app.test/admin/submissions?page=2" }); vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator); vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); const { createRoot } = await import("react-dom/client"); root = createRoot(container); });
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
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { const url = String(input); if (init?.method === "POST") return rejected("review-1"); gets.push(url); return gets.length === 1 ? numbered([{ id: "review-1", title: "Review", submitterId: "m1", status: "review_pending" }], 2, 21) : numbered([], url.includes("page=2") ? 2 : 1, 0); });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await clickButton("Confirm rejection"); await flush();
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
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => { if (init?.method === "POST") return rejected("review-kept"); gets += 1; if (gets > 1) throw new Error("refresh failed"); return numbered([{ id: "review-kept", title: "Review kept", submitterId: "m1", status: "review_pending" }], 2, 21); });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await clickButton("Confirm rejection"); await flush();
    expect(container.textContent).toContain("Review kept"); expect(container.querySelector('[role="alert"]')?.textContent).toBe("Unable to load the page."); expect(container.textContent).not.toContain("Unable to save this review decision.");
  });

  it("keeps the review list and reports action failure when the mutation itself fails", async () => {
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST" ? new Response(null, { status: 500 }) : numbered([{ id: "review-action", title: "Review action", submitterId: "m1", status: "review_pending" }], 2, 21));
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await clickButton("Confirm rejection"); await flush();
    expect(container.textContent).toContain("Review action"); expect(container.querySelector('[role="alert"]')?.textContent).toContain("The result is unknown"); expect(container.textContent).not.toContain("Unable to load the page.");
  });

  it("gives review and duplicate actions target-specific accessible names with ID fallback", async () => {
    await act(async () => root.render(<ReviewQueuePage state={{ kind: "ready", data: { items: [{ id: "review-title", title: "Review title" }, { id: "review-fallback", title: " " }], pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 } } }} />));
    expect(buttonNames()).toEqual(expect.arrayContaining(["Publish Review title", "Request changes Review title", "Reject Review title", "Publish review-fallback", "Request changes review-fallback", "Reject review-fallback"]));
    await act(async () => root.render(<DuplicateQueuePage state={{ kind: "ready", data: { items: [{ ...duplicate("pending", "duplicate-title"), submissionTitle: "Duplicate title" }, { ...duplicate("pending", "duplicate-fallback"), submissionTitle: " " }], pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 } } }} />));
    expect(buttonNames()).toEqual(expect.arrayContaining(["Associate Duplicate title", "Keep separate Duplicate title", "Reject Duplicate title", "Associate duplicate-fallback", "Keep separate duplicate-fallback", "Reject duplicate-fallback"]));
  });

  it("retries the exact failed review query once for same-tick repeated clicks without a POST", async () => {
    browser.history.replaceState({}, "", "/admin/submissions?page=2&pageSize=50");
    const gets: string[] = []; const posts: string[] = []; const retry = deferred<Response>();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { if (init?.method === "POST") posts.push(String(input)); gets.push(String(input)); return gets.length === 1 ? new Response(null, { status: 500 }) : retry.promise; });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    const button = [...container.querySelectorAll("button")].find((item) => item.textContent === "Try again") as HTMLButtonElement;
    expect(button).toBeTruthy();
    await act(async () => { button.click(); button.click(); });
    expect(gets).toHaveLength(2); expect(gets[1]).toBe(gets[0]); expect(posts).toHaveLength(0);
    await act(async () => retry.resolve(json({ items: [], pagination: { page: 2, pageSize: 50, total: 0, totalPages: 0 } }))); await flush();
    expect(container.querySelector('[data-page-state="empty"]')).toBeTruthy();
  });

  it.each([401, 403])("clears private review rows and decisions on %i during a page read", async (status) => {
    let gets = 0;
    vi.stubGlobal("fetch", async () => ++gets === 1 ? numbered([{ id: "private-review", title: "Private review" }], 2, 21) : new Response(null, { status }));
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await act(async () => { browser.history.pushState({}, "", "/admin/submissions"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(container.textContent).not.toContain("Private review");
    expect(container.querySelector('[data-page-state="forbidden"]')).toBeTruthy();
    expect(buttonNames().some((name) => name?.startsWith("Reject"))).toBe(false);
  });

  it("retries a post-decision read without repeating the decision", async () => {
    let gets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return rejected("review-kept"); }
      gets++; if (gets === 2) return new Response(null, { status: 500 });
      return numbered([{ id: "review-kept", title: gets === 1 ? "Before decision" : "After read retry" }], 2, 21);
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await clickButton("Confirm rejection"); await flush();
    expect(container.textContent).toContain("Before decision");
    await clickButton("Try again"); await flush();
    expect(container.textContent).toContain("After read retry"); expect(posts).toBe(1); expect(gets).toBe(3);
  });

  it("ignores a late retry after browser navigation, aborts it, and restores the query on back", async () => {
    const retry = deferred<Response>(); const gets: string[] = []; let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      gets.push(String(input));
      if (gets.length === 1) return new Response(null, { status: 500 });
      if (gets.length === 2) { signal = init?.signal as AbortSignal; return retry.promise; }
      return pageResponse(String(input), (id) => ({ id, title: id }));
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Try again");
    await act(async () => { browser.history.pushState({}, "", "/admin/submissions"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(signal?.aborted).toBe(true);
    await act(async () => retry.resolve(numbered([{ id: "late", title: "Late stale retry" }], 2, 21))); await flush();
    expect(container.textContent).toContain("item-1-0"); expect(container.textContent).not.toContain("Late stale retry");
    await act(async () => browser.history.back()); await flush();
    expect(queryOf(gets.at(-1)!, "page")).toBe("2"); expect(container.textContent).toContain("item-2-0");
  });

  it("does not leave the new query locked or refresh it when an old decision finishes", async () => {
    const decision = deferred<Response>(); let gets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => { if (init?.method === "POST") { posts++; return decision.promise; } gets++; return pageResponse(String(input), (id) => ({ id, title: id })); });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    const reject = container.querySelector('button[aria-label="Reject item-2-0"]') as HTMLButtonElement;
    await act(async () => { reject.click(); reject.click(); });
    const confirm = [...container.querySelectorAll("button")].find((item) => item.textContent === "Confirm rejection")!;
    await act(async () => { confirm.click(); confirm.click(); }); expect(posts).toBe(1);
    await act(async () => { browser.history.pushState({}, "", "/admin/submissions"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect((container.querySelector('button[aria-label="Reject item-1-0"]') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => decision.resolve(rejected("item-2-0"))); await flush();
    expect(gets).toBe(2); expect(container.textContent).toContain("item-1-0");
  });

  it("does not publish after navigating away while its preview is still loading", async () => {
    const preview = deferred<Response>(); let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return json({}); }
      return String(input).endsWith("/item-2-0") ? preview.promise : pageResponse(String(input), (id) => ({ id, title: id }));
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Publish");
    await act(async () => { browser.history.pushState({}, "", "/admin/submissions"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    await act(async () => preview.resolve(json({ preview: { submissionId: "item-2-0", title: "Old item", status: "review_pending", requestedSpaceId: "default" } }))); await flush();
    expect(posts).toBe(0); expect(container.textContent).toContain("item-1-0");
  });

  it.each([401, 403])("clears the queue if the publication preview returns %i", async (status) => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => String(input).endsWith("/item-2-0") ? new Response(null, { status }) : pageResponse(String(input), (id) => ({ id, title: id })));
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Publish"); await flush();
    expect(container.querySelector('[data-page-state="forbidden"]')).toBeTruthy();
    expect(container.textContent).not.toContain("item-2-0");
  });

  it("retains notes and replays the exact queue decision explicitly after a lost response", async () => {
    const bodies: string[] = []; let gets = 0; const retry = deferred<Response>();
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { bodies.push(String(init.body)); if (bodies.length === 1) throw new TypeError("connection lost"); return retry.promise; }
      gets++; return numbered([{ id: "review-1", title: "Review", status: "review_pending" }], 2, 21);
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await typeNote("Please verify the source"); await clickButton("Confirm rejection"); await flush();
    expect(gets).toBe(1); expect(bodies).toHaveLength(1); expect(JSON.parse(bodies[0]!).note).toBe("Please verify the source");
    expect((container.querySelector('button[aria-label="Publish Review"]') as HTMLButtonElement).disabled).toBe(true);
    const again = [...container.querySelectorAll("button")].find((button) => button.textContent === "Retry same decision")!;
    await act(async () => { again.click(); again.click(); }); expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
    await act(async () => retry.resolve(rejected("review-1"))); await flush();
    expect(gets).toBe(2); expect(container.textContent).toContain("Submission rejected.");
  });

  it("does not refresh or offer another decision after a malformed publish response", async () => {
    let listReads = 0; let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return json({}); }
      if (String(input).endsWith("/review-1")) return reviewPreview();
      listReads++; return numbered([{ id: "review-1", title: "Review" }], 2, 21);
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Publish"); await flush();
    expect(listReads).toBe(1); expect(posts).toBe(1); expect(container.textContent).toContain("The result is unknown");
    expect((container.querySelector('button[aria-label="Reject Review"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("reloads a conflict without repeating the write and keeps page size and other query parameters", async () => {
    browser.history.replaceState({}, "", "/admin/submissions?page=2&pageSize=50&view=pending");
    let gets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return new Response(null, { status: 409 }); }
      if (String(input).endsWith("/review-1")) return json({ preview: { submissionId: "review-1", title: "Review", submitterId: "m1", requestedSpaceId: "default", status: "rejected" } });
      gets++; return json({ items: gets === 1 ? [{ id: "review-1", title: "Review" }] : [], pagination: { page: gets < 3 ? 2 : 1, pageSize: 50, total: gets === 1 ? 51 : 0, totalPages: gets === 1 ? 2 : 0 } });
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await clickButton("Confirm rejection"); await flush();
    expect(gets).toBe(1); expect(container.textContent).toContain("The submission state changed");
    await clickButton("Reload current state"); await flush();
    expect(posts).toBe(1); expect(gets).toBe(3); expect(browser.location.search).toContain("pageSize=50"); expect(browser.location.search).toContain("view=pending");
    expect(browser.location.search).not.toContain("page=2");
  });

  it.each([401, 403])("clears queue content and form when an exact retry discovers revoked permissions (%i)", async (status) => {
    let posts = 0;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, { status: ++posts === 1 ? 503 : status });
      return numbered([{ id: "review-1", title: "Private review" }], 2, 21);
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await typeNote("Private note"); await clickButton("Confirm rejection"); await flush();
    await clickButton("Retry same decision"); await flush();
    expect(container.textContent).not.toContain("Private review"); expect(container.querySelector("textarea[data-review-note]")).toBeNull();
    expect(container.querySelector('[data-page-state="forbidden"]')).toBeTruthy();
  });

  it.each([
    ["indexed", "Published and searchable."], ["pending", "Search indexing is pending"],
    ["search_degraded", "Search is currently degraded"], ["failed", "Search indexing failed"],
  ])("retains the %s publication receipt when the queue refresh fails", async (searchStatus, message) => {
    let gets = 0; let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts++; return json({ revision: { id: "rev-1", knowledgeItemId: "item-1", searchStatus } }); }
      if (String(input).endsWith("/review-1")) return reviewPreview();
      return ++gets === 1 ? numbered([{ id: "review-1", title: "Review" }], 2, 21) : new Response(null, { status: 503 });
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Publish"); await flush();
    expect(container.querySelector('[role="status"]')?.textContent).toContain(message);
    expect(container.textContent).toContain("rev-1"); expect(container.textContent).toContain("item-1");
    expect((container.querySelector('button[aria-label="Publish Review"]') as HTMLButtonElement).disabled).toBe(true);
    await clickButton("Try again"); await flush();
    expect(posts).toBe(1); expect(gets).toBe(3);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(message);
  });

  it("keeps queue alternatives locked when validation rejects a previously uncertain publication replay", async () => {
    const bodies: string[] = []; let gets = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        bodies.push(String(init.body));
        if (bodies.length === 1) throw new TypeError("Response lost after commit");
        return new Response(JSON.stringify({ error: { code: "PUBLICATION_TARGET_INVALID", message: "Target unavailable", retryable: false } }), { status: 400 });
      }
      if (String(input).endsWith("/review-1")) return reviewPreview();
      gets++; return numbered([{ id: "review-1", title: "Review", status: gets === 1 ? "review_pending" : "published" }], 2, 21);
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Publish"); await flush(); await clickButton("Retry same decision"); await flush();
    expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]); expect(gets).toBe(1);
    expect((container.querySelector('button[aria-label="Reject Review"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).not.toContain("was not accepted");
    await clickButton("Reload current state"); await flush();
    expect(gets).toBe(2); expect(bodies).toHaveLength(2);
    expect((container.querySelector('button[aria-label="Reject Review"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([false, true])("keeps an uncertain queue decision locked when the same row remains pending (read failure: %s)", async (failRead) => {
    const bodies: string[] = []; let reads = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { bodies.push(String(init.body)); return new Response(null, { status: bodies.length === 1 ? 503 : 400 }); }
      if (String(input).endsWith("/review-1")) return reviewPreview();
      reads++;
      if (failRead && reads === 2) return new Response(null, { status: 503 });
      return numbered([{ id: "review-1", title: "Review", status: "review_pending" }], 2, 21);
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Publish"); await flush(); await clickButton("Retry same decision"); await flush();
    await clickButton("Reload current state"); await flush();
    if (failRead) { await clickButton("Try again"); await flush(); }
    expect((container.querySelector('button[aria-label="Reject Review"]') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('button[aria-label="Publish Review"]') as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain("Reload current state"); expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
  });

  it.each(["review_pending", "forbidden"])("resolves a missing queue row before releasing an uncertain decision (%s)", async (outcome) => {
    let reads = 0; let detailReads = 0; const bodies: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { bodies.push(String(init.body)); return new Response(null, { status: bodies.length === 1 ? 503 : 400 }); }
      if (String(input).endsWith("/review-1")) {
        detailReads++;
        if (detailReads > 1 && outcome === "forbidden") return new Response(null, { status: 403 });
        return reviewPreview();
      }
      reads++;
      return numbered(reads === 1 ? [{ id: "review-1", title: "Review", status: "review_pending" }] : [], 2, reads === 1 ? 21 : 20);
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Publish"); await flush(); await clickButton("Retry same decision"); await flush();
    await clickButton("Reload current state"); await flush();
    expect(detailReads).toBe(2); expect(reads).toBe(2); expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]);
    expect(browser.location.search).toBe("?page=2");
    if (outcome === "review_pending") expect(container.textContent).toContain("Reload current state");
    else { expect(container.textContent).not.toContain("Reload current state"); expect(container.querySelector('button[aria-label="Publish Review"]')).toBeNull(); }
  });

  it("ignores a missing-row detail read arriving after navigation", async () => {
    const late = deferred<Response>(); let detailReads = 0; let reads = 0; let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, { status: ++posts === 1 ? 503 : 400 });
      if (String(input).endsWith("/review-1")) return ++detailReads === 1 ? reviewPreview() : late.promise;
      reads++;
      if (queryOf(String(input), "page") === "1") return numbered([{ id: "review-new", title: "New page", status: "review_pending" }], 1, 1);
      return numbered(reads === 1 ? [{ id: "review-1", title: "Review", status: "review_pending" }] : [], 2, reads === 1 ? 21 : 20);
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Publish"); await flush(); await clickButton("Retry same decision"); await flush();
    await clickButton("Reload current state"); await flush(); expect(detailReads).toBe(2);
    await act(async () => { browser.history.pushState({}, "", "/admin/submissions"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    await act(async () => late.resolve(new Response(null, { status: 403 }))); await flush();
    expect(container.textContent).toContain("New page");
    expect((container.querySelector('button[aria-label="Publish New page"]') as HTMLButtonElement).disabled).toBe(false);
    expect(posts).toBe(2); expect(reads).toBe(3);
  });

  it("preserves queue replay and its note across language changes without another read", async () => {
    const language = locale(); const bodies: string[] = []; let gets = 0;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { bodies.push(String(init.body)); return bodies.length === 1 ? new Response(null, { status: 503 }) : rejected("review-1"); }
      gets++; return numbered([{ id: "review-1", title: "Review" }], 2, 21);
    });
    await act(async () => root.render(<ReviewQueueRoute locale={language} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await typeNote("Source needs verification"); await clickButton("Confirm rejection"); await flush();
    await act(async () => { language.setLocale("zh-CN"); root.render(<ReviewQueueRoute locale={language} search={browser.location.search} />); });
    expect(gets).toBe(1); expect((container.querySelector('textarea[data-review-note]') as HTMLTextAreaElement).disabled).toBe(true);
    await clickButton("重试原决定"); await flush();
    expect(bodies).toHaveLength(2); expect(bodies[1]).toBe(bodies[0]); expect(container.textContent).toContain("提交已驳回");
  });

  it("does not refresh or restore queue rows after a pending decision is unmounted", async () => {
    const response = deferred<Response>(); let gets = 0;
    vi.stubGlobal("fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return response.promise;
      gets++; return numbered([{ id: "review-1", title: "Review" }], 2, 21);
    });
    await act(async () => root.render(<ReviewQueueRoute locale={locale()} search={browser.location.search} />)); await flush();
    await clickButton("Reject"); await clickButton("Confirm rejection");
    await act(async () => root.render(<p>Signed out</p>));
    await act(async () => response.resolve(rejected("review-1"))); await flush();
    expect(gets).toBe(1); expect(container.textContent).toBe("Signed out");
  });

  async function typeNote(value: string) {
    const input = container.querySelector("textarea[data-review-note]") as HTMLTextAreaElement;
    expect(input).toBeTruthy();
    await act(async () => { Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new browser.Event("input", { bubbles: true })); });
  }

  async function clickButton(label: string) { const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.includes(label)) as HTMLButtonElement; expect(button).toBeTruthy(); await act(async () => button.click()); }
  async function changeSelect(selector: string, value: string) { const select = container.querySelector(selector) as HTMLSelectElement; expect(select).toBeTruthy(); await act(async () => { select.value = value; select.dispatchEvent(new browser.Event("change", { bubbles: true })); }); await flush(); }
  function buttonNames(): Array<string | null> { return [...container.querySelectorAll("button[aria-label]")].map((button) => button.getAttribute("aria-label")); }
});

function numbered(items: unknown[], page: number, total: number): Response { return json({ items, pagination: { page, pageSize: 20, total, totalPages: total === 0 ? 0 : Math.ceil(total / 20) } }); }
function rejected(submissionId: string) { return json({ decision: { submissionId, decision: "rejected" } }); }
function reviewPreview() { return json({ preview: { submissionId: "review-1", title: "Review", status: "review_pending", requestedSpaceId: "default" } }); }
function pageResponse(url: string, item: (id: string) => unknown): Response { const params = new URL(url, "https://app.test").searchParams; const page = Number(params.get("page") || "1"); const pageSize = Number(params.get("pageSize") || "20") as 20 | 50 | 100; const total = page === 2 ? 21 : 1; const count = Math.max(0, Math.min(pageSize, total - (page - 1) * pageSize)); return json({ items: Array.from({ length: count }, (_, index) => item(`item-${page}-${index}`)), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }); }
function queryOf(url: string, key: string): string | null { return new URL(url, "https://app.test").searchParams.get(key); }
function duplicate(decision: "pending" | "associate", id = "dup-1") { return { submissionId: id, canonicalSubmissionId: `${id}-canonical`, canonicalSourceId: `${id}-source`, canonicalSourceVersionId: `${id}-version`, submissionTitle: id, canonicalTitle: `Canonical ${id}`, decision }; }
function json(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }); }
function locale() { return createLocaleRuntime({ navigatorLanguage: "en" }); }
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((yes) => { resolve = yes; }); return { promise, resolve }; }
