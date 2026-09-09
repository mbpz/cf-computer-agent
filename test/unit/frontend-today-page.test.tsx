// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { TodayPage } from "../../frontend/pages/today-page";

describe("Today page", () => {
  it("renders bounded metrics without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<TodayPage locale={locale} state={{ kind: "ready", snapshot: { date: "2026-09-09", tasks: { items: [{ id: "task-1", title: "完成验收" }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } as never, taskSummary: { todo: 1, doing: 0, blocked: 0, done: 0, canceled: 0, dueToday: 1, overdue: 0 }, inbox: [], projects: [], calendar: [] } }} onRetry={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "TODAY_TITLE"));
    expect(html).toContain(frontendText(locale, "TODAY_TASKS"));
    expect(html).not.toContain("undefined");
  });
});
