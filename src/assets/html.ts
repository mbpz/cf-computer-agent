import { APP_CONFIG } from "../config";
import { AppError } from "../http";

export interface RecoveredHtmlMarkdown { markdown: string; warnings: string[] }

type TableState = { rows: string[][]; row: string[] | null; cell: string | null; header: boolean };

/** Deterministic HTML-to-Markdown sanitizer. No DOM, scripts or raw HTML survive the boundary. */
export function recoverHtmlMarkdown(bytes: ArrayBuffer): RecoveredHtmlMarkdown {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) throw new AppError("ASSET_HTML_EMPTY", "HTML is empty", 422);
  if (bytes.byteLength > APP_CONFIG.maxHtmlParseBytes) throw new AppError("ASSET_HTML_TOO_LARGE", "HTML parsing input exceeds the limit", 413);
  let html: string;
  try { html = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new AppError("ASSET_CONTENT_INVALID", "Asset content encoding is invalid", 422); }
  const markdown = convert(html);
  if (!markdown.trim()) throw new AppError("ASSET_HTML_EMPTY", "HTML has no readable content", 422);
  if (new TextEncoder().encode(markdown).byteLength > APP_CONFIG.maxHtmlOutputBytes) throw new AppError("ASSET_HTML_OUTPUT_TOO_LARGE", "HTML output exceeds the limit", 422);
  return { markdown: `${markdown.trim()}\n`, warnings: [] };
}

function convert(html: string): string {
  const tokens = html
    .replace(/<!--[\s\S]*?-->|<!DOCTYPE[\s\S]*?>/giu, "")
    .replace(/<(script|style|template|iframe|object|embed|svg|math|canvas|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu, "")
    .match(/<\/?[a-z][^>]*>|[^<]+/giu) ?? [];
  let output = ""; let link: { text: string; href: string } | null = null; let pre = false; let inlineCode = false;
  let listDepth = 0; let table: TableState | null = null;
  const emitBlock = () => { if (output && !output.endsWith("\n\n")) output = `${output.replace(/\n+$/u, "")}\n\n`; };
  const text = (value: string) => {
    const decoded = decodeEntities(value);
    if (table !== null && table.cell !== null) { table.cell += decoded.replace(/[\r\n]+/gu, " "); return; }
    if (link) { link.text += decoded; return; }
    output += pre ? decoded : escapeMarkdownText(decoded);
  };
  for (const token of tokens) {
    if (!token.startsWith("<")) { text(token); continue; }
    const close = /^<\//u.test(token); const match = /^<\/?\s*([a-z][\w:-]*)\b([^>]*)>/iu.exec(token);
    if (!match) continue;
    const tag = match[1]!.toLowerCase(); const attrs = match[2] ?? "";
    if (["script", "style", "template", "iframe", "object", "embed", "svg", "math", "canvas", "noscript"].includes(tag)) continue;
    if (table) {
      if (!close && tag === "tr") { table.row = []; continue; }
      if (close && tag === "tr") { if (table.row && table.row.length) table.rows.push(table.row); table.row = null; continue; }
      if (!close && (tag === "th" || tag === "td")) { table.cell = ""; table.header ||= tag === "th"; continue; }
      if (close && (tag === "th" || tag === "td")) { if (table.row && table.cell !== null) table.row.push(escapeTableCell(table.cell)); table.cell = null; continue; }
      if (table.cell !== null) { if (!close && tag === "br") table.cell += " "; continue; }
      if (close && tag === "table") { output += renderTable(table.rows); table = null; emitBlock(); continue; }
      continue;
    }
    if (!close && tag === "table") { emitBlock(); table = { rows: [], row: null, cell: null, header: false }; continue; }
    if (!close && tag === "a") { const href = safeHref(attribute(attrs, "href")); link = href ? { text: "", href } : { text: "", href: "" }; continue; }
    if (close && tag === "a") { if (link) output += link.href ? `[${escapeMarkdownText(link.text)}](${link.href})` : escapeMarkdownText(link.text); link = null; continue; }
    if (!close && /^h[1-6]$/u.test(tag)) { emitBlock(); output += `${"#".repeat(Number(tag.slice(1)))} `; continue; }
    if (close && /^h[1-6]$/u.test(tag)) { emitBlock(); continue; }
    if (!close && (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "blockquote")) { emitBlock(); continue; }
    if (close && (tag === "p" || tag === "div" || tag === "section" || tag === "article" || tag === "blockquote")) { emitBlock(); continue; }
    if (!close && (tag === "strong" || tag === "b")) { output += "**"; continue; }
    if (close && (tag === "strong" || tag === "b")) { output += "**"; continue; }
    if (!close && (tag === "em" || tag === "i")) { output += "*"; continue; }
    if (close && (tag === "em" || tag === "i")) { output += "*"; continue; }
    if (!close && tag === "pre") { emitBlock(); output += "```\n"; pre = true; continue; }
    if (close && tag === "pre") { output += "\n```"; pre = false; emitBlock(); continue; }
    if (!close && tag === "code" && !pre) { output += "`"; inlineCode = true; continue; }
    if (close && tag === "code" && inlineCode) { output += "`"; inlineCode = false; continue; }
    if (!close && (tag === "ul" || tag === "ol")) { listDepth += 1; emitBlock(); continue; }
    if (close && (tag === "ul" || tag === "ol")) { listDepth = Math.max(0, listDepth - 1); emitBlock(); continue; }
    if (!close && tag === "li") { if (output && !output.endsWith("\n") && !output.endsWith("\n\n")) output += "\n"; output += `${"  ".repeat(Math.max(0, listDepth - 1))}- `; continue; }
    if (!close && tag === "br") output += "\n";
  }
  if (table) { if (table.row?.length) table.rows.push(table.row); output += renderTable(table.rows); }
  return output;
}

function renderTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((row) => row.length));
  const padded = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
  const header = padded[0]!;
  return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...padded.slice(1).map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function safeHref(value: string | null): string {
  if (!value) return "";
  const decoded = decodeEntities(value).trim();
  if (/^(?:https?:|mailto:)/iu.test(decoded) && !/[\u0000-\u001f\u007f"'<>]/u.test(decoded)) return decoded;
  return "";
}
function attribute(attrs: string, name: string): string | null { return new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, "iu").exec(attrs)?.[1] ?? null; }
function decodeEntities(value: string): string { return value.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|[0-9]+);/giu, (entity) => { const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }; if (named[entity]) return named[entity]; const code = entity.startsWith("&#x") || entity.startsWith("&#X") ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10); return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; }); }
function escapeMarkdownText(value: string): string { return value.replace(/[\\`]/gu, "\\$&"); }
function escapeTableCell(value: string): string { return escapeMarkdownText(value).replace(/\|/gu, "\\|").replace(/[\r\n]+/gu, " ").trim(); }
