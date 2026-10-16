// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePage } from "../../frontend/pages/home-page";
import { AdminDashboardPage } from "../../frontend/pages/admin/admin-dashboard-page";
import { createLocaleRuntime } from "../../frontend/lib/i18n";

describe("workspace dashboard", () => {
  it("renders quick actions and explicit empty states without undefined values", () => {
    const html = renderToStaticMarkup(<HomePage locale={createLocaleRuntime({ navigatorLanguage: "en" })} state={{ kind: "ready", total: 4, pending: 1, published: 3, recent: [] }} />);
    expect(html).toContain("Submit knowledge");
    expect(html).toContain("No recent knowledge yet.");
    expect(html).toContain("Open AI knowledge base");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  it("renders the legacy published count from its own field, never the recent list length", () => {
    const html = renderToStaticMarkup(<HomePage locale={createLocaleRuntime({ navigatorLanguage: "en" })} state={{ kind: "ready", total: 4, pending: 1, published: 7, recent: [] }} />);
    expect(html).toContain("Published knowledge");
    expect(html).toContain(">7<");
  });

  it("offers a recent continuation control only while the server cursor continues", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    const summary = {
      taskCount: 1,
      overdueTaskCount: 0,
      recentKnowledge: [{ id: "k1", title: "Work guide", summary: "2026-10-01T00:00:00.000Z" }],
      recentActivity: [],
      quickActions: [],
    };
    const continuing = renderToStaticMarkup(<HomePage locale={locale} state={{ kind: "ready", summary, recentCursor: "cursor-2" }} onLoadMoreRecent={() => {}} />);
    expect(continuing).toContain('data-home-more="knowledge"');
    expect(continuing).toContain("Load more");
    const ended = renderToStaticMarkup(<HomePage locale={locale} state={{ kind: "ready", summary, recentCursor: null }} onLoadMoreRecent={() => {}} />);
    expect(ended).not.toContain('data-home-more="knowledge"');
  });

  it("keeps loaded recent rows and shows a retry when a later page fails", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "en" });
    const summary = {
      taskCount: 1,
      overdueTaskCount: 0,
      recentKnowledge: [{ id: "k1", title: "Work guide", summary: "2026-10-01T00:00:00.000Z" }],
      recentActivity: [],
      quickActions: [],
    };
    const html = renderToStaticMarkup(<HomePage locale={locale} state={{ kind: "ready", summary, recentCursor: "cursor-2", recentMoreError: true }} onLoadMoreRecent={() => {}} />);
    expect(html).toContain('data-home-more-error="knowledge"');
    expect(html).toContain("Work guide");
    expect(html).not.toContain('data-home-more="knowledge"');
  });

  it("exposes admin shortcuts for site analytics and governance", () => {
    const html = renderToStaticMarkup(<AdminDashboardPage locale={createLocaleRuntime({ navigatorLanguage: "en" })}
      metrics={{ pending: { kind: "ready", total: 1 }, assets: { kind: "ready", total: 0 }, members: { kind: "ready", total: 5 } }}
      links={[{ href: "/admin/analytics", labelKey: "NAV_SITE_ANALYTICS" }, { href: "/admin/roles", labelKey: "NAV_ROLES" }, { href: "/admin/menus", labelKey: "NAV_MENUS" }]}
      onRetry={() => {}} onRetryTrend={() => {}} onRetryActivity={() => {}} onRefresh={() => {}} trend={{ kind: "ready", items: [] }} activity={{ kind: "ready", items: [] }} />);
    expect(html).toContain("Site analytics");
    expect(html).toContain("Roles &amp; permissions");
    expect(html).toContain("Menu tree");
    expect(html).not.toMatch(/<button\b[^>]*>\s*<a\b/u);
  });

  it("localizes dashboard states and does not render denied shortcuts", () => {
    const html = renderToStaticMarkup(<AdminDashboardPage locale={createLocaleRuntime({ navigatorLanguage: "zh-CN" })}
      metrics={{ pending: { kind: "loading" }, assets: { kind: "error" }, members: { kind: "forbidden" } }}
      links={[]} onRetry={() => {}} onRetryTrend={() => {}} onRetryActivity={() => {}} onRefresh={() => {}} trend={{ kind: "ready", items: [] }} activity={{ kind: "ready", items: [] }} />);
    for (const text of ["刷新计数", "正在加载计数", "此项计数暂不可用", "当前会话无权读取此项计数", "全部成员，包含已停用账号"]) expect(html).toContain(text);
    expect(html).not.toContain('href="/admin/members"');
    expect(html).not.toContain("data-metric-value");
    expect(html).not.toContain("ADMIN_METRIC_");
  });
});
