// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { CalendarPage } from "../../frontend/pages/calendar-page";

describe("Calendar page", () => {
  it("renders events, controls and no undefined values", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "ready", items: [{ id: "event-1", clientKey: "event-1", kind: "focus", title: "深度工作", description: "完成 C3", startsAt: "2026-09-09T09:00:00.000Z", endsAt: "2026-09-09T10:00:00.000Z", timezone: "UTC", allDay: false, status: "scheduled", taskId: null, projectId: null }], nextCursor: "cursor-2" }} onCreate={vi.fn()} onCancel={vi.fn()} onLoadMore={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "CALENDAR_TITLE"));
    expect(html).toContain(frontendText(locale, "CALENDAR_CREATE"));
    expect(html).toContain(frontendText(locale, "CALENDAR_FOCUS"));
    expect(html).toContain(frontendText(locale, "CALENDAR_LOAD_MORE"));
    expect(html).not.toContain("undefined");
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain(frontendText(locale, "CALENDAR_RETRY"));
    expect(renderToStaticMarkup(<CalendarPage locale={locale} state={{ kind: "ready", items: [] }} />)).toContain(frontendText(locale, "CALENDAR_EMPTY"));
  });
});
