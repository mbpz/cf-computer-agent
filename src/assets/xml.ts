import { APP_CONFIG } from "../config";
import { AppError } from "../http";

export interface RecoveredXmlMarkdown { markdown: string; warnings: string[] }
type Node = { name: string; text: string; children: Node[] };

/** Bounded XML reader. It rejects declarations rather than attempting entity resolution. */
export function recoverXmlMarkdown(bytes: ArrayBuffer): RecoveredXmlMarkdown {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) throw new AppError("ASSET_XML_EMPTY", "XML is empty", 422);
  if (bytes.byteLength > APP_CONFIG.maxXmlParseBytes) throw new AppError("ASSET_XML_TOO_LARGE", "XML parsing input exceeds the limit", 413);
  let xml: string;
  try { xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new AppError("ASSET_CONTENT_INVALID", "Asset content encoding is invalid", 422); }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) throw new AppError("ASSET_XML_PARSE_UNSUPPORTED", "XML declarations are unsupported", 422);
  const root = parseTree(xml);
  if (!root || (!root.text.trim() && root.children.length === 0)) throw new AppError("ASSET_XML_EMPTY", "XML has no readable content", 422);
  const markdown = renderNode(root, 2).trim();
  if (!markdown) throw new AppError("ASSET_XML_EMPTY", "XML has no readable content", 422);
  if (new TextEncoder().encode(markdown).byteLength > APP_CONFIG.maxXmlOutputBytes) throw new AppError("ASSET_XML_OUTPUT_TOO_LARGE", "XML output exceeds the limit", 422);
  return { markdown: `${markdown}\n`, warnings: [] };
}

function parseTree(xml: string): Node | null {
  const tokens = xml.replace(/<!--[\s\S]*?-->|<\?xml[\s\S]*?\?>|<\?[^>]*\?>/giu, "").match(/<\/?[a-z_][\w:.-]*\b[^>]*>|<!\[CDATA\[[\s\S]*?\]\]>|[^<]+/giu) ?? [];
  const stack: Node[] = []; let root: Node | null = null; let elementCount = 0;
  for (const token of tokens) {
    if (!token.startsWith("<")) { if (stack.length) stack[stack.length - 1]!.text += decodeEntities(token); continue; }
    if (token.startsWith("<![CDATA[")) { if (stack.length) stack[stack.length - 1]!.text += token.slice(9, -3); continue; }
    const close = /^<\//u.test(token); const match = /^<\/?\s*([a-z_][\w:.-]*)\b([^>]*)>/iu.exec(token);
    if (!match) throw new AppError("ASSET_XML_PARSE_UNSUPPORTED", "XML syntax is unsupported", 422);
    const name = match[1]!; const selfClosing = /\/\s*>$/u.test(token);
    if (close) {
      const current = stack.pop();
      if (!current || current.name !== name) throw new AppError("ASSET_XML_PARSE_UNSUPPORTED", "XML tags are mismatched", 422);
      continue;
    }
    elementCount += 1;
    if (elementCount > APP_CONFIG.maxXmlElements || stack.length >= APP_CONFIG.maxXmlDepth) throw new AppError("ASSET_XML_TOO_LARGE", "XML structure exceeds the limit", 413);
    const node: Node = { name, text: "", children: [] };
    if (stack.length) stack[stack.length - 1]!.children.push(node); else if (root) throw new AppError("ASSET_XML_PARSE_UNSUPPORTED", "XML has multiple roots", 422); else root = node;
    if (!selfClosing) stack.push(node);
  }
  if (stack.length || !root) throw new AppError("ASSET_XML_PARSE_UNSUPPORTED", "XML is incomplete", 422);
  return root;
}

function renderNode(node: Node, level: number): string {
  const text = node.text.replace(/[\s\u0000]+/gu, " ").trim();
  if (node.children.length === 0) return `- ${safeLabel(node.name)}: ${escapeMarkdown(text)}`;
  const lines = [`${"#".repeat(Math.min(6, level))} ${safeLabel(node.name)}`, ""];
  for (const child of node.children) lines.push(renderNode(child, Math.min(6, level + 1)));
  if (text) lines.push(escapeMarkdown(text));
  return lines.join("\n");
}

function safeLabel(value: string): string { return value.replace(/[^a-z0-9_:. -]/giu, "").trim() || "element"; }
function escapeMarkdown(value: string): string { return value.replace(/[\\`]/gu, "\\$&"); }
function decodeEntities(value: string): string { return value.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|[0-9]+);/giu, (entity) => { const named: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }; if (named[entity]) return named[entity]; const code = entity.startsWith("&#x") || entity.startsWith("&#X") ? Number.parseInt(entity.slice(3, -1), 16) : Number.parseInt(entity.slice(2, -1), 10); return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ""; }); }
