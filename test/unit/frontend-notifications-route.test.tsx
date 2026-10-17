// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, NotificationsRoute } from "../../frontend/app";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { writeWorkspaceHistory } from "../../frontend/lib/workspace-location";
import { stubListViewport } from "../helpers/list-viewport";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

describe("notification inbox route", () => {
  let browser: InstanceType<typeof Window>; let container: HTMLElement; let root: Root;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/notifications?read=unread&type=task.due&page=2" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("history", browser.history); vi.stubGlobal("location", browser.location); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement; browser.document.body.append(container as unknown as Node); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });

  it("restores URL filters, appends on end-of-list, and restarts page one when either filter changes", async () => {
    stubListViewport(browser, "mobile");
    const requests: Array<{ url: string; signal?: AbortSignal | null }> = [];
    let holdAppend = false;
    let resolveAppend!: (response: Response) => void;
    const append = new Promise<Response>((resolve) => { resolveAppend = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/summary")) return Response.json({ unread: 7 });
      requests.push({ url, signal: init?.signal });
      const params = new URL(url, "https://app.test").searchParams;
      const page = Number(params.get("page"));
      if (page === 2) {
        if (holdAppend) return append;
        return Response.json({ items: [notification({ id: "p2-0", payload: { title: "p2-0" } })], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } });
      }
      const readAt = params.get("read") === "true" ? "2026-08-30T01:00:00.000Z" : null;
      const items = Array.from({ length: 20 }, (_unused, index) => notification({ id: `p1-${index}`, readAt, payload: { title: `p1-${index}` } }));
      return Response.json({ items, pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } });
    });
    await renderRoute();
    // A stray ?page=2 in the URL is ignored: the first load is always page one with the URL filters.
    expect(requests.map((request) => request.url)).toEqual(["/api/notifications?page=1&pageSize=20&read=false&type=task.due"]);
    expect(container.textContent).toContain("p1-0");

    // Scrolling to the end appends page two without dropping page one's rows.
    holdAppend = true;
    await scrollToEnd();
    const appended = requests.at(-1)!;
    expect(appended.url).toBe("/api/notifications?page=2&pageSize=20&read=false&type=task.due");
    await act(async () => resolveAppend(Response.json({ items: [notification({ id: "p2-0", payload: { title: "p2-0" } })], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } })));
    await flush();
    expect(container.textContent).toContain("p1-0");
    expect(container.textContent).toContain("p2-0");

    // A filter change replaces the window at page one and aborts the superseded window.
    holdAppend = false;
    await selectFilter("Read status", "Read"); await flush();
    expect(browser.location.search).toBe("?read=read&type=task.due");
    expect(appended.signal?.aborted).toBe(true);
    expect(requests.at(-1)!.url).toBe("/api/notifications?page=1&pageSize=20&read=true&type=task.due");
    expect(container.textContent).toContain("p1-0");
    expect(container.textContent).not.toContain("p2-0");

    await selectFilter("Notification type", "Task overdue"); await flush();
    expect(browser.location.search).toBe("?read=read&type=task.overdue");
    expect(requests.at(-1)!.url).toBe("/api/notifications?page=1&pageSize=20&read=true&type=task.overdue");

    const beforeBack = requests.length;
    await act(async () => { browser.history.back(); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(requests.slice(beforeBack).some((request) => request.url.endsWith("page=1&pageSize=20&read=true&type=task.due"))).toBe(true);
  });

  it("aborts and ignores an older filtered generation after history restores a newer filter", async () => {
    let staleSignal: AbortSignal | undefined; let resolveStale!: (response: Response) => void;
    const stale = new Promise<Response>((resolve) => { resolveStale = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/summary")) return Response.json({ unread: 1 });
      const read = new URL(url, "https://app.test").searchParams.get("read");
      if (read === "false") { staleSignal = init?.signal ?? undefined; return stale; }
      return pageResponse(url, read === "true" ? "Latest" : "Initial");
    });
    browser.history.replaceState({}, "", "/notifications");
    await renderRoute();
    await act(async () => { browser.history.pushState({}, "", "/notifications?read=unread"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await settle();
    expect(staleSignal?.aborted).toBe(false);
    await act(async () => { browser.history.pushState({}, "", "/notifications?read=read"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(staleSignal?.aborted).toBe(true);
    expect(container.textContent).toContain("Latest");
    await act(async () => resolveStale(pageResponse("/api/notifications?page=1&pageSize=20&read=false", "Stale"))); await flush();
    expect(container.textContent).not.toContain("Stale");
  });

  it("posts one read and bounded visible unread IDs, then refreshes server totals", async () => {
    browser.history.replaceState({}, "", "/notifications");
    const mutations: Array<{ path: string; body: string }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") {
        mutations.push({ path, body: String(init.body ?? "") });
        return path === "/api/notifications/read" ? Response.json({ marked: 1 }) : Response.json(notification({ readAt: "2026-08-30T01:00:00.000Z" }));
      }
      if (path.endsWith("/summary")) return Response.json({ unread: 9 });
      const page = Number(new URL(path, "https://app.test").searchParams.get("page") ?? "1");
      return Response.json({ items: [notification(), notification({ id: "already-read", readAt: "2026-08-30T01:00:00.000Z" })], pagination: { page, pageSize: 20, total: page === 1 ? 2 : 0, totalPages: page === 1 ? 1 : 0 } });
    });
    await renderRoute();
    await click("Mark as read"); await waitForText("Mark visible as read");
    await click("Mark visible as read"); await flush();
    expect(mutations).toEqual([
      { path: "/api/notifications/notification-1/read", body: "" },
      { path: "/api/notifications/read", body: JSON.stringify({ ids: ["notification-1"] }) },
    ]);
  });

  it("converges the current unread summary when mark-read commits after filter navigation", async () => {
    let resolveMutation!: (response: Response) => void;
    const delayedMutation = new Promise<Response>((resolve) => { resolveMutation = resolve; });
    let committed = false;
    const pageTitles: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") return delayedMutation;
      if (path.endsWith("/summary")) return Response.json({ unread: committed ? 1 : 2 });
      const read = new URL(path, "https://app.test").searchParams.get("read");
      const title = read === "true" ? (committed ? "Converged read page" : "Early read page") : "Unread page";
      pageTitles.push(title);
      return Response.json({ items: [notification({ payload: { title }, readAt: read === "true" ? "2026-08-30T01:00:00.000Z" : null })], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    browser.history.replaceState({}, "", "/notifications");
    await renderRoute();
    expect(container.textContent).toContain("Unread 2");

    await click("Mark as read");
    await selectFilter("Read status", "Read");
    await flush();
    expect(container.textContent).toContain("Early read page");
    expect(container.textContent).toContain("Unread 2");

    committed = true;
    await act(async () => resolveMutation(Response.json(notification({ readAt: "2026-08-30T01:00:00.000Z" }))));
    await waitForText("Converged read page");
    expect(browser.location.search).toBe("?read=read");
    expect(container.textContent).toContain("Converged read page");
    expect(container.textContent).toContain("Unread 1");
    expect(pageTitles).toContain("Early read page");
  });

  it("resets page and filters when the global Notifications link re-enters its base URL without accepting the stale response", async () => {
    const requests: string[] = [];
    let resolveFiltered!: (response: Response) => void;
    const filtered = new Promise<Response>((resolve) => { resolveFiltered = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/session") return Response.json(session);
      if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
      if (path === "/api/navigation") throw new Error("navigation unavailable");
      if (path.endsWith("/summary")) return Response.json({ unread: 3 });
      requests.push(path);
      return path.includes("read=false") && path.includes("type=task.due") ? filtered : pageResponse(path, "Default page");
    });
    const session = {
      member: { id: "member-1", email: "member@example.com", role: "contributor" as const },
      capabilities: ["knowledge:read"], permissionMask: "0x100000", logoutUrl: "/auth/logout",
    };
    await act(async () => root.render(<App />));
    await waitForRequest(requests, (path) => path.includes("page=1") && path.includes("read=false") && path.includes("type=task.due"));

    const notificationsLink = container.querySelector("nav[data-shell-collaboration-navigation] a[href='/notifications']") as HTMLAnchorElement;
    expect(notificationsLink).not.toBeNull();
    await act(async () => notificationsLink.click());
    await waitForRequest(requests, (path) => path.includes("page=1") && !path.includes("read=") && !path.includes("type="));

    expect(browser.location.pathname).toBe("/notifications");
    expect(browser.location.search).toBe("");
    expect(container.textContent).toContain("Default page");

    await act(async () => resolveFiltered(pageResponse("/api/notifications?page=1&pageSize=20&read=false", "Stale filtered page")));
    await flush();
    expect(container.textContent).toContain("Default page");
    expect(container.textContent).not.toContain("Stale filtered page");
  });

  it.each([true, false])("revalidates the target on open and navigates only if still authorized (%s)", async (authorized) => {
    browser.history.replaceState({}, "", "/notifications");
    const posts: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") {
        posts.push(path);
        return Response.json(notification({ readAt: "2026-08-30T01:00:00.000Z", targetKind: authorized ? "submission" : null, targetId: authorized ? "submission-1" : null, eventType: "submission.rejected", payload: {} }));
      }
      return path.endsWith("/summary") ? Response.json({ unread: 1 }) : pageResponse(path, "Initial");
    });
    await renderRoute();
    await click("Open"); await flush();
    expect(posts).toEqual(["/api/notifications/notification-1/read"]);
    expect(browser.location.pathname).toBe(authorized ? "/my-submissions" : "/notifications");
    if (!authorized) { await waitForText("This item is no longer available"); expect(container.textContent).toContain("This item is no longer available"); }
  });

  it.each([
    { id: "another-notification", readAt: "2026-08-30T01:00:00.000Z" },
    { id: "notification-1", readAt: null },
  ])("does not navigate or refresh on a mismatched read receipt (%j)", async (receipt) => {
    browser.history.replaceState({}, "", "/notifications");
    let listRequests = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json(notification({ ...receipt, targetKind: "submission", targetId: "submission-1" }));
      if (String(input).endsWith("/summary")) return Response.json({ unread: 1 });
      listRequests += 1;
      return pageResponse(String(input), "Current notification");
    });
    await renderRoute();
    const before = listRequests;
    await click("Open"); await flush();
    expect(browser.location.pathname).toBe("/notifications");
    expect(listRequests).toBe(before);
    expect(container.textContent).toContain("Unable to update notifications");
  });

  it("does not navigate after an in-flight open leaves its location", async () => {
    browser.history.replaceState({}, "", "/notifications");
    let resolveRead!: (response: Response) => void;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((resolve) => { resolveRead = resolve; });
      return String(input).endsWith("/summary") ? Response.json({ unread: 1 }) : pageResponse(String(input), "Initial");
    });
    await renderRoute(); await click("Open");
    await selectFilter("Read status", "Read"); await flush();
    await act(async () => resolveRead(Response.json(notification({ readAt: "2026-08-30T01:00:00.000Z" })))); await flush();
    expect(browser.location.pathname + browser.location.search).toBe("/notifications?read=read");
  });

  it.each([401, 403])("clears protected state and invalidates in-flight reads when open loses authorization (%s)", async (status) => {
    browser.history.replaceState({}, "", "/notifications");
    let resolveRead!: (response: Response) => void;
    let resolveList!: (response: Response) => void;
    let staleSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") return new Promise<Response>((resolve) => { resolveRead = resolve; });
      if (path.endsWith("/summary")) return Response.json({ unread: 1 });
      if (path.includes("read=true")) { staleSignal = init?.signal ?? undefined; return new Promise<Response>((resolve) => { resolveList = resolve; }); }
      return pageResponse(path, "Protected notification");
    });
    await renderRoute(); await click("Open");
    await selectFilter("Read status", "Read"); await settle();
    await act(async () => resolveRead(Response.json({ error: { code: status === 401 ? "AUTH_REQUIRED" : "FORBIDDEN", message: "Denied", retryable: false } }, { status }))); await flush();
    expect(container.querySelector("[data-page-state='forbidden']")).not.toBeNull();
    expect(container.querySelector("[data-notification-id]")).toBeNull();
    expect(container.textContent).not.toContain("Unread total");
    expect(staleSignal?.aborted).toBe(true);
    expect(container.textContent).toContain("Sign in with an authorized account");
    await act(async () => resolveList(pageResponse("/api/notifications?page=1", "Stale protected notification"))); await flush();
    expect(container.querySelector("[data-notification-id]")).toBeNull();
  });

  it("requires read-only recovery when a late open failure may have changed a different notification view", async () => {
    browser.history.replaceState({}, "", "/notifications");
    let resolveRead!: (response: Response) => void;
    let listRequests = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((resolve) => { resolveRead = resolve; });
      if (String(input).endsWith("/summary")) return Response.json({ unread: 1 });
      listRequests += 1; return pageResponse(String(input), "Current view");
    });
    await renderRoute(); await click("Open");
    await selectFilter("Read status", "Read"); await flush();
    const before = listRequests;
    await act(async () => resolveRead(Response.json({ error: { code: "API_ERROR", message: "Failed", retryable: true } }, { status: 500 }))); await flush();
    expect(container.textContent).toContain("Check the current notification state");
    expect(container.querySelector("[data-notification-id]")).toBeNull();
    expect(listRequests).toBe(before);
    await click("Try notifications again"); await waitForText("Current view");
    expect(container.textContent).toContain("Current view");
    expect(browser.location.search).toBe("?read=read");
    expect(listRequests).toBe(before + 1);
  });

  it.each(["Mark as read", "Mark visible as read", "Open"])("recovers an unknown %s result using only GET and hides stale writes", async (action) => {
    browser.history.replaceState({}, "", "/notifications?read=unread&type=task.due");
    let posts = 0;
    let failRead = false;
    let committed = false;
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input); requests.push(path);
      if (init?.method === "POST") { posts += 1; committed = true; throw new TypeError("lost response"); }
      if (failRead) throw new TypeError("read unavailable");
      if (path.endsWith("/summary")) return Response.json({ unread: committed ? 0 : 1 });
      return Response.json({ items: committed ? [] : [notification()], pagination: { page: 1, pageSize: 20, total: committed ? 0 : 1, totalPages: committed ? 0 : 1 } });
    });
    await renderRoute(); await click(action); await flush();
    expect(container.querySelector("[data-notification-id]")).toBeNull();
    expect(container.textContent).not.toContain("Unread 1");
    expect(container.textContent).toContain("Check the current notification state");
    expect(browser.location.pathname).toBe("/notifications");
    failRead = true;
    await click("Try notifications again"); await flush();
    expect(container.querySelector("[data-notification-id]")).toBeNull();
    expect(container.querySelector("[data-page-state='error']")).not.toBeNull();
    failRead = false;
    await click("Try notifications again"); await flush();
    expect(container.textContent).toContain("Unread 0");
    expect(container.querySelector("[data-page-state='empty']")).not.toBeNull();
    expect(posts).toBe(1);
    expect(requests.filter((path) => path.includes("?"))).toEqual(Array(3).fill("/api/notifications?page=1&pageSize=20&read=false&type=task.due"));
  });

  it("keeps writes hidden until both post-write list and summary reconcile", async () => {
    browser.history.replaceState({}, "", "/notifications");
    let posts = 0;
    let releaseSummary!: (response: Response) => void;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return Response.json(notification({ readAt: "2026-08-30T01:00:00.000Z" })); }
      if (String(input).endsWith("/summary")) return posts === 0 ? Response.json({ unread: 1 }) : new Promise<Response>((resolve) => { releaseSummary = resolve; });
      return Response.json({ items: [notification({ readAt: posts ? "2026-08-30T01:00:00.000Z" : null })], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    await renderRoute(); await click("Mark as read"); await flush();
    expect(container.querySelector("[data-notification-id]")).toBeNull();
    expect(container.querySelector("[data-page-state='loading']")).not.toBeNull();
    await act(async () => releaseSummary(Response.json({ unread: 0 }))); await flush();
    expect(container.querySelector("[data-read='true']")).not.toBeNull();
    expect(container.textContent).toContain("Unread 0");
    expect(posts).toBe(1);
  });

  it("disables visible bulk writes while a different filtered page is loading", async () => {
    browser.history.replaceState({}, "", "/notifications");
    let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return Response.json({ marked: 1 }); }
      if (String(input).endsWith("/summary")) return Response.json({ unread: 1 });
      if (String(input).includes("read=true")) return new Promise<Response>(() => {});
      return pageResponse(String(input), "Original page");
    });
    await renderRoute();
    await selectFilter("Read status", "Read"); await flush();
    const bulk = [...container.querySelectorAll("button")].find((button) => button.textContent === "Mark visible as read") as HTMLButtonElement | undefined;
    expect(!bulk || bulk.disabled).toBe(true);
    if (bulk) await act(async () => bulk.click());
    expect(posts).toBe(0);
  });

  it.each(["list", "summary"])("recovers a confirmed write when its %s readback fails without another POST", async (failure) => {
    browser.history.replaceState({}, "", "/notifications");
    let posts = 0;
    let fail = true;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const summary = String(input).endsWith("/summary");
      if (init?.method === "POST") { posts += 1; return Response.json({ marked: 1 }); }
      if (posts && fail && (summary ? failure === "summary" : failure === "list")) return Response.json({ error: { code: "READ_FAILED", message: "Failed", retryable: true } }, { status: 500 });
      if (summary) return Response.json({ unread: posts ? 0 : 1 });
      return Response.json({ items: [notification({ readAt: posts ? "2026-08-30T01:00:00.000Z" : null })], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    await renderRoute(); await click("Mark visible as read"); await waitForText("Unable to load notifications");
    expect(container.querySelector("[data-notification-id]")).toBeNull();
    expect(container.textContent).not.toContain("Unread 1");
    fail = false;
    await click("Try notifications again"); await waitForText("Unread 0");
    expect(container.querySelector("[data-read='true']")).not.toBeNull();
    expect(posts).toBe(1);
  });

  it("invalidates a pending filtered read when a write response is lost", async () => {
    browser.history.replaceState({}, "", "/notifications");
    let rejectWrite!: (error: Error) => void;
    let releaseList!: (response: Response) => void;
    let staleSignal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((_resolve, reject) => { rejectWrite = reject; });
      if (String(input).endsWith("/summary")) return Response.json({ unread: 1 });
      if (String(input).includes("read=true")) { staleSignal = init?.signal; return new Promise<Response>((resolve) => { releaseList = resolve; }); }
      return pageResponse(String(input), "Initial");
    });
    await renderRoute(); await click("Mark as read");
    await selectFilter("Read status", "Read"); await flush();
    await act(async () => rejectWrite(new TypeError("lost response"))); await flush();
    expect(staleSignal?.aborted).toBe(true);
    await act(async () => releaseList(pageResponse("/api/notifications?page=1&read=true", "Stale writable page"))); await flush();
    expect(container.textContent).toContain("Check the current notification state");
    expect(container.textContent).not.toContain("Stale writable page");
    expect(container.querySelector("[data-notification-id]")).toBeNull();
  });

  it.each([401, 403])("clears both snapshots when recovery loses authorization (%s)", async (status) => {
    browser.history.replaceState({}, "", "/notifications");
    let wrote = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { wrote = true; throw new TypeError("lost response"); }
      if (wrote) return Response.json({ error: { code: "FORBIDDEN", message: "Denied", retryable: false } }, { status });
      return String(input).endsWith("/summary") ? Response.json({ unread: 1 }) : pageResponse(String(input), "Protected");
    });
    await renderRoute(); await click("Mark as read"); await flush();
    await click("Try notifications again"); await flush();
    expect(container.querySelector("[data-page-state='forbidden']")).not.toBeNull();
    expect(container.querySelector("[data-notification-id]")).toBeNull();
    expect(container.textContent).not.toContain("Unread 1");
  });

  it("bounds repeated clicks and reloads page one after a bulk read without re-requesting an emptied last page", async () => {
    stubListViewport(browser, "mobile");
    browser.history.replaceState({}, "", "/notifications?read=unread");
    const listRequests: string[] = [];
    const bulkBodies: string[] = [];
    let posts = 0;
    let release!: (response: Response) => void;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") { posts += 1; bulkBodies.push(String(init.body ?? "")); return new Promise<Response>((resolve) => { release = resolve; }); }
      if (path.endsWith("/summary")) return Response.json({ unread: posts ? 20 : 21 });
      listRequests.push(path);
      const page = Number(new URL(path, "https://app.test").searchParams.get("page"));
      const items = posts
        ? Array.from({ length: 20 }, (_unused, index) => notification({ id: `notification-${index}` }))
        : page === 2 ? [notification({ id: "notification-last" })] : Array.from({ length: 20 }, (_unused, index) => notification({ id: `notification-${index}` }));
      return Response.json({ items, pagination: { page, pageSize: 20, total: posts ? 20 : 21, totalPages: posts ? 1 : 2 } });
    });
    await renderRoute();
    // The append makes the emptied last page visible before the bulk write.
    await scrollToEnd();
    expect(listRequests.filter((url) => url.includes("page=2"))).toHaveLength(1);
    expect(container.querySelector('[data-notification-id="notification-last"]')).not.toBeNull();

    const bulk = [...container.querySelectorAll("button")].find((button) => button.textContent === "Mark visible as read") as HTMLButtonElement;
    expect(bulk).toBeTruthy();
    await act(async () => { bulk.click(); bulk.click(); });
    // Repeated clicks during one bulk write still send a single bounded id list.
    expect(posts).toBe(1);
    expect(JSON.parse(bulkBodies[0]!)).toEqual({ ids: [...Array.from({ length: 20 }, (_unused, index) => `notification-${index}`), "notification-last"] });

    await act(async () => release(Response.json({ marked: 1 }))); await waitForText("Unread 20");
    // The write reloads page one; the emptied last page must never be re-requested.
    expect(browser.location.search).toBe("?read=unread");
    expect(listRequests.filter((url) => url.includes("page=2"))).toHaveLength(1);
    expect(container.querySelectorAll("[data-notification-id]")).toHaveLength(20);
    expect(container.querySelector('[data-notification-id="notification-last"]')).toBeNull();
    expect(posts).toBe(1);
  });

  it("blocks leaving while a notification update is in flight, keeps its own filter, and releases after the update reconciles", async () => {
    let resolveRead!: (response: Response) => void;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Promise<Response>((resolve) => { resolveRead = resolve; });
      if (String(input).endsWith("/summary")) return Response.json({ unread: 1 });
      return pageResponse(String(input), "Current");
    });
    await renderRoute();
    await click("Mark as read");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    expect(browser.location.pathname).toBe("/notifications");
    const unload = new browser.Event("beforeunload", { cancelable: true });
    browser.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    await selectFilter("Read status", "Read");
    await flush();
    expect(browser.location.search).toContain("read=read");

    await act(async () => resolveRead(Response.json(notification({ readAt: "2026-08-30T01:00:00.000Z" }))));
    await flush();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("keeps leave blocked after an unknown update until a reload shows the current list", async () => {
    let failRead = false;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") throw new TypeError("lost response");
      if (failRead) throw new TypeError("read unavailable");
      if (String(input).endsWith("/summary")) return Response.json({ unread: 0 });
      return pageResponse(String(input), "Checked");
    });
    await renderRoute();
    await click("Mark as read");
    await flush();
    expect(container.textContent).toContain("Check the current notification state");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    const unload = new browser.Event("beforeunload", { cancelable: true });
    browser.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    failRead = true;
    await click("Try notifications again");
    await flush();
    expect(container.querySelector("[data-page-state='error']")).not.toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");

    failRead = false;
    await click("Try notifications again");
    await waitForText("Checked");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("restores an unknown notification update after remount and keeps leave blocked until the list reloads", async () => {
    let hold = false;
    const pending: Array<() => void> = [];
    let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; throw new TypeError("lost response"); }
      if (hold) return new Promise<Response>((resolve) => {
        pending.push(() => resolve(String(input).endsWith("/summary") ? Response.json({ unread: 1 }) : pageResponse(String(input), "Restored")));
      });
      if (String(input).endsWith("/summary")) return Response.json({ unread: 1 });
      return pageResponse(String(input), "Current");
    });
    await act(async () => root.render(<NotificationsRoute memberId="member-a" locale={createLocaleRuntime()} search="" />));
    await flush();
    await click("Mark as read");
    await flush();
    expect(posts).toBe(1);
    expect(browser.sessionStorage.getItem("memory-garden:notification-update:v1:member-a")).toContain("notification-1");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");

    hold = true;
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<NotificationsRoute memberId="member-a" locale={createLocaleRuntime()} search="" />));
    await flush();
    expect(posts).toBe(1);
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("blocked");
    const unload = new browser.Event("beforeunload", { cancelable: true });
    browser.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    hold = false;
    await act(async () => { for (const release of pending) release(); });
    await waitForText("Restored");
    expect(browser.sessionStorage.getItem("memory-garden:notification-update:v1:member-a")).toBeNull();
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("does not send a notification update when this tab cannot record it", async () => {
    let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return Response.json(notification({ readAt: "2026-08-30T01:00:00.000Z" })); }
      if (String(input).endsWith("/summary")) return Response.json({ unread: 1 });
      return pageResponse(String(input), "Current");
    });
    await act(async () => root.render(<NotificationsRoute memberId="member-a" locale={createLocaleRuntime()} search="" />));
    await flush();
    vi.spyOn(browser.sessionStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
    await click("Mark as read");
    await flush();
    expect(posts).toBe(0);
    expect(container.textContent).toContain("could not record");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
  });

  it("blocks notification writes but not leave when the stored update cannot be read, until it is discarded", async () => {
    browser.sessionStorage.setItem("memory-garden:notification-update:v1:member-a", "{");
    let posts = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { posts += 1; return Response.json(notification({ readAt: "2026-08-30T01:00:00.000Z" })); }
      if (String(input).endsWith("/summary")) return Response.json({ unread: 1 });
      return pageResponse(String(input), "Current");
    });
    await act(async () => root.render(<NotificationsRoute memberId="member-a" locale={createLocaleRuntime()} search="" />));
    await flush();
    expect(container.textContent).toContain("can't be read");
    expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed");
    const mark = [...container.querySelectorAll("button")].find((button) => button.textContent === "Mark as read") as HTMLButtonElement;
    expect(mark.disabled).toBe(true);
    await act(async () => mark.click());
    expect(posts).toBe(0);
    await click("Discard record");
    await flush();
    expect(container.textContent).not.toContain("can't be read");
    await click("Mark as read");
    await flush();
    expect(posts).toBe(1);
  });

  it.each([401, 403])("releases the leave lock when an in-flight update is denied with %s", async (status) => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Response.json({ error: { code: "FORBIDDEN", message: "Denied", retryable: false } }, { status });
      return String(input).endsWith("/summary") ? Response.json({ unread: 1 }) : pageResponse(String(input), "Protected");
    });
    await renderRoute();
    await click("Mark as read");
    await flush();
    expect(container.querySelector("[data-page-state='forbidden']")).not.toBeNull();
    const errors = vi.spyOn(console, "error");
    try {
      // Navigation notifies the mounted route; flush that update before DOM teardown.
      await act(async () => { expect(writeWorkspaceHistory("push", "/tasks")).toBe("committed"); });
      expect(browser.location.pathname).toBe("/tasks");
      expect(errors.mock.calls.filter(args => String(args[0]).includes("not wrapped in act"))).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });

  it("shows the explicit revoked target state when opening a notification whose target access was revoked", async () => {
    browser.history.replaceState({}, "", "/notifications");
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    let revoked = false;
    const writes: string[] = [];
    const revokedItem = { readAt: "2026-08-30T01:00:00.000Z", targetKind: null, targetId: null };
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/summary")) return Response.json({ unread: revoked ? 0 : 1 });
      if (init?.method === "POST") {
        writes.push(url);
        // The worker returns 200 with a redacted target: the open still converges the receipt.
        return Response.json(notification(revoked ? revokedItem : {}));
      }
      return Response.json({ items: [notification(revoked ? revokedItem : {})], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    await act(async () => root.render(<NotificationsRoute locale={locale} search="" />));
    await waitForText("Due soon");
    expect(container.textContent).toContain(`${frontendText(locale, "NOTIFICATIONS_UNREAD_COUNT")} 1`);

    revoked = true;
    await click(frontendText(locale, "NOTIFICATIONS_OPEN"));
    await flush(); await flush();
    expect(container.querySelector("[data-notification-target-revoked]")).not.toBeNull();
    expect(container.querySelector("[data-page-state='forbidden']")).not.toBeNull();
    expect(container.querySelector("[data-page-state='error']")).toBeNull();
    expect(container.textContent).toContain(frontendText(locale, "NOTIFICATIONS_TARGET_UNAVAILABLE"));
    // The unread total converges after the revoked open, and the private target never navigates.
    expect(container.textContent).toContain(`${frontendText(locale, "NOTIFICATIONS_UNREAD_COUNT")} 0`);
    expect(browser.location.pathname).toBe("/notifications");
    expect(writes).toEqual(["/api/notifications/notification-1/read"]);
    const row = container.querySelector('[data-notification-id="notification-1"]')!;
    expect(row.getAttribute("data-read")).toBe("true");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === frontendText(locale, "NOTIFICATIONS_OPEN"))).toBe(false);
    expect(container.textContent).toContain(frontendText(locale, "NOTIFICATIONS_TARGET_UNAVAILABLE"));

    // Recoverable: an explicit retry re-reads the list and clears the revoked notice.
    await click(frontendText(locale, "NOTIFICATIONS_RETRY"));
    await flush(); await flush();
    expect(container.querySelector("[data-notification-target-revoked]")).toBeNull();
    expect(container.textContent).toContain(`${frontendText(locale, "NOTIFICATIONS_UNREAD_COUNT")} 0`);
    expect(writes).toHaveLength(1);
  });

  it("keeps the page header and filters mounted through a first load and a read failure", async () => {
    browser.history.replaceState({}, "", "/notifications");
    const first = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => String(input).endsWith("/summary") ? Response.json({ unread: 0 }) : first.promise);
    await act(async () => root.render(<NotificationsRoute locale={createLocaleRuntime()} search="" />));
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelectorAll('button[aria-haspopup="listbox"]')).toHaveLength(2);
    const title = container.querySelector("h1")!.textContent;
    await act(async () => first.resolve(Response.json({ error: { code: "READ_FAILED", message: "Unavailable", retryable: true } }, { status: 500 })));
    await flush();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")!.textContent).toBe(title);
    expect(container.querySelectorAll('button[aria-haspopup="listbox"]')).toHaveLength(2);
    expect(container.querySelector("[data-page-state='error']")).not.toBeNull();
  });

  async function renderRoute() {
    await act(async () => root.render(<NotificationsRoute locale={createLocaleRuntime()} search={browser.location.search} />));
    await flush();
  }
  /** Below the shell's `lg` edge the filter row moves into a portalled bottom
      sheet, so its controls are found in the document rather than in `container`
      and the disclosure has to be opened first. Selecting an option leaves the
      panel open, and re-clicking the trigger would only re-open it. */
  async function openFilters() {
    const trigger = container.querySelector<HTMLButtonElement>("[data-filter-disclosure-trigger]");
    if (!trigger || trigger.getAttribute("aria-expanded") === "true") return;
    await act(async () => trigger.click());
  }
  async function click(label: string) {
    const find = () => [...document.querySelectorAll("button"), ...browser.document.querySelectorAll("button")].find((candidate) => candidate.textContent === label) as HTMLButtonElement | undefined;
    let button = find();
    if (!button) { await openFilters(); button = find(); }
    expect(button, `button ${label}`).toBeTruthy(); await act(async () => button!.click());
  }
  /** Both inbox filters are beUI listboxes now: the trigger carries the historical
      accessible name in an sr-only span; pick the option by its visible label. */
  async function selectFilter(ariaLabel: string, optionLabel: string) {
    await openFilters();
    const trigger = [...browser.document.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="listbox"]')].find((node) => node.querySelector(".sr-only")?.textContent === ariaLabel);
    expect(trigger, `filter ${ariaLabel}`).toBeTruthy();
    await act(async () => trigger!.click());
    const option = [...browser.document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((node) => node.textContent === optionLabel);
    expect(option, `option ${optionLabel}`).toBeTruthy();
    await act(async () => option!.click());
  }
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

function notification(overrides: Record<string, unknown> = {}) {
  return { id: "notification-1", recipientMemberId: "member-1", eventType: "task.due", actorMemberId: null, targetKind: "task", targetId: "task-1", payload: { title: "Due soon" }, deduplicationKey: "due-1", readAt: null, createdAt: "2026-08-30T00:00:00.000Z", ...overrides };
}
function pageResponse(url: string, title: string): Response {
  const params = new URL(url, "https://app.test").searchParams; const page = Number(params.get("page") || "1"); const pageSize = Number(params.get("pageSize") || "20"); const total = page === 3 ? 41 : 21;
  const offset = (page - 1) * pageSize; const count = Math.max(0, Math.min(pageSize, total - offset));
  const items = Array.from({ length: count }, (_unused, index) => notification({ id: `notification-${index + 1}`, eventType: params.get("type") ?? "task.due", readAt: params.get("read") === "true" ? "2026-08-30T01:00:00.000Z" : null, payload: { title: index === 0 ? title : `${title} ${index + 1}` } }));
  return Response.json({ items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
async function settle() { await act(async () => { for (let index = 0; index < 20; index += 1) await Promise.resolve(); }); }
async function waitForText(text: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flush();
    if (document.body.textContent?.includes(text)) return;
  }
}
async function waitForRequest(requests: string[], predicate: (path: string) => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await flush();
    if (requests.some(predicate)) return;
  }
  throw new Error("request not observed");
}
