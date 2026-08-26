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
