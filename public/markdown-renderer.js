const ALLOWED_TAGS = Object.freeze([
  "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "li", "ol", "p", "pre", "s", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
]);
const ALLOWED_ATTRIBUTES = Object.freeze(["class", "href", "rel", "target", "title"]);
const SAFE_PROTOCOL = /^(?:https?:\/\/|mailto:)/iu;

export function renderSafeMarkdown(markdown) {
  const markdownFactory = globalThis.markdownit;
  const purifier = globalThis.DOMPurify;
  if (typeof markdownFactory !== "function" || !purifier || typeof purifier.sanitize !== "function") {
    throw new Error("Local Markdown renderer dependencies are unavailable");
  }
  const parser = markdownFactory({ html: false, linkify: true, breaks: false });
  parser.validateLink = isSafeLink;
  const rendered = parser.render(typeof markdown === "string" ? markdown : "");
  const fragment = purifier.sanitize(`\n${rendered}`, {
    ALLOWED_TAGS: [...ALLOWED_TAGS],
    ALLOWED_ATTR: [...ALLOWED_ATTRIBUTES],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: SAFE_PROTOCOL,
    FORBID_TAGS: ["script", "style", "iframe", "form", "svg", "math"],
    FORBID_ATTR: ["style", "src", "srcset", "id", "name"],
    RETURN_DOM_FRAGMENT: true,
  });
  for (const anchor of fragment.querySelectorAll("a")) {
    const href = anchor.getAttribute("href") || "";
    if (!isSafeLink(href)) {
      anchor.replaceWith(...anchor.childNodes);
      continue;
    }
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }
  return fragment;
}

function isSafeLink(value) {
  if (typeof value !== "string" || value !== value.trim() || /[\p{Cc}\s]/u.test(value)) return false;
  if (!SAFE_PROTOCOL.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}
