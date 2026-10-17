import DOMPurify from "dompurify";
import MarkdownIt, { type RendererRule, type StateCore, type Token } from "markdown-it";
import { createElement, type ReactNode } from "react";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

const HEADING_TAG = /^h([1-6])$/u;

/**
 * An image only enters the article when its source is one the reader can safely fetch:
 * an absolute `http(s)` URL, or a same-origin/relative path. Every other scheme —
 * `javascript:`, `vbscript:`, `data:`, `file:`, protocol-relative `//host` — is refused and
 * the image's alt text is rendered instead, so a published revision can never turn a
 * Markdown image into script, a local file read or an unexpected host.
 */
function safeImageSource(source: string): string | null {
  const value = source.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(value)) return /^https?:/iu.test(value) ? value : null;
  if (value.startsWith("//")) return null;
  return value;
}

/**
 * Renders the image when its source passes the scheme check, and its alt text otherwise.
 * The safety attributes are written here, before sanitization: the reader's delegated
 * click/keyboard handler is what turns the image into the lightbox trigger, and lazy +
 * async decoding keeps a long article from fetching every picture at once.
 */
const renderImage: RendererRule = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const source = token.attrGet("src") ?? "";
  const sourceText = typeof source === "string" ? source : "";
  const alt = self.renderInlineAsText(token.children ?? [], options, env);
  const safe = safeImageSource(sourceText);
  if (safe === null) return alt.replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
  token.attrSet("src", safe);
  token.attrSet("loading", "lazy");
  token.attrSet("decoding", "async");
  token.attrSet("class", "reader-image");
  token.attrSet("role", "button");
  token.attrSet("tabindex", "0");
  token.attrSet("aria-haspopup", "dialog");
  return self.renderToken(tokens, index, options);
};

markdown.renderer.rules.image = renderImage;

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
    ALLOWED_TAGS: ["a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "img", "li", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul"],
    ALLOWED_ATTR: ["alt", "aria-haspopup", "class", "decoding", "height", "href", "loading", "rel", "role", "src", "tabindex", "target", "title", "width"],
    // Every URL-valued attribute (including `img src`) is held to these schemes; the
    // renderer above has already dropped anything else before this pass runs.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/iu,
    FORBID_ATTR: ["style", "onerror", "onclick", "onload"],
    ALLOW_DATA_ATTR: false,
  });
}

export function renderSafeMarkdown(source: string): ReactNode {
  const html = sanitize(markdown.render(source));
  return createElement("div", { className: "markdown-content", dangerouslySetInnerHTML: { __html: html } });
}
