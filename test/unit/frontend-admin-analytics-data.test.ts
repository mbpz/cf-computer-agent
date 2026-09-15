import { describe, expect, it, vi } from "vitest";
import { loadAdminAnalytics } from "../../frontend/lib/admin-analytics-data";

describe("admin analytics data", () => {
  it("requests and normalizes numbered visitor details", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({
      range: { from: "2026-08-20", to: "2026-08-26", days: 7 },
      totals: { pageViews: 51, uniqueVisitors: 1, loginUsers: 0 },
      daily: [{ day: "2026-08-25", pageViews: 50, uniqueVisitors: 1, loginUsers: 0 }, { day: "2026-08-26", pageViews: 1, uniqueVisitors: 1, loginUsers: 0 }],
      breakdowns: { paths: [], regions: [], countries: [] },
      recentVisitors: {
        items: [{ occurredAt: "2026-08-26T00:00:00.000Z", path: "/", ip: "203.0.113.0", country: null, region: null, city: null, colo: null, userAgent: null, member: null }],
        pagination: { page: 2, pageSize: 50, total: 51, totalPages: 2 },
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const signal = new AbortController().signal;

    const result = await loadAdminAnalytics({ days: 7, page: 2, pageSize: 50, signal }, requester);

    expect(requester).toHaveBeenCalledWith("/api/admin/analytics/overview?days=7&page=2&pageSize=50", expect.objectContaining({ signal }));
    expect(result.recentVisitors.pagination).toEqual({ page: 2, pageSize: 50, total: 51, totalPages: 2 });
    expect(result.recentVisitors.items).toHaveLength(1);
    expect(result.totals.uniqueVisitors).toBe(1);
    expect(result.daily.map((day) => day.uniqueVisitors)).toEqual([1, 1]);
  });

  it("rejects malformed numbered visitor metadata", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({
      range: {}, totals: {}, daily: [], breakdowns: {}, recentVisitors: { items: [], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
    }), { status: 200 }));
    await expect(loadAdminAnalytics({ days: 7, page: 1, pageSize: 20 }, requester)).rejects.toThrow("NUMBERED_PAGE_RESPONSE_INVALID");
  });

  it.each([
    ["negative total", (value: any) => { value.totals.pageViews = -1; }],
    ["missing total", (value: any) => { delete value.totals.uniqueVisitors; }],
    ["string total", (value: any) => { value.totals.loginUsers = "0"; }],
    ["fractional daily count", (value: any) => { value.daily = [{ day: "2026-08-26", pageViews: 0.5, uniqueVisitors: 0, loginUsers: 0 }]; }],
    ["invalid calendar day", (value: any) => { value.range.from = "2026-02-30"; }],
    ["wrong range span", (value: any) => { value.range.from = "2026-08-19"; }],
    ["other request days", (value: any) => { value.range = { from: "2026-08-13", to: "2026-08-26", days: 14 }; }],
    ["other request page", (value: any) => { value.recentVisitors.pagination.page = 2; }],
    ["other request page size", (value: any) => { value.recentVisitors.pagination.pageSize = 50; }],
    ["missing breakdown", (value: any) => { delete value.breakdowns.paths; }],
    ["invalid breakdown count", (value: any) => { value.breakdowns.paths = [{ key: "/", pageViews: "bad" }]; }],
    ["daily outside range", (value: any) => { value.daily = [{ day: "2026-08-19", pageViews: 0, uniqueVisitors: 0, loginUsers: 0 }]; }],
    ["PV differs from visitor total", (value: any) => { value.totals.pageViews = 1; value.daily = [{ day: "2026-08-26", pageViews: 1, uniqueVisitors: 0, loginUsers: 0 }]; }],
    ["daily PV differs from total", (value: any) => { value.daily = [{ day: "2026-08-26", pageViews: 1, uniqueVisitors: 0, loginUsers: 0 }]; }],
    ["duplicate daily dates", (value: any) => { value.daily = Array.from({ length: 2 }, () => ({ day: "2026-08-26", pageViews: 0, uniqueVisitors: 0, loginUsers: 0 })); }],
  ])("rejects %s instead of inventing empty or zero statistics", async (_label, mutate) => {
    const value = { range: { from: "2026-08-20", to: "2026-08-26", days: 7 }, totals: { pageViews: 0, uniqueVisitors: 0, loginUsers: 0 }, daily: [], breakdowns: { paths: [], regions: [], countries: [] }, recentVisitors: { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    mutate(value);
    await expect(loadAdminAnalytics({ days: 7, page: 1, pageSize: 20 }, async () => new Response(JSON.stringify(value)))).rejects.toThrow("ANALYTICS_INVALID");
  });
});
