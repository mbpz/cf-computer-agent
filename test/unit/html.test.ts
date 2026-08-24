// @vitest-environment node
import { describe, expect, it } from "vitest";
import { recoverHtmlMarkdown } from "../../src/assets/html";

describe("HTML recovery", () => {
  it("converts safe structure while removing scripts, styles, event handlers and unsafe URLs", () => {
    const result = recoverHtmlMarkdown(new TextEncoder().encode(`
      <h1>Guide</h1><p>Hello <strong>world</strong>.</p>
      <a href="javascript:alert(1)" onclick="steal()">bad</a>
      <a href="https://example.com/docs">safe</a>
      <script>alert('secret')</script><style>body{display:none}</style>
      <ul><li>One</li><li>Two</li></ul>
      <table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>1</td></tr></table>
    `).buffer);
    expect(result.warnings).toEqual([]);
    expect(result.markdown).toContain("# Guide");
    expect(result.markdown).toContain("Hello **world**.");
    expect(result.markdown).toContain("[safe](https://example.com/docs)");
    expect(result.markdown).toContain("- One");
    expect(result.markdown).toContain("| Name | Value |");
    expect(result.markdown).not.toMatch(/script|style|onclick|javascript:|steal|display:none/iu);
  });

  it("preserves code and decodes entities without emitting raw HTML", () => {
    const result = recoverHtmlMarkdown(new TextEncoder().encode(`<pre><code>const x = 1 &lt; 2;</code></pre><p>&amp; safe</p>`).buffer);
    expect(result.markdown).toContain("const x = 1 < 2;");
    expect(result.markdown).toContain("& safe");
    expect(result.markdown).not.toMatch(/<[^>]+>/u);
  });

  it("rejects invalid UTF-8, empty input and oversized HTML", () => {
    expect(() => recoverHtmlMarkdown(new ArrayBuffer(0))).toThrowError(expect.objectContaining({ code: "ASSET_HTML_EMPTY", status: 422 }));
    expect(() => recoverHtmlMarkdown(Uint8Array.from([0xff]).buffer)).toThrowError(expect.objectContaining({ code: "ASSET_CONTENT_INVALID", status: 422 }));
  });
});
