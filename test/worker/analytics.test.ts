/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { applyD1Migrations, createExecutionContext, env, reset, waitOnExecutionContext } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { MembersRepository } from "../../src/members/repository";
import { SessionService } from "../../src/identity/session";
import { MIGRATIONS } from "../fixtures/d1";
import { AnalyticsRepository } from "../../src/analytics/repository";
import { writeAfterFirstRead } from "../fixtures/analytics-interleaving";

const NOW = "2026-08-26T12:00:00.000Z";
const RANGE_START_DAY = "2026-08-20";
const RANGE_END_DAY = "2026-08-27";

describe("site analytics", () => {
  let contributor = "";
  let admin = "";

  beforeEach(async () => {
    await reset();
    await applyD1Migrations(env.DB, MIGRATIONS);
    await env.DB.prepare(
      `INSERT INTO members (id, access_sub, email, role, status, created_at, updated_at) VALUES
       ('analytics-contributor', 'subject-analytics-contributor', 'analytics-contributor@example.test', 'contributor', 'active', ?, ?),
       ('analytics-admin', 'subject-analytics-admin', 'analytics-admin@example.test', 'admin', 'active', ?, ?)`,
    ).bind(NOW, NOW, NOW, NOW).run();
    const members = new MembersRepository(env.DB);
    const sessions = new SessionService(env.DB, members, { waitUntil: () => undefined });
    contributor = (await sessions.create((await members.findById("analytics-contributor"))!)).token;
    admin = (await sessions.create((await members.findById("analytics-admin"))!)).token;
  });

  it("records anonymous and signed-in visits without returning visitor identifiers", async () => {
    expect((await api("/api/telemetry/pageview", undefined, { method: "POST", body: JSON.stringify({ path: "/" }), headers: { "user-agent": "test-browser", "cf-connecting-ip": "203.0.113.10", "cf-ipcountry": "KR", "cf-region": "Seoul", "cf-ipcity": "Gangseo-gu", "cf-colo": "ICN" } })).status).toBe(202);
    expect((await api("/api/telemetry/pageview", contributor, { method: "POST", body: JSON.stringify({ path: "/knowledge" }), headers: { "user-agent": "test-browser", "cf-connecting-ip": "203.0.113.10", "cf-ipcountry": "KR", "cf-region": "Seoul", "cf-ipcity": "Gangseo-gu", "cf-colo": "ICN" } })).status).toBe(202);
    const response = await api("/api/admin/analytics/overview?days=7&page=1&pageSize=20", admin);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({ totals: { pageViews: 2, uniqueVisitors: 1, loginUsers: 1 }, breakdowns: { regions: [{ key: "Seoul", pageViews: 2 }], paths: [{ key: "/", pageViews: 1 }, { key: "/knowledge", pageViews: 1 }] } });
    expect(body).toMatchObject({ recentVisitors: {
      items: expect.arrayContaining([expect.objectContaining({ path: "/knowledge", ip: "203.0.113.0", country: "KR", region: "Seoul", city: "Gangseo-gu", colo: "ICN", member: expect.objectContaining({ id: "analytics-contributor", email: "analytics-contributor@example.test" }) })]),
      pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
    } });
    expect(JSON.stringify(body)).not.toContain("203.0.113.10");
    expect(JSON.stringify(body)).not.toContain("visitorHash");
  });

  it("keeps the overview admin-only and validates the public collector", async () => {
    const forbidden = await api("/api/admin/analytics/overview", contributor);
    expect(forbidden.status).toBe(403);
    const invalid = await api("/api/telemetry/pageview", undefined, { method: "POST", body: JSON.stringify({ path: "https://evil.example" }) });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "TELEMETRY_INVALID" } });
    const crossOrigin = await api("/api/telemetry/pageview", undefined, { method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify({ path: "/" }) });
    expect(crossOrigin.status).toBe(403);
  });

  it("strictly validates analytics filters and numbered pagination", async () => {
    for (const query of [
      "days=7&days=30",
      "days=7&unknown=1",
      "days=7&page=1&page=2",
      "days=7&pageSize=20&pageSize=50",
      "days=7&page=101&pageSize=100",
    ]) {
      expect((await api(`/api/admin/analytics/overview?${query}`, admin)).status).toBe(400);
    }
  });

  it("returns stable numbered visitor details without changing aggregates", async () => {
    const currentDay = NOW.slice(0, 10);
    const values = Array.from({ length: 21 }, (_, index) => `('analytics-event-${String(index).padStart(2, "0")}', '${currentDay}', 'bucket-${index}', '/page-${index}', 'visitor-${index}', NULL, '${currentDay}T00:${String(index).padStart(2, "0")}:00.000Z', '203.0.113.0', NULL, NULL, NULL, NULL, NULL)`).join(",");
    await env.DB.prepare(`INSERT INTO site_visit_events (id, day, visit_bucket, path, visitor_hash, member_id, created_at, ip_display, country, region, city, colo, user_agent) VALUES ${values}`).run();
    const response = await api("/api/admin/analytics/overview?days=7&page=2&pageSize=20", admin);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      totals: { pageViews: 21, uniqueVisitors: 21, loginUsers: 0 },
      recentVisitors: { items: [{ path: "/page-0" }], pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 } },
    });
  });

  it("includes the start day and excludes the end day of the UTC range", async () => {
    await env.DB.prepare(
      `INSERT INTO site_visit_events
       (id, day, visit_bucket, path, visitor_hash, member_id, created_at, ip_display, country, region, city, colo, user_agent)
       VALUES
       ('range-start', ?, 'range-start-bucket', '/range-start', 'range-start-visitor', NULL, ?, '203.0.113.0', NULL, NULL, NULL, NULL, NULL),
       ('range-end', ?, 'range-end-bucket', '/range-end', 'range-end-visitor', NULL, ?, '203.0.113.0', NULL, NULL, NULL, NULL, NULL)`,
    ).bind(RANGE_START_DAY, `${RANGE_START_DAY}T00:00:00.000Z`, RANGE_END_DAY, `${RANGE_END_DAY}T00:00:00.000Z`).run();

    const response = await api("/api/admin/analytics/overview?days=7&page=1&pageSize=20", admin);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      range: { from: RANGE_START_DAY, to: "2026-08-26", days: 7 },
      totals: { pageViews: 1 },
      recentVisitors: { items: [{ path: "/range-start" }], pagination: { total: 1 } },
    });
  });

  it("keeps 7/14/30-day totals independent of visitor pages and deduplicates UV across days", async () => {
    const visits = [
      ...Array.from({ length: 21 }, (_, index) => ({ id: `current-${index}`, day: "2026-08-26", visitor: "returning" })),
      { id: "yesterday", day: "2026-08-25", visitor: "returning" },
      { id: "fourteen-start", day: "2026-08-13", visitor: "older" },
      { id: "thirty-start", day: "2026-07-28", visitor: "oldest" },
      { id: "outside", day: "2026-07-27", visitor: "excluded" },
    ];
    await env.DB.batch(visits.map(({ id, day, visitor }) => env.DB.prepare(
      `INSERT INTO site_visit_events
       (id, day, visit_bucket, path, visitor_hash, member_id, created_at, ip_display)
       VALUES (?, ?, ?, ?, ?, NULL, ?, '203.0.113.0')`,
    ).bind(id, day, id, `/${id}`, visitor, `${day}T00:00:00.000Z`)));

    for (const [days, from, pageViews, uniqueVisitors] of [
      [7, "2026-08-20", 22, 1], [14, "2026-08-13", 23, 2], [30, "2026-07-28", 24, 3],
    ] as const) {
      const pages = [];
      for (const page of [1, 2]) {
        const response = await api(`/api/admin/analytics/overview?days=${days}&page=${page}&pageSize=20`, admin);
        expect(response.status).toBe(200);
        const body = await response.json() as {
          totals: { pageViews: number; uniqueVisitors: number; loginUsers: number };
          daily: Array<{ pageViews: number; uniqueVisitors: number }>;
          recentVisitors: { items: Array<{ path: string }> };
        };
        expect(body).toMatchObject({
          range: { from, to: "2026-08-26", days },
          totals: { pageViews, uniqueVisitors, loginUsers: 0 },
          recentVisitors: { pagination: { page, pageSize: 20, total: pageViews, totalPages: 2 } },
        });
        expect(body.daily.reduce((sum, item) => sum + item.pageViews, 0)).toBe(pageViews);
        expect(body.daily.reduce((sum, item) => sum + item.uniqueVisitors, 0)).toBe(uniqueVisitors + 1);
        expect(body.recentVisitors.items).toHaveLength(page === 1 ? 20 : pageViews - 20);
        pages.push(...body.recentVisitors.items.map((item) => item.path));
      }
      expect(new Set(pages).size).toBe(pageViews);
      expect(pages).not.toContain("/outside");
    }
  });

  it("deduplicates the same visitor, path, and five-minute bucket", async () => {
    const first = await api("/api/telemetry/pageview", undefined, { method: "POST", body: JSON.stringify({ path: "/" }), headers: { "user-agent": "dedupe-browser", "cf-connecting-ip": "203.0.113.11" } });
    const second = await api("/api/telemetry/pageview", undefined, { method: "POST", body: JSON.stringify({ path: "/" }), headers: { "user-agent": "dedupe-browser", "cf-connecting-ip": "203.0.113.11" } });
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const response = await api("/api/admin/analytics/overview?days=7", admin);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ totals: { pageViews: 1, uniqueVisitors: 1, loginUsers: 0 } });
  });

  it("does not mix pre-write trends with post-write totals or visitor pages", async () => {
    const repository = new AnalyticsRepository(env.DB, () => new Date(NOW));
    const visit = (id: string) => repository.recordPageView({
      id, path: `/${id}`, visitorHash: id, memberId: null, occurredAt: new Date(NOW),
      ip: "203.0.113.0", country: "KR", region: "Seoul", city: null, colo: null, userAgent: null,
    });
    await visit("before");
    const interleaved = new AnalyticsRepository(writeAfterFirstRead(env.DB, () => visit("after")), () => new Date(NOW));
    const snapshot = await interleaved.overview(7, { page: 1, pageSize: 20 });
    expect(snapshot).toMatchObject({
      totals: { pageViews: 1, uniqueVisitors: 1 },
      daily: [{ pageViews: 1, uniqueVisitors: 1 }],
      breakdowns: { paths: [{ key: "/before", pageViews: 1 }], regions: [{ key: "Seoul", pageViews: 1 }], countries: [{ key: "KR", pageViews: 1 }] },
      recentVisitors: { items: [{ path: "/before" }], pagination: { total: 1 } },
    });
    const fresh = await repository.overview(7, { page: 1, pageSize: 20 });
    expect(fresh.totals.pageViews).toBe(2);
    expect(fresh.daily[0].pageViews).toBe(2);
    expect(fresh.recentVisitors.pagination.total).toBe(2);
    expect(fresh.recentVisitors.items).toHaveLength(2);
  });

  it("reconciles both pages after collection and replay, then returns an empty removed last page", async () => {
    const repository = new AnalyticsRepository(env.DB, () => new Date(NOW));
    for (let index = 0; index < 21; index++) {
      await repository.recordPageView({ id: `seed-${index}`, path: `/seed-${index}`, visitorHash: "seed", memberId: null,
        occurredAt: new Date("2026-08-26T00:00:00.000Z"), ip: "unknown", country: null, region: null, city: null, colo: null, userAgent: null });
    }
    const beforeResponse = await api("/api/admin/analytics/overview?days=7&page=2&pageSize=20", admin);
    expect(beforeResponse.status).toBe(200);
    const before = await beforeResponse.json() as Awaited<ReturnType<AnalyticsRepository["overview"]>>;
    expect(before.recentVisitors.items).toHaveLength(1);
    expect(before.recentVisitors.pagination.total).toBe(21);

    for (let replay = 0; replay < 2; replay++) {
      expect((await api("/api/telemetry/pageview", contributor, { method: "POST", body: JSON.stringify({ path: "/new-write" }),
        headers: { "user-agent": "write-reconcile", "cf-connecting-ip": "203.0.113.15" } })).status).toBe(202);
    }
    const paths: string[] = [];
    for (const page of [1, 2]) {
      const response = await api(`/api/admin/analytics/overview?days=7&page=${page}&pageSize=20`, admin);
      expect(response.status).toBe(200);
      const fresh = await response.json() as Awaited<ReturnType<AnalyticsRepository["overview"]>>;
      expect(fresh.totals).toEqual({ pageViews: 22, uniqueVisitors: 2, loginUsers: 1 });
      expect(fresh.daily).toEqual([{ day: "2026-08-26", pageViews: 22, uniqueVisitors: 2, loginUsers: 1 }]);
      expect(fresh.recentVisitors.pagination).toEqual({ page, pageSize: 20, total: 22, totalPages: 2 });
      expect(fresh.recentVisitors.items).toHaveLength(page === 1 ? 20 : 2);
      paths.push(...fresh.recentVisitors.items.map((item) => item.path));
    }
    expect(new Set(paths).size).toBe(22);
    expect(paths[0]).toBe("/new-write");

    // Simulate retention via test SQL only; no public deletion endpoint is added.
    await env.DB.prepare("DELETE FROM site_visit_events WHERE id IN ('seed-0', 'seed-1')").run();
    const removed = await api("/api/admin/analytics/overview?days=7&page=2&pageSize=20", admin);
    expect(removed.status).toBe(200);
    await expect(removed.json()).resolves.toMatchObject({ totals: { pageViews: 20 },
      recentVisitors: { items: [], pagination: { page: 2, pageSize: 20, total: 20, totalPages: 1 } } });
  });

  it.each(["rejected", "failed", "missing", "bad-count", "extra-total", "bad-rows", "short-page", "bad-daily", "bad-breakdown"])("fails closed for a %s batch instead of inventing zero statistics", async (failure) => {
    const wrapped = new Proxy(env.DB, {
      get(target, key) {
        if (key === "batch") return async (statements: D1PreparedStatement[]) => {
          if (failure === "rejected") throw new Error("D1 unavailable");
          const results = await target.batch<Record<string, unknown>>(statements);
          if (failure === "failed") (results[0] as { success: boolean }).success = false;
          if (failure === "missing") results.pop();
          if (failure === "bad-count") results[1].results[0].page_views = "0";
          if (failure === "extra-total") results[1].results.push({ page_views: 0 });
          if (failure === "bad-rows") results[5].results = [null as unknown as Record<string, unknown>];
          if (failure === "short-page") results[1].results[0].page_views = 1;
          if (failure === "bad-daily") results[0].results = [{ day: NOW.slice(0, 10), page_views: -1, unique_visitors: 0, login_users: 0 }];
          if (failure === "bad-breakdown") results[2].results = [{ key: "/", page_views: 0.5 }];
          return results;
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const request = new AnalyticsRepository(wrapped, () => new Date(NOW)).overview(7, { page: 1, pageSize: 20 });
    if (failure === "rejected") await expect(request).rejects.toThrow("D1 unavailable");
    else await expect(request).rejects.toMatchObject({ code: "ANALYTICS_RESULT_INVALID", status: 500 });
  });
});

async function api(path: string, token: string | undefined, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (token) headers.set("cookie", `__Host-memory-session=${token}`);
  if (!headers.has("origin")) headers.set("origin", "https://memory.crgmhrc.asia");
  const request = new Request(`https://memory.crgmhrc.asia${path}`, { ...init, headers });
  const context = createExecutionContext();
  const response = await createApp({ analyticsNow: () => new Date(NOW) }).fetch!(request as Request<unknown, IncomingRequestCfProperties<unknown>>, env, context);
  await waitOnExecutionContext(context);
  return response;
}
