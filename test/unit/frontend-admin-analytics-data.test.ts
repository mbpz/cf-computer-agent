import { describe, expect, it, vi } from "vitest";
import { loadAdminAnalytics } from "../../frontend/lib/admin-analytics-data";

describe("admin analytics data", () => {
  it("requests and normalizes numbered visitor details", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({
      range: { from: "2026-08-20", to: "2026-08-26", days: 7 },
      totals: { pageViews: 1, uniqueVisitors: 1, loginUsers: 0 },
      daily: [],
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
  });

  it("rejects the legacy visitor array", async () => {
    const requester = vi.fn(async () => new Response(JSON.stringify({
      range: {}, totals: {}, daily: [], breakdowns: {}, recentVisitors: [],
    }), { status: 200 }));
    await expect(loadAdminAnalytics({ days: 7, page: 1, pageSize: 20 }, requester)).rejects.toThrow("NUMBERED_PAGE_RESPONSE_INVALID");
  });
});
