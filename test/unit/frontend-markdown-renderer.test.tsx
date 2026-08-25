// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderSafeMarkdown } from "../../frontend/lib/markdown-renderer";

describe("safe Markdown renderer", () => {
  it("renders Markdown while removing raw HTML and unsafe links", () => {
    const html = renderToStaticMarkup(renderSafeMarkdown("# Guide\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))"));
    expect(html).toContain("Guide");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("href=\"javascript:");
    expect(html).toContain("bad");
  });
});
