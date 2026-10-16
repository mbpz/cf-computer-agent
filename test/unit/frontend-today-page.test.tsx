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

  it("keeps one titled header mounted through first load and read failure", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const title = frontendText(locale, "TODAY_TITLE");
    for (const state of [{ kind: "loading" } as const, { kind: "error", message: "Unable" } as const]) {
      const html = renderToStaticMarkup(<TodayPage locale={locale} state={state} onRetry={vi.fn()} />);
      expect((html.match(/<h1/g) ?? []).length, JSON.stringify(state)).toBe(1);
      expect(html).toContain(`>${title}</h1>`);
      expect(html).toContain(frontendText(locale, "TODAY_DESCRIPTION"));
      expect(html).not.toContain("<select");
    }
  });
});
