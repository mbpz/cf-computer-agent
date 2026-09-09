// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { FocusPage } from "../../frontend/pages/focus-page";

describe("Focus page", () => {
  it("renders the resumable session without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<FocusPage locale={locale} state={{ kind: "ready", session: { id: "focus-1", taskId: "task-1", calendarEventId: "event-1", clientKey: "focus-1", status: "paused", startedAt: "2026-09-09T10:00:00.000Z", pausedAt: "2026-09-09T10:25:00.000Z", endedAt: null, elapsedMs: 1_500_000 } }} onTransition={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "FOCUS_TITLE"));
    expect(html).toContain(frontendText(locale, "FOCUS_STATUS_PAUSED"));
    expect(html).not.toContain("undefined");
  });
});
