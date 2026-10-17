// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePage } from "../../frontend/pages/home-page";
import { KnowledgePage } from "../../frontend/pages/knowledge-page";
import { KnowledgeReaderPage } from "../../frontend/pages/knowledge-reader-page";
import { SearchPage } from "../../frontend/pages/search-page";
import { AgentPage } from "../../frontend/pages/agent-page";
import { SubmitPage } from "../../frontend/pages/submit-page";
import { MySubmissionsPage } from "../../frontend/pages/my-submissions-page";
import { createLocaleRuntime, frontendText } from "../../frontend/lib/i18n";

describe("React read-only user pages", () => {
  it("renders loading and empty knowledge states without undefined values", () => {
    expect(renderToStaticMarkup(<HomePage state={{ kind: "loading" }} />)).toContain("aria-busy");
    const empty = renderToStaticMarkup(<KnowledgePage state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }} />);
    expect(empty).toContain("No published knowledge");
    expect(empty).not.toContain("undefined");
  });

  it("keeps the desktop pager and the mobile feed on the knowledge list", () => {
    const locale = createLocaleRuntime();
    const state = { kind: "ready" as const, items: [{ id: "k1", title: "Guide", summary: "Short", publishedAt: "2026-08-25", tags: ["cf"] }], pagination: { page: 1 as const, pageSize: 20 as const, total: 21, totalPages: 2 } };
    const feed = renderToStaticMarkup(<KnowledgePage locale={locale} state={state} onLoadMore={vi.fn()} />);
    expect(feed).toContain("Guide");
    expect(feed).toContain('href="/knowledge/k1"');
    expect(feed).toContain("Short");
    expect(feed).toContain("2026-08-25");
    expect(feed).toContain("cf");
    expect(feed).toContain('aria-label="Published knowledge"');
    expect(feed).toContain("flex flex-col gap-6 lg:h-full lg:min-h-0");
    // An unwired route keeps the footer hidden instead of rendering a dead pager.
    expect(feed).not.toContain("data-pagination-desktop");
    expect(feed).not.toContain('aria-label="Page 2"');
    expect(feed).not.toContain("undefined");

    const paged = renderToStaticMarkup(<KnowledgePage locale={locale} state={state} onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(paged).toContain("data-pagination-desktop");
    expect(paged).toContain(frontendText(locale, "PAGINATION_TOTAL"));
    expect(paged).toContain("1–20");
    expect(paged).toContain('aria-label="Page 2"');
    expect(paged).toContain("lg:min-h-0 lg:flex-1");
    expect(paged).not.toContain("undefined");
  });

  it("offers retry actions for local reader pagination failures", () => {
    const page = { page: 1 as const, pageSize: 20 as const, total: 1, totalPages: 1 };
    const retry = vi.fn();
    const knowledge = renderToStaticMarkup(<KnowledgePage state={{ kind: "ready", items: [], pagination: page }} localError="Unable" onRetry={retry} />);
    const search = renderToStaticMarkup(<SearchPage state={{ kind: "ready", degraded: false, results: [], pagination: page }} localError="Unable" onRetry={retry} />);
    const submissions = renderToStaticMarkup(<MySubmissionsPage state={{ kind: "ready", items: [], pagination: page }} localError="Unable" onRetry={retry} />);
    expect(knowledge).toContain("<button");
    expect(search).toContain("<button");
    expect(submissions).toContain("<button");
  });

  it("offers accessible retry actions for initial reader failures", () => {
    const retry = vi.fn();
    const knowledge = renderToStaticMarkup(<KnowledgePage state={{ kind: "error", message: "Unable" }} onRetry={retry} />);
    const submissions = renderToStaticMarkup(<MySubmissionsPage state={{ kind: "error", message: "Unable" }} onRetry={retry} />);
    for (const html of [knowledge, submissions]) {
      expect(html).toContain('role="alert"');
      expect(html).toContain("<button");
      expect(html).toContain("Try search again");
    }
  });

  it("renders daily/weekly review items without undefined values", () => {
    const html = renderToStaticMarkup(<KnowledgePage
      locale={createLocaleRuntime({ navigatorLanguage: "en" })}
      state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }}
      review={{ kind: "ready", data: { items: [{ knowledgeItemId: "k1", revisionId: "r1", title: "Guide", publishedAt: "2026-08-25", lastVisitedAt: null, reason: "to_read", favorite: true }] } }}
      reviewPeriod="weekly"
    />);
    expect(html).toContain("Review queue");
    expect(html).toContain("This week");
    expect(html).toContain("To read");
    expect(html).toContain("Guide");
    expect(html).not.toContain("undefined");
  });

  it("renders a private to-read list with completion state", () => {
    const html = renderToStaticMarkup(<KnowledgePage
      locale={createLocaleRuntime({ navigatorLanguage: "en" })}
      state={{ kind: "ready", items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }}
      favorites={[{ id: "k1", title: "Guide", createdAt: "2026-08-25T00:00:00.000Z", completed: false, visibility: "shared" }]}
    />);
    expect(html).toContain("Saved to read");
    expect(html).toContain("Open the item to mark it as read.");
    expect(html).not.toContain("undefined");
  });

  it("passes reader Markdown through the supplied safe renderer as content", () => {
    const renderer = vi.fn(() => "<p>safe</p>");
    const html = renderToStaticMarkup(<KnowledgeReaderPage revision={{ id: "r1", knowledgeItemId: "knowledge-1", title: "Guide", markdown: "# Safe" }} renderMarkdown={renderer} />);
    expect(renderer).toHaveBeenCalledWith("# Safe");
    expect(html).toContain("&lt;p&gt;safe&lt;/p&gt;");
    expect(html).not.toContain("dangerouslySetInnerHTML");
    expect(html).toContain('href="/messages?contextKind=knowledge&amp;contextId=knowledge-1"');
  });

  it("shows degraded search and citation links", () => {
    const html = renderToStaticMarkup(<SearchPage state={{ kind: "ready", degraded: true, results: [{ id: "r1", knowledgeItemId: "knowledge-1", title: "Guide", snippet: "A match", href: "/knowledge/r1", matchedFields: ["body"] }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }} />);
    expect(html).toContain("Search degraded");
    expect(html).toContain('id="knowledge-search"');
    expect(html).toContain("Search query");
    expect(html).toContain('href="/knowledge/r1"');
    expect(html).toContain("body");
    expect(html).toContain("Ask about this result");
    expect(html).not.toContain("undefined");
  });

  it("keeps the query input and the saved views on one row with the desktop pager", () => {
    const locale = createLocaleRuntime();
    const state = { kind: "ready" as const, query: "docs", degraded: false, results: [{ id: "r1", knowledgeItemId: "knowledge-1", title: "Guide", snippet: "A match", href: "/knowledge/r1", matchedFields: ["body"] }], pagination: { page: 1 as const, pageSize: 20 as const, total: 21, totalPages: 2 } };
    const feed = renderToStaticMarkup(<SearchPage locale={locale} state={state} query="docs" savedViews={[]} onSaveView={vi.fn()} onLoadMore={vi.fn()} />);
    expect(feed).toContain('id="knowledge-search"');
    expect(feed).toContain("data-search-controls-row");
    expect(feed).toContain("flex flex-col gap-5 lg:h-full lg:min-h-0");
    expect(feed).not.toContain("data-pagination-desktop");
    expect(feed).not.toContain('aria-label="Page 2"');
    expect(feed).not.toContain("undefined");

    const paged = renderToStaticMarkup(<SearchPage locale={locale} state={state} query="docs" onLoadMore={vi.fn()} onPageChange={vi.fn()} onPageSizeChange={vi.fn()} />);
    expect(paged).toContain("data-pagination-desktop");
    expect(paged).toContain(frontendText(locale, "PAGINATION_TOTAL"));
    expect(paged).toContain("1–20");
    expect(paged).toContain('aria-label="Page 2"');
    expect(paged).toContain("lg:min-h-0 lg:flex-1");
    expect(paged).not.toContain("undefined");
  });

  it("renders owner saved-view controls without exposing undefined values", () => {
    const html = renderToStaticMarkup(<SearchPage
      locale={createLocaleRuntime()}
      state={{ kind: "ready", query: "docs", degraded: false, results: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }}
      query="docs"
      savedViews={[{ id: "view-1", name: "Platform docs", updatedAt: "", filters: { v: 1, q: "docs", spaceId: null, collectionId: null, tagIds: [], tagMode: "or" } }]}
      onSaveView={() => undefined}
      onApplyView={() => undefined}
      onDeleteView={() => undefined}
    />);
    expect(html).toContain("data-saved-view-controls");
    expect(html).toContain("Platform docs");
    expect(html).toContain("Save view");
    expect(html).not.toContain("undefined");
  });

  it("renders Agent scope, confidence, citations, and safe error fallback", () => {
    const html = renderToStaticMarkup(<AgentPage scope="space:personal" state={{ kind: "ready", answer: "Use the guide.", confidence: "high", citations: [{ id: "r1", title: "Guide", href: "/knowledge/r1", spaceId: "space-1", collectionId: "collection-1", startLine: 2, endLine: 4 }] }} />);
    expect(html).toContain("space:personal");
    expect(html).toContain("High confidence");
    expect(html).toContain('id="agent-question"');
    expect(html).toContain("Question");
    expect(html).toContain("Guide");
    expect(html).toContain("Context: space-1 · collection-1 · lines 2–4");
    expect(renderToStaticMarkup(<AgentPage scope="all" state={{ kind: "error", message: "Retry later" }} />)).toContain("Retry later");
  });

  it("renders an editable submission draft without undefined values", () => {
    const html = renderToStaticMarkup(<SubmitPage draft={{ mode: "markdown", title: "Guide", content: "# Body" }} state={{ kind: "idle" }} />);
    expect(html).toContain('id="submission-title"');
    expect(html).toContain('id="submission-mode"');
    expect(html).toContain('id="submission-content"');
    expect(html).not.toContain("undefined");
  });

  it("renders scoped submission status in a row list without a numbered pager", () => {
    const html = renderToStaticMarkup(<MySubmissionsPage state={{ kind: "ready", items: [{ id: "s1", title: "Guide", status: "review_pending" }], pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 } }} />);
    expect(html).toContain("Guide");
    expect(html).toContain("review_pending");
    expect(html).not.toContain('aria-label="Page 2"');
    expect(html).not.toContain("undefined");
  });

  it("enters the submit composer from the my-submissions header in both locales", () => {
    // `/submit` has no navigation entry (migrations/0075); the header CTA is the
    // entry point, so its href, accessible name and mobile target are pinned.
    const state = { kind: "ready" as const, items: [], pagination: { page: 1 as const, pageSize: 20 as const, total: 0, totalPages: 0 } };
    for (const navigatorLanguage of ["en", "zh-CN"] as const) {
      const locale = createLocaleRuntime({ navigatorLanguage });
      const html = renderToStaticMarkup(<MySubmissionsPage locale={locale} state={state} />);
      const cta = /<a[^>]*data-my-submissions-submit[^>]*>[\s\S]*?<\/a>/u.exec(html)?.[0] ?? "";
      expect(cta, navigatorLanguage).not.toBe("");
      expect(cta).toContain('href="/submit"');
      // The link text is the accessible name; no extra translated key is needed.
      expect(cta).toContain(frontendText(locale, "SUBMIT_TITLE"));
      expect(cta).toContain("focus-visible:ring-2");
      expect(cta).toContain("max-lg:h-11");
    }
  });
});
