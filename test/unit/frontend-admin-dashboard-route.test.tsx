// @vitest-environment node
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, mountAuthenticatedApp, waitForApp, type MountedApp } from "../helpers/authenticated-app-harness";
import { apiError, currentNavigationFixture } from "../helpers/workbench-maturity-route-fixtures";
import { AdminDashboardRoute } from "../../frontend/pages/admin/admin-dashboard-route";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

vi.mock("dompurify", () => ({ default: { sanitize: (html: string) => html } }));

const paths = {
  pending: "/api/admin/submissions?page=1&pageSize=20&status=review_pending",
  assets: "/api/admin/assets?page=1&pageSize=20",
  members: "/api/admin/members?page=1&pageSize=20",
};
type Metric = keyof typeof paths;
function page(metric: Metric, total: number) {
  return Response.json({
    items: Array.from({ length: Math.min(total, 20) }, (_, i) => metric === "assets"
      ? { asset: { id: `asset-${i}`, originalName: `asset-${i}.txt` }, job: { status: "succeeded" } }
      : { id: `${metric}-${i}`, title: "Review item", email: "member@app.test", status: metric === "pending" ? "review_pending" : "active" }),
    pagination: { page: 1, pageSize: 20, total, totalPages: Math.ceil(total / 20) },
  });
}
function deferred() {
  let resolve!: (response: Response) => void;
  return { promise: new Promise<Response>((done) => { resolve = done; }), resolve: (response: Response) => resolve(response) };
}

