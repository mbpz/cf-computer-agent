import DOMPurify from "dompurify";
import MarkdownIt, { type StateCore, type Token } from "markdown-it";
import { createElement, type ReactNode } from "react";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

const HEADING_TAG = /^h([1-6])$/u;

/**
 * Every page has exactly one `h1`: its title, drawn by `PageHeader`. The reader's
 * article is content *below* that title, so a revision whose own Markdown opens with
 * a level-1 heading would repeat the title's level, and a screen-reader outline would
 * show two top-level entries with the same text.
 *
 * Rule: when the shallowest heading of a source is a level-1 heading, every heading of
 * that source moves down exactly one level (clamped at `h6`); otherwise the levels stay
 * as the author wrote them. Content that already starts at `h2` or deeper is already
 * strictly below the title, and shifting it too would spend a level for nothing — and
 * could push `h5`/`h6` content into the `h6` clamp, erasing depth distinctions the
 * author made. Depth *relative* to the shallowest heading is preserved either way.
 *
 * Only tag names move: no id, attribute or text is added or rewritten, and this runs
 * before sanitization, which keeps its own allowlist and escaping untouched.
 */
function demoteContentHeadings(tokens: Token[]): void {
  // The open and the close token of a heading carry the same tag, so both are read and
  // both are moved: leaving the close token behind would emit `<h2>…</h1>`.
  const headings: { token: Token; level: number }[] = [];
  for (const token of tokens) {
    if (token.type !== "heading_open" && token.type !== "heading_close") continue;
    const level = HEADING_TAG.exec(token.tag)?.[1];
    if (level === undefined) continue;
    headings.push({ token, level: Number(level) });
  }
  if (!headings.some((heading) => heading.level === 1)) return;
  for (const heading of headings) heading.token.tag = `h${Math.min(heading.level + 1, 6)}`;
}

markdown.core.ruler.push("content_heading_levels", (state: StateCore) => { demoteContentHeadings(state.tokens); });

function sanitize(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul"],
    ALLOWED_ATTR: ["class", "href", "rel", "target"],
    FORBID_ATTR: ["style", "onerror", "onclick", "onload"],
    ALLOW_DATA_ATTR: false,
  });
}

export function renderSafeMarkdown(source: string): ReactNode {
  const html = sanitize(markdown.render(source));
  return createElement("div", { className: "markdown-content", dangerouslySetInnerHTML: { __html: html } });
}
