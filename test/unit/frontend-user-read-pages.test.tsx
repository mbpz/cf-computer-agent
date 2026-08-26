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
import { createLocaleRuntime } from "../../frontend/lib/i18n";

describe("React read-only user pages", () => {
  it("renders loading and empty knowledge states without undefined values", () => {
    expect(renderToStaticMarkup(<HomePage state={{ kind: "loading" }} />)).toContain("aria-busy");
    const empty = renderToStaticMarkup(<KnowledgePage state={{ kind: "ready", items: [], nextCursor: null }} />);
    expect(empty).toContain("No published knowledge");
    expect(empty).not.toContain("undefined");
  });

  it("renders bounded knowledge pages and a load-more affordance", () => {
    const html = renderToStaticMarkup(<KnowledgePage state={{ kind: "ready", items: [{ id: "k1", title: "Guide", summary: "Short", publishedAt: "2026-08-25", tags: ["cf"] }], nextCursor: "cursor-2" }} onLoadMore={vi.fn()} />);
    expect(html).toContain("Guide");
    expect(html).toContain("Load more");
    expect(html).toContain("cf");
  });

  it("renders daily/weekly review items without undefined values", () => {
    const html = renderToStaticMarkup(<KnowledgePage
      locale={createLocaleRuntime({ navigatorLanguage: "en" })}
      state={{ kind: "ready", items: [], nextCursor: null }}
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
      state={{ kind: "ready", items: [], nextCursor: null }}
      favorites={[{ id: "k1", title: "Guide", createdAt: "2026-08-25T00:00:00.000Z", completed: false, visibility: "shared" }]}
    />);
    expect(html).toContain("Saved to read");
    expect(html).toContain("Open the item to mark it as read.");
    expect(html).not.toContain("undefined");
  });

  it("passes reader Markdown through the supplied safe renderer as content", () => {
    const renderer = vi.fn(() => "<p>safe</p>");
    const html = renderToStaticMarkup(<KnowledgeReaderPage revision={{ id: "r1", title: "Guide", markdown: "# Safe" }} renderMarkdown={renderer} />);
    expect(renderer).toHaveBeenCalledWith("# Safe");
    expect(html).toContain("&lt;p&gt;safe&lt;/p&gt;");
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it("shows degraded search and citation links", () => {
    const html = renderToStaticMarkup(<SearchPage state={{ kind: "ready", degraded: true, results: [{ id: "r1", knowledgeItemId: "knowledge-1", title: "Guide", snippet: "A match", href: "/knowledge/r1", matchedFields: ["body"] }] }} />);
    expect(html).toContain("Search degraded");
    expect(html).toContain('id="knowledge-search"');
    expect(html).toContain("Search query");
    expect(html).toContain('href="/knowledge/r1"');
    expect(html).toContain("body");
    expect(html).toContain("Ask about this result");
    expect(html).not.toContain("undefined");
  });

  it("renders owner saved-view controls without exposing undefined values", () => {
    const html = renderToStaticMarkup(<SearchPage
      locale={createLocaleRuntime()}
      state={{ kind: "ready", query: "docs", degraded: false, results: [], nextCursor: null }}
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

  it("renders scoped submission status and cursor affordance", () => {
    const html = renderToStaticMarkup(<MySubmissionsPage state={{ kind: "ready", items: [{ id: "s1", title: "Guide", status: "review_pending" }], nextCursor: "v1.next" }} />);
    expect(html).toContain("Guide");
    expect(html).toContain("Load more submissions");
    expect(html).not.toContain("undefined");
  });
});
