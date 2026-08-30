// @vitest-environment node
import React, { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsRoute } from "../../frontend/app";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { readWorkspaceLocation, WORKSPACE_LOCATION_CHANGE_EVENT, writeWorkspaceHistory } from "../../frontend/lib/workspace-location";

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

  it("restores URL filters and resets the page when either filter changes", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      requests.push(String(input));
      return String(input).endsWith("/summary") ? Response.json({ unread: 7 }) : pageResponse(String(input), "Initial");
    });
    await renderRoute();
    expect(requests.some((url) => url.includes("page=2") && url.includes("read=false") && url.includes("type=task.due"))).toBe(true);

    await change(container.querySelector('[aria-label="Read status"]') as HTMLSelectElement, "read"); await flush();
    expect(browser.location.search).toBe("?read=read&type=task.due");
    await change(container.querySelector('[aria-label="Notification type"]') as HTMLSelectElement, "task.overdue"); await flush();
    expect(browser.location.search).toBe("?read=read&type=task.overdue");

    await act(async () => { browser.history.back(); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(requests.at(-2)).toContain("type=task.due");
  });

  it("aborts and ignores an older page generation after history restores a newer page", async () => {
    let staleSignal: AbortSignal | undefined; let resolveStale!: (response: Response) => void;
    const stale = new Promise<Response>((resolve) => { resolveStale = resolve; });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/summary")) return Response.json({ unread: 1 });
      const page = Number(new URL(url, "https://app.test").searchParams.get("page"));
      if (page === 2) { staleSignal = init?.signal ?? undefined; return stale; }
      return pageResponse(url, page === 3 ? "Latest" : "Initial");
    });
    browser.history.replaceState({}, "", "/notifications");
    await renderRoute();
    await act(async () => { browser.history.pushState({}, "", "/notifications?page=2"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await settle();
    expect(staleSignal?.aborted).toBe(false);
    await act(async () => { browser.history.pushState({}, "", "/notifications?page=3"); browser.dispatchEvent(new browser.PopStateEvent("popstate")); }); await flush();
    expect(staleSignal?.aborted).toBe(true);
    expect(container.textContent).toContain("Latest");
    await act(async () => resolveStale(pageResponse("/api/notifications?page=2&pageSize=20", "Stale"))); await flush();
    expect(container.textContent).not.toContain("Stale");
  });

  it("posts one read and bounded visible unread IDs, then refreshes server totals", async () => {
    const mutations: Array<{ path: string; body: string }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (init?.method === "POST") {
        mutations.push({ path, body: String(init.body ?? "") });
        return path === "/api/notifications/read" ? Response.json({ marked: 1 }) : Response.json(notification({ readAt: "2026-08-30T01:00:00.000Z" }));
      }
      if (path.endsWith("/summary")) return Response.json({ unread: 9 });
      return Response.json({ items: [notification(), notification({ id: "already-read", readAt: "2026-08-30T01:00:00.000Z" })], pagination: { page: 2, pageSize: 20, total: 22, totalPages: 2 } });
    });
    await renderRoute();
    await click("Mark as read"); await flush();
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
      return Response.json({ items: [notification({ payload: { title } })], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    browser.history.replaceState({}, "", "/notifications");
    await renderRoute();
    expect(container.textContent).toContain("Unread 2");

    await click("Mark as read");
    await change(container.querySelector('[aria-label="Read status"]') as HTMLSelectElement, "read");
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

  it("resets page and filters when the current Notifications menu re-enters its base URL", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/navigation") throw new Error("navigation unavailable");
      if (path.endsWith("/summary")) return Response.json({ unread: 3 });
      requests.push(path);
      return pageResponse(path, path.includes("page=2") ? "Filtered page" : "Default page");
    });
    const session = {
      member: { id: "member-1", email: "member@example.com", role: "contributor" as const },
      capabilities: ["knowledge:read"], permissionMask: "0x100000", logoutUrl: "/auth/logout",
    };
    function Harness() {
      const [location, setLocation] = useState(readWorkspaceLocation);
      useEffect(() => {
        const update = () => setLocation(readWorkspaceLocation());
        window.addEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, update);
        return () => window.removeEventListener(WORKSPACE_LOCATION_CHANGE_EVENT, update);
      }, []);
      return <AppShell session={session} pathname={location.pathname} locale={createLocaleRuntime()} onNavigate={(path) => writeWorkspaceHistory("push", path)}>
        <NotificationsRoute locale={createLocaleRuntime()} search={location.search} />
      </AppShell>;
    }
    await act(async () => root.render(<Harness />));
    await waitForRequest(requests, (path) => path.includes("page=2") && path.includes("read=false") && path.includes("type=task.due"));

    const notificationsLink = container.querySelector("nav[data-shell-sidebar-scroll] a[href='/notifications']") as HTMLAnchorElement;
    await act(async () => notificationsLink.click());
    await waitForRequest(requests, (path) => path.includes("page=1") && !path.includes("read=") && !path.includes("type="));

    expect(browser.location.pathname).toBe("/notifications");
    expect(browser.location.search).toBe("");
    expect(container.textContent).toContain("Default page");
    expect(container.querySelector('[aria-label="Page 1"][aria-current="page"]')).not.toBeNull();
  });

  async function renderRoute() {
    await act(async () => root.render(<NotificationsRoute locale={createLocaleRuntime()} search={browser.location.search} />));
    await flush();
  }
  async function click(label: string) {
    const button = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === label) as HTMLButtonElement;
    expect(button).toBeTruthy(); await act(async () => button.click());
  }
});

function notification(overrides: Record<string, unknown> = {}) {
  return { id: "notification-1", recipientMemberId: "member-1", eventType: "task.due", actorMemberId: null, targetKind: "task", targetId: "task-1", payload: { title: "Due soon" }, deduplicationKey: "due-1", readAt: null, createdAt: "2026-08-30T00:00:00.000Z", ...overrides };
}
function pageResponse(url: string, title: string): Response {
  const params = new URL(url, "https://app.test").searchParams; const page = Number(params.get("page") || "1"); const pageSize = Number(params.get("pageSize") || "20"); const total = page === 3 ? 41 : 21;
  const offset = (page - 1) * pageSize; const count = Math.max(0, Math.min(pageSize, total - offset));
  const items = Array.from({ length: count }, (_unused, index) => notification({ id: `notification-${index + 1}`, payload: { title: index === 0 ? title : `${title} ${index + 1}` } }));
  return Response.json({ items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
}
async function change(control: HTMLSelectElement, value: string) { await act(async () => { control.value = value; control.dispatchEvent(new window.Event("change", { bubbles: true })); }); }
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
