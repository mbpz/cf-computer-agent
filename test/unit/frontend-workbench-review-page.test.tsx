// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { WorkbenchReviewPage } from "../../frontend/pages/workbench-review-page";

describe("Workbench review page", () => {
  it("renders bilingual review metrics without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<WorkbenchReviewPage locale={locale} period="daily" state={{ kind: "ready", snapshot: { id: "review-1", period: "daily", periodKey: "2026-09-09", from: "2026-09-08", to: "2026-09-10", taskSummary: { todo: 0, doing: 0, blocked: 0, done: 1, canceled: 0, dueToday: 0, overdue: 0 }, completed: [{ id: "task-1", title: "完成复盘" } as never], overdue: [], blocked: [], inbox: [], projects: [], focusElapsedMs: 1_200_000 } }} />);
    expect(html).toContain(frontendText(locale, "REVIEW_TITLE"));
    expect(html).not.toContain("undefined");
  });

  it("keeps one titled header and its period controls mounted through first load and read failure", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const title = frontendText(locale, "REVIEW_TITLE");
    for (const state of [{ kind: "loading" } as const, { kind: "error", message: "Unable" } as const]) {
      const html = renderToStaticMarkup(<WorkbenchReviewPage locale={locale} period="daily" state={state} onRetry={() => {}} />);
      expect((html.match(/<h1/g) ?? []).length, JSON.stringify(state)).toBe(1);
      expect(html).toContain(`>${title}</h1>`);
      expect(html).toContain(frontendText(locale, "REVIEW_DAILY"));
      // The period is one named choice: the selected radio, not a pressed toggle.
      expect(html).toContain('role="radiogroup"');
      expect(html).toMatch(/<button(?=[^>]*role="radio")(?=[^>]*aria-checked="true")/u);
      expect(html).not.toContain("<select");
    }
  });
});
