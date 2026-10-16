// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderSafeMarkdown } from "../../frontend/lib/markdown-renderer";

/** The level and text of every heading the renderer actually emits. */
const headings = (html: string) => [...html.matchAll(/<h([1-6])>([^<]*)<\/h\1>/gu)].map((match) => `h${match[1]}:${match[2]}`);

describe("safe Markdown renderer", () => {
  it("renders Markdown while removing raw HTML and unsafe links", () => {
    const html = renderToStaticMarkup(renderSafeMarkdown("# Guide\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))"));
    expect(html).toContain("Guide");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("href=\"javascript:");
    expect(html).toContain("bad");
  });

  it("moves a level-1 content heading down one level, keeping relative depth", () => {
    const html = renderToStaticMarkup(renderSafeMarkdown("# Field guide\n\nIntro\n\n## Deployment\n\n### Rollback\n\n#### Deepest"));
    expect(headings(html)).toEqual(["h2:Field guide", "h3:Deployment", "h4:Rollback", "h5:Deepest"]);
    expect(html).not.toContain("<h1");
  });

  it("moves a setext level-1 heading too, because the rule reads tokens, not '#'", () => {
    const html = renderToStaticMarkup(renderSafeMarkdown("Field guide\n==========\n\nSection\n-------"));
    expect(headings(html)).toEqual(["h2:Field guide", "h3:Section"]);
  });

  it("keeps the authored levels of a source that already starts below the title", () => {
    const html = renderToStaticMarkup(renderSafeMarkdown("## Section\n\n### Detail\n\n#### Deepest"));
    expect(headings(html)).toEqual(["h2:Section", "h3:Detail", "h4:Deepest"]);
    expect(html).not.toContain("<h1");
  });

  it("clamps a demoted heading at h6 and leaves fenced code and inline text alone", () => {
    const html = renderToStaticMarkup(renderSafeMarkdown("# Top\n\n##### Deep\n\n###### Deepest\n\n```\n# not a heading\n```\n\nA paragraph with a # inside."));
    expect(headings(html)).toEqual(["h2:Top", "h6:Deep", "h6:Deepest"]);
    expect(html).not.toContain("<h7");
    expect(html).toContain("# not a heading");
    expect(html).toContain("A paragraph with a # inside.");
  });
});
