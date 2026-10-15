// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { GoalsPage } from "../../frontend/pages/goals-page";

describe("Goals page", () => {
  it("renders goal controls without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "ready", items: [{
      id: "goal-1", clientKey: "goal-1", title: "发布 2.0", description: "完成目标切片", status: "active", progress: 40,
      targetAt: null, createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z",
    }], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } }} onCreate={vi.fn()} onManageTasks={vi.fn()} onStatusChange={vi.fn()} onProgressChange={vi.fn()} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "GOALS_TITLE"));
    expect(html).toContain(frontendText(locale, "GOALS_CREATE"));
    expect(html).toContain(frontendText(locale, "GOALS_PROGRESS"));
    expect(html).toContain('id="manage-goal-tasks-goal-1"');
    expect(html).not.toContain("undefined");
  });

  it("renders the desktop pager over the loaded window and retires the scroll label", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } }} onCreate={vi.fn()} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(html).toContain("data-pagination-desktop");
    expect(html).toContain("data-pagination-mobile");
    expect(html).toContain(frontendText(locale, "PAGINATION_TOTAL"));
    expect(html).toContain(frontendText(locale, "PAGINATION_VISIBLE"));
    expect(html).toContain(frontendText(locale, "PAGINATION_ROWS_PER_PAGE"));
    expect(html).not.toContain(frontendText(locale, "GOALS_LOAD_MORE"));
  });

  it("leaves the pager out when the route supplies no page controls", () => {
    const locale = createLocaleRuntime();
    const html = renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } }} />);
    expect(html).not.toContain("data-pagination-desktop");
    expect(html).not.toContain("data-pagination-mobile");
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain(frontendText(locale, "GOALS_RETRY"));
    expect(renderToStaticMarkup(<GoalsPage locale={locale} state={{ kind: "ready", items: [] }} />)).toContain(frontendText(locale, "GOALS_EMPTY"));
  });
});
