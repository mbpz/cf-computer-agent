// @vitest-environment node
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";
import { InboxPage } from "../../frontend/pages/inbox-page";

const paging = { onFilterChange: vi.fn(), onPageChange: vi.fn(), onPageSizeChange: vi.fn() };
describe("Inbox page", () => {
  it("renders bilingual capture, archive and promotion affordances without undefined", () => {
    const locale = createLocaleRuntime({ navigatorLanguage: "zh-CN" });
    const html = renderToStaticMarkup(<InboxPage {...paging} locale={locale} state={{ kind: "ready", items: [{
      id: "inbox-1", clientKey: "capture-1", kind: "text", content: "整理首页信息架构", sourceUrl: null,
      status: "inbox", promotedTaskId: null, promotedSubmissionId: null,
      createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z",
    }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }} onCreate={vi.fn()} onStatusChange={vi.fn()} onPromoteTask={vi.fn()} />);
    expect(html).toContain(frontendText(locale, "INBOX_TITLE"));
    expect(html).toContain(frontendText(locale, "INBOX_CAPTURE"));
    expect(html).toContain(frontendText(locale, "INBOX_PROMOTE_TASK"));
    expect(html).toContain(frontendText(locale, "INBOX_STATUS_FILTER"));
    expect(html).not.toContain("undefined");
  });

  it("renders loading, error and empty states", () => {
    const locale = createLocaleRuntime();
    expect(renderToStaticMarkup(<InboxPage {...paging} locale={locale} state={{ kind: "loading" }} />)).toContain('aria-busy="true"');
    expect(renderToStaticMarkup(<InboxPage {...paging} locale={locale} state={{ kind: "error", message: "Unable" }} onRetry={vi.fn()} />)).toContain("Try again");
    expect(renderToStaticMarkup(<InboxPage {...paging} locale={locale} state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }} />)).toContain(frontendText(locale, "INBOX_EMPTY"));
  });
});
