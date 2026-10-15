// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { CalendarPage } from "../../frontend/pages/calendar-page";

describe("Calendar page", () => {
  it("renders events, controls and no undefined values", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "ready", items: [{ id: "event-1", updatedAt: "2026-09-28T00:00:00.000Z", clientKey: "event-1", kind: "focus", title: "深度工作", description: "完成 C3", startsAt: "2026-09-09T09:00:00.000Z", endsAt: "2026-09-09T10:00:00.000Z", timezone: "UTC", allDay: false, status: "scheduled", taskId: null, projectId: null }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }} onCreate={vi.fn()} onCancel={vi.fn()} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "CALENDAR_TITLE"));
    expect(html).toContain(frontendText(locale, "CALENDAR_CREATE"));
    expect(html).toContain(frontendText(locale, "CALENDAR_FOCUS"));
    expect(html).toContain(frontendText(locale, "CALENDAR_COLUMN_TITLE"));
    expect(html).toContain("深度工作");
    expect(html).toContain(`aria-label="${frontendText(locale, "CALENDAR_CANCEL")}"`);
    expect(html).not.toContain("undefined");
  });

  it("renders the desktop pager with the server totals and retires the scroll label", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "ready", items: [], pagination: { page: 2, pageSize: 20, total: 43, totalPages: 3 } }} onCreate={vi.fn()} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(html).toContain("data-pagination-desktop");
    expect(html).toContain("data-pagination-mobile");
    expect(html).toContain(frontendText(locale, "PAGINATION_TOTAL"));
    expect(html).toContain(frontendText(locale, "PAGINATION_ROWS_PER_PAGE"));
    expect(html).toContain("21–40");
    expect(html).not.toContain(frontendText(locale, "CALENDAR_LOAD_MORE"));
  });

  it("leaves the pager out when the route supplies no page controls", () => {
    const locale = createLocaleRuntime();
    const html = renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 43, totalPages: 3 } }} />);
    expect(html).not.toContain("data-pagination-desktop");
    expect(html).toContain(frontendText(locale, "CALENDAR_EMPTY"));
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain(frontendText(locale, "CALENDAR_RETRY"));
    expect(renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "ready", items: [] }} />)).toContain(frontendText(locale, "CALENDAR_EMPTY"));
  });
});
