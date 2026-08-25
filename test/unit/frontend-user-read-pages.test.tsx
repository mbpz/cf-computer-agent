// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HomePage } from "../../frontend/pages/home-page";
import { KnowledgePage } from "../../frontend/pages/knowledge-page";
import { KnowledgeReaderPage } from "../../frontend/pages/knowledge-reader-page";
import { SearchPage } from "../../frontend/pages/search-page";
import { AgentPage } from "../../frontend/pages/agent-page";

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
    const html = renderToStaticMarkup(<SearchPage state={{ kind: "ready", degraded: true, results: [{ id: "r1", title: "Guide", snippet: "A match", href: "/knowledge/r1", matchedFields: ["body"] }] }} />);
    expect(html).toContain("Search degraded");
    expect(html).toContain('href="/knowledge/r1"');
    expect(html).toContain("body");
  });

  it("renders Agent scope, confidence, citations, and safe error fallback", () => {
    const html = renderToStaticMarkup(<AgentPage scope="space:personal" state={{ kind: "ready", answer: "Use the guide.", confidence: "high", citations: [{ id: "r1", title: "Guide", href: "/knowledge/r1" }] }} />);
    expect(html).toContain("space:personal");
    expect(html).toContain("High confidence");
    expect(html).toContain("Guide");
    expect(renderToStaticMarkup(<AgentPage scope="all" state={{ kind: "error", message: "Retry later" }} />)).toContain("Retry later");
  });
});
