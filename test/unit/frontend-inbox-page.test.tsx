// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { InboxPage } from "../../frontend/pages/inbox-page";

describe("Inbox page", () => {
  it("renders bilingual capture, archive and promotion affordances without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<InboxPage locale={locale} state={{ kind: "ready", items: [{
      id: "inbox-1", clientKey: "capture-1", kind: "text", content: "整理首页信息架构", sourceUrl: null,
      status: "inbox", promotedTaskId: null, promotedSubmissionId: null,
      createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z",
    }], nextCursor: "cursor-2" }} onCreate={vi.fn()} onStatusChange={vi.fn()} onPromoteTask={vi.fn()} onLoadMore={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "INBOX_TITLE"));
    expect(html).toContain(frontendText(locale, "INBOX_CAPTURE"));
    expect(html).toContain(frontendText(locale, "INBOX_PROMOTE_TASK"));
    expect(html).toContain(frontendText(locale, "INBOX_LOAD_MORE"));
    expect(html).not.toContain("undefined");
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<InboxPage locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<InboxPage locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain("Try search again");
    expect(renderToStaticMarkup(<InboxPage locale={locale} state={{ kind: "ready", items: [] }} />)).toContain(frontendText(locale, "INBOX_EMPTY"));
  });
});
