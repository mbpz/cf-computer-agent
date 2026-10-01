// @vitest-environment node
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsRoute } from "../../frontend/app";
import { AppShell } from "../../frontend/components/shell/app-shell";
import { createLocaleRuntime } from "../../frontend/lib/i18n";
import { markVisibleNotificationsRead } from "../../frontend/lib/notifications-data";

const vmContexts = new WeakSet<object>();
class InertVmScript { runInContext(context: Record<string, unknown>) { for (const name of ["Array", "Boolean", "Date", "Error", "Function", "JSON", "Map", "Math", "Number", "Object", "Promise", "RegExp", "Set", "String", "Symbol", "TypeError", "WeakMap", "WeakSet"]) context[name] = (globalThis as unknown as Record<string, unknown>)[name]; } }
vi.mock("node:vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
vi.mock("vm", () => ({ default: { Script: InertVmScript, createContext(value: object) { vmContexts.add(value); return value; }, isContext(value: object) { return vmContexts.has(value); } }, Script: InertVmScript }));
const { Window } = await import("happy-dom");

const session = { member: { id: "member-1", email: "one@test.example", role: "contributor" as const }, capabilities: [], logoutUrl: "/auth/logout" };
const locale = createLocaleRuntime({ navigatorLanguage: "en" });
function deferred() { let resolve!: (value: Response) => void; const promise = new Promise<Response>(r => { resolve = r; }); return { promise, resolve }; }
describe("authenticated shell unread summary", () => {
  let browser: InstanceType<typeof Window>, container: HTMLElement, root: Root;
  let summaries: Array<{ signal?: AbortSignal | null; result: ReturnType<typeof deferred> }>;
  beforeEach(() => {
    browser = new Window({ url: "https://app.test/tasks" });
    vi.stubGlobal("window", browser); vi.stubGlobal("document", browser.document); vi.stubGlobal("navigator", browser.navigator);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = browser.document.createElement("div") as unknown as HTMLElement;
    browser.document.body.append(container as unknown as Node); root = createRoot(container); summaries = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/notifications/summary") { const result = deferred(); summaries.push({ signal: init?.signal, result }); return result.promise; }
      if (String(input) === "/api/notifications/read") return Promise.resolve(Response.json({ marked: 1 }));
      return Promise.resolve(Response.json({ tree: [] }));
    }));
  });
  afterEach(async () => { await act(async () => root.unmount()); browser.close(); vi.unstubAllGlobals(); });
  async function render(id = "member-1", pathname = "/tasks", logoutPending = false) {
    await act(async () => root.render(<AppShell session={{ ...session, member: { ...session.member, id } }} pathname={pathname} locale={locale} logoutPending={logoutPending}><p>Content</p></AppShell>));
  }
  const status = () => container.querySelector("[data-notification-summary]");
  async function answer(index: number, body: unknown, code = 200) { await act(async () => { summaries[index]!.result.resolve(Response.json(body, { status: code })); await new Promise(resolve => setTimeout(resolve, 20)); }); }
  it("loads real summary, distinguishes pending from zero, and labels the topbar count", async () => {
    await render(); expect(summaries).toHaveLength(1);
    expect(status()?.getAttribute("data-state")).toBe("loading"); expect(status()?.textContent).not.toBe("0");
    await answer(0, { unread: 12 }); expect(status()?.textContent).toBe("12");
    expect(status()?.getAttribute("aria-label")).toBe("Unread 12");
    expect(status()?.closest("a")?.getAttribute("href")).toBe("/notifications");
  });
  it("does not fake zero on malformed/failing responses and explicitly retries once", async () => {
    await render(); await answer(0, { unread: -1 });
    expect(status()?.getAttribute("data-state")).toBe("error"); expect(status()?.textContent).not.toBe("0");
    const retry = container.querySelector<HTMLButtonElement>("[data-notification-summary-retry]"); expect(retry).not.toBeNull();
    await act(async () => { retry!.click(); retry!.click(); }); expect(summaries).toHaveLength(2);
    await answer(1, { unread: 0 }); expect(status()?.textContent).toBe("0");
  });
  it("invalidates summary after read mutation without decrementing or replaying a write", async () => {
    await render(); await answer(0, { unread: 7 });
    await act(async () => { await markVisibleNotificationsRead(["notice-1"]); });
    expect(summaries).toHaveLength(2); expect(status()?.getAttribute("data-state")).toBe("loading");
    await answer(1, { unread: 2 }); expect(status()?.textContent).toBe("2");
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/notifications/read")).toHaveLength(1);
  });
  it("reconciles unknown write outcomes by GET only", async () => {
    await render(); await answer(0, { unread: 7 });
    vi.mocked(fetch).mockImplementationOnce(async () => { throw new TypeError("Connection lost"); });
    await act(async () => { await expect(markVisibleNotificationsRead(["notice-1"])).rejects.toThrow("Connection lost"); });
    expect(summaries).toHaveLength(2); await answer(1, { unread: 6 }); expect(status()?.textContent).toBe("6");
  });
  it("aborts old member reads, clears their counts, and ignores a late old response", async () => {
    await render(); await render("member-2"); expect(summaries).toHaveLength(2); expect(summaries[0].signal?.aborted).toBe(true);
    await answer(1, { unread: 3 }); await answer(0, { unread: 99 }); expect(status()?.textContent).toBe("3");
    await render("member-3"); expect(status()?.textContent).not.toBe("3");
  });
  it("refreshes on navigation and return to focus, ignoring late previous requests", async () => {
    await render(); await render("member-1", "/knowledge"); expect(summaries).toHaveLength(2); expect(summaries[0].signal?.aborted).toBe(true);
    await answer(1, { unread: 4 }); await answer(0, { unread: 91 }); expect(status()?.textContent).toBe("4");
    await act(async () => { browser.dispatchEvent(new browser.Event("focus")); }); expect(summaries).toHaveLength(3);
    await answer(2, { unread: 8 }); expect(status()?.textContent).toBe("8");
  });
  it.each([401,403])("clears counts on %s, latches denial and does not retry on focus", async code => {
    await render(); await answer(0, { unread: 7 });
    await act(async () => browser.dispatchEvent(new browser.Event("focus"))); await answer(1, {}, code);
    expect(status()?.getAttribute("data-state")).toBe("forbidden"); expect(status()?.textContent).not.toBe("7");
    await act(async () => browser.dispatchEvent(new browser.Event("focus"))); expect(summaries).toHaveLength(2);
    expect(container.querySelector("[data-notification-summary-retry]")).toBeNull();
  });
  it("supersedes a pre-write summary that resolves after the post-write summary", async () => {
    await render();
    await act(async () => { await markVisibleNotificationsRead(["notice-1"]); });
    expect(summaries).toHaveLength(2); expect(summaries[0].signal?.aborted).toBe(true);
    await answer(1, { unread: 1 }); await answer(0, { unread: 50 }); expect(status()?.textContent).toBe("1");
  });
  it("preserves denial across navigation until the session scope changes", async () => {
    await render(); await answer(0, {}, 403); await render("member-1", "/knowledge");
    expect(summaries).toHaveLength(1); expect(status()?.getAttribute("data-state")).toBe("forbidden");
    await render("member-2", "/knowledge"); expect(summaries).toHaveLength(2);
    await answer(1, { unread: 0 }); expect(status()?.textContent).toBe("0");
  });
  it("localizes loading and verified unread counts without requesting on language-only changes", async () => {
    const zh = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    await act(async () => root.render(<AppShell session={session} pathname="/tasks" locale={zh}><p>内容</p></AppShell>));
    expect(status()?.getAttribute("aria-label")).toBe("正在读取未读通知");
    await answer(0, { unread: 1000 }); expect(status()?.getAttribute("aria-label")).toBe("未读 1000");
    await render(); expect(summaries).toHaveLength(1); expect(status()?.getAttribute("aria-label")).toBe("Unread 1000");
  });
  it("connects the real inbox mark-read button to the Shell summary using authoritative GETs", async () => {
    browser.history.replaceState({}, "", "/notifications");
    let readAt: string | null = null, posts = 0, summaryReads = 0;
    const row = () => ({ id: "notification-1", recipientMemberId: "member-1", eventType: "task.due", actorMemberId: null,
      targetKind: "task", targetId: "task-1", payload: { title: "Due soon" }, deduplicationKey: "due-1", readAt,
      createdAt: "2026-08-30T00:00:00.000Z" });
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const path = String(input);
      if (path === "/api/navigation") return Response.json({ tree: [] });
      if (path === "/api/notifications/summary") { summaryReads++; return Response.json({ unread: readAt ? 0 : 1 }); }
      if (path === "/api/notifications/notification-1/read" && init?.method === "POST") {
        posts++; readAt = "2026-10-01T00:00:00.000Z"; return Response.json(row());
      }
      if (path.startsWith("/api/notifications?")) return Response.json({ items: [row()], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
      throw new Error(`Unexpected request ${path}`);
    });
    await act(async () => root.render(<AppShell session={session} pathname="/notifications" locale={locale}><NotificationsRoute locale={locale} search="" /></AppShell>));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    expect(status()?.textContent).toBe("1");
    const mark = [...container.querySelectorAll("button")].find(button => button.textContent === "Mark as read")!;
    expect(mark).toBeTruthy();
    await act(async () => { mark.click(); mark.click(); await new Promise(resolve => setTimeout(resolve, 40)); });
    for (let attempt = 0; attempt < 20 && !container.querySelector('[data-notification-id="notification-1"]'); attempt++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    }
    expect(posts).toBe(1); expect(summaryReads).toBeGreaterThanOrEqual(4);
    expect(status()?.textContent).toBe("0");
    expect(container.querySelector('[data-notification-id="notification-1"]')?.getAttribute("data-read")).toBe("true");
  });
  it("aborts and clears on logout; unmounted subscriptions never fetch", async () => {
    await render(); await render("member-1", "/tasks", true); expect(summaries[0].signal?.aborted).toBe(true);
    await answer(0, { unread: 99 }); expect(status()?.textContent).not.toBe("99");
    await act(async () => root.render(null));
    await act(async () => { browser.dispatchEvent(new browser.Event("focus")); await markVisibleNotificationsRead(["notice-1"]); });
    expect(summaries).toHaveLength(1);
  });
});