describe("administration dashboard authoritative totals", () => {
  let app: MountedApp | undefined;
  afterEach(async () => { await app?.unmount(); app = undefined; });
  const requests: string[] = [];
  const fetcher = (respond: (metric: Metric, init?: RequestInit) => Promise<Response> | Response): typeof fetch => async (input, init) => {
    const path = String(input);
    if (path === "/api/navigation") return Response.json({ tree: currentNavigationFixture("admin", "0x0") });
    if (path === "/api/telemetry/pageview") return new Response(null, { status: 204 });
    const metric = (Object.keys(paths) as Metric[]).find((key) => paths[key] === path);
    if (!metric) throw new Error(`Unexpected dashboard request ${path}`);
    requests.push(path);
    return respond(metric, init);
  };
  async function mount(respond: (metric: Metric, init?: RequestInit) => Promise<Response> | Response) {
    requests.length = 0;
    app = await mountAuthenticatedApp({ url: "https://app.test/admin", role: "admin", permissionMask: "0x0", fetch: fetcher(respond) });
  }
  const card = (key: Metric) => app!.container.querySelector(`[data-dashboard-metric="${key}"]`)!;
  const value = (key: Metric) => card(key)?.querySelector("[data-metric-value]")?.textContent;
  const click = async (selector: string, twice = false) => act(async () => {
    const button = app!.container.querySelector<HTMLButtonElement>(selector)!;
    expect(button).not.toBeNull(); button.click(); if (twice) button.click();
  });

  it("uses server totals beyond the first 20 rows and links to the exact counting scope", async () => {
    await mount((key) => page(key, { pending: 47, assets: 61, members: 25 }[key]));
    await waitForApp(() => value("pending") === "47");
    expect(value("assets")).toBe("61"); expect(value("members")).toBe("25");
    expect(requests.sort()).toEqual(Object.values(paths).sort());
    expect(card("pending").querySelector("a")?.getAttribute("href")).toBe("/admin/submissions");
    expect(card("assets").querySelector("a")?.getAttribute("href")).toBe("/admin/assets");
    expect(card("members").querySelector("a")?.getAttribute("href")).toBe("/admin/members");
  });

  it("does not fabricate zero while loading, then renders genuine zero as empty", async () => {
    const pending = deferred();
    await mount((key) => key === "pending" ? pending.promise : page(key, 0));
    expect(card("pending")?.querySelector('[data-page-state="loading"]')).not.toBeNull();
    expect(value("pending")).toBeUndefined();
    await waitForApp(() => value("members") === "0");
    expect(value("members")).toBe("0");
    expect(card("members")?.querySelector('[data-page-state="empty"]')).not.toBeNull();
    await act(async () => pending.resolve(page("pending", 0)));
    await waitForApp(() => value("pending") === "0");
  });

  it("isolates a failure and retries only that card once even after a double click", async () => {
    let attempt = 0; const retry = deferred();
    await mount((key) => key === "pending" ? (++attempt === 1 ? apiError(503, "TEMPORARILY_UNAVAILABLE") : retry.promise) : page(key, 3));
    await waitForApp(() => card("pending")?.querySelector('[role="alert"]') != null);
    expect(value("pending")).toBeUndefined(); expect(value("assets")).toBe("3");
    await click('[data-dashboard-metric="pending"] button', true);
    expect(attempt).toBe(2); expect(requests.length).toBe(4);
    await act(async () => retry.resolve(page("pending", 47)));
    await waitForApp(() => value("pending") === "47");
    expect(card("pending").querySelector('[role="alert"]')).toBeNull();
  });

  it("refreshes once, hides outdated totals during refresh and clears them on denial", async () => {
    let refresh = false; const pending = deferred();
    await mount((key) => refresh && key === "pending" ? pending.promise : page(key, 9));
    await waitForApp(() => value("pending") === "9");
    refresh = true;
    await click('[data-dashboard-refresh]', true);
    expect(value("pending")).toBeUndefined();
    expect(requests.length).toBe(6);
    expect(app!.container.querySelector<HTMLButtonElement>('[data-dashboard-refresh]')!.disabled).toBe(true);
    await act(async () => pending.resolve(apiError(403, "FORBIDDEN")));
    await waitForApp(() => card("pending")?.querySelector('[data-page-state="forbidden"]') != null);
    expect(value("pending")).toBeUndefined(); expect(card("pending").querySelector("a")).toBeNull();
    expect(value("members")).toBe("9");
  });

  it("treats malformed pagination as unavailable, never as zero or visible-row count", async () => {
    await mount((key) => key === "members" ? Response.json({ items: [{ id: "bad" }], pagination: { page: 1, pageSize: 20, total: -1, totalPages: 0 } }) : page(key, 1));
    await waitForApp(() => card("members")?.querySelector('[role="alert"]') != null);
    expect(value("members")).toBeUndefined(); expect(value("pending")).toBe("1");
  });

  it("cancels requests when leaving and ignores a late old-route completion", async () => {
    const pending = deferred(); let signal: AbortSignal | null | undefined;
    await mount((key, init) => { if (key === "pending") { signal = init?.signal; return pending.promise; } return page(key, 2); });
    await act(async () => {
      app!.browser.history.pushState({}, "", "/settings");
      app!.browser.dispatchEvent(new app!.browser.PopStateEvent("popstate"));
    });
    await waitForApp(() => app!.container.querySelector('[data-dashboard-metric]') === null);
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(page("pending", 47)));
    expect(app!.container.querySelector('[data-dashboard-metric]')).toBeNull();
  });

  it("does not request or link to member/governance data without their capabilities", async () => {
    requests.length = 0;
    const request = fetcher((key) => page(key, 2));
    app = await mountApp({ url: "https://app.test/admin", fetch: async (input, init) => String(input) === "/api/session"
      ? Response.json({ member: { id: "reviewer", email: "reviewer@app.test", role: "contributor" }, capabilities: ["submission:read-all", "knowledge:review"], permissionMask: "0x0", logoutUrl: "/auth/logout" })
      : request(input, init) });
    await waitForApp(() => value("pending") === "2");
    expect(requests).not.toContain(paths.members);
    expect(value("members")).toBeUndefined();
    expect(card("members").querySelector('[data-page-state="forbidden"]')).not.toBeNull();
    for (const href of ["/admin/members", "/admin/roles", "/admin/menus", "/admin/analytics"]) {
      expect(app.container.querySelector(`main a[href="${href}"]`)).toBeNull();
    }
  });

  it("resets counters and aborts old requests when the session projection changes", async () => {
    const late = deferred(); let oldSignal: AbortSignal | null | undefined;
    await mount((key, init) => { if (key === "members") { oldSignal = init?.signal; return late.promise; } return page(key, 9); });
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    const session = { member: { id: "new-reviewer", email: "reviewer@app.test", role: "contributor" as const },
      capabilities: ["submission:read-all", "knowledge:review"], permissionMask: "0x0", logoutUrl: "/auth/logout" };
    await act(async () => app!.root.render(<AdminDashboardRoute locale={locale} session={session} />));
    await waitForApp(() => value("pending") === "9");
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => late.resolve(page("members", 25)));
    expect(value("members")).toBeUndefined();
    expect(card("members").querySelector("a")).toBeNull();
    const callsBeforeRevocation = requests.length;
    await act(async () => app!.root.render(<AdminDashboardRoute locale={locale} session={{ ...session, capabilities: [] }} />));
    expect(value("pending")).toBeUndefined();
    expect(card("pending").querySelector('[data-page-state="forbidden"]')).not.toBeNull();
    expect(requests).toHaveLength(callsBeforeRevocation);
  });
});
