import DOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import { createElement, type ReactNode } from "react";

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
});

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
