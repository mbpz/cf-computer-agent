import { APP_CONFIG } from "../config";
import { AppError } from "../http";

export type PdfPageNumber = number | "unknown";

export interface RecoveredPdfPage {
  page: PdfPageNumber;
  text: string;
}

export interface RecoveredPdfMarkdown {
  markdown: string;
  pages: RecoveredPdfPage[];
  warnings: string[];
}

/**
 * Recover text from the small, uncompressed PDF subset available without a
 * native parser. Never sends PDF bytes to an AI model. Callers can persist the
 * page heading in the normal Markdown/chunk path and display `unknown` when
 * a page has no recoverable text stream.
 */
export function recoverPdfMarkdown(bytes: ArrayBuffer): RecoveredPdfMarkdown {
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) {
    throw new AppError("ASSET_CONTENT_INVALID", "Asset content is invalid", 422);
  }
  if (bytes.byteLength > APP_CONFIG.maxPdfParseBytes) {
    throw new AppError("ASSET_PDF_TOO_LARGE", "PDF parsing input exceeds the limit", 413);
  }

  const source = new TextDecoder("latin1").decode(bytes);
  if (!source.startsWith("%PDF-")) {
    throw new AppError("ASSET_CONTENT_INVALID", "Asset content is invalid", 422);
  }

  const objects = collectObjects(source);
  const pageObjects = [...objects.entries()]
    .filter(([, body]) => /\/Type\s*\/Page(?:\s|\/|>>)/u.test(body))
    .sort(([left], [right]) => left - right);
  if (pageObjects.length === 0 || pageObjects.length > APP_CONFIG.maxPdfPages) {
    throw new AppError("ASSET_PDF_PARSE_UNSUPPORTED", "PDF page structure is not supported", 422);
  }

  const pages: RecoveredPdfPage[] = pageObjects.map(([, pageObject], index) => {
    const contentRefs = [...pageObject.matchAll(/\/Contents\s+(\d+)\s+0\s+R/gu)].map((match) => Number(match[1]));
    const text = contentRefs.flatMap((ref) => extractObjectText(objects.get(ref) ?? "")).join("\n");
    const normalized = normalizeExtractedText(text);
    return normalized
      ? { page: index + 1, text: normalized }
      : { page: "unknown", text: "" };
  });
  const warnings = pages.some((page) => page.page === "unknown") ? ["PDF_TEXT_UNAVAILABLE"] : [];
  const markdown = `${pages.map((page) => {
    const heading = `## Page ${page.page}`;
    return page.text ? `${heading}\n\n${page.text}` : heading;
  }).join("\n\n")}\n`;
  return { markdown, pages, warnings };
}

function collectObjects(source: string): Map<number, string> {
  const objects = new Map<number, string>();
  const objectPattern = /(\d+)\s+0\s+obj\b([\s\S]*?)endobj\b/gu;
  for (const match of source.matchAll(objectPattern)) {
    const id = Number(match[1]);
    const body = match[2];
    if (Number.isSafeInteger(id) && body !== undefined) objects.set(id, body);
  }
  return objects;
}

function extractObjectText(object: string): string[] {
  const streamMatch = /\bstream\r?\n([\s\S]*?)\r?\nendstream\b/u.exec(object);
  const content = streamMatch?.[1] ?? object;
  const text: string[] = [];
  for (const block of content.matchAll(/\bBT\b([\s\S]*?)\bET\b/gu)) {
    const body = block[1] ?? "";
    for (const match of body.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj\b/gu)) {
      text.push(decodeLiteral(match[1] ?? ""));
    }
    for (const match of body.matchAll(/\[((?:\\.|[^\]])*)\]\s*TJ\b/gu)) {
      for (const literal of (match[1] ?? "").matchAll(/\(((?:\\.|[^\\)])*)\)/gu)) {
        text.push(decodeLiteral(literal[1] ?? ""));
      }
    }
  }
  return text;
}

function decodeLiteral(value: string): string {
  return value.replace(/\\(?:([nrtbf()\\])|([0-7]{1,3})|\r?\n)/gu, (_match, escaped: string | undefined, octal: string | undefined) => {
    if (escaped !== undefined) return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" }[escaped] ?? escaped);
    if (octal !== undefined) return String.fromCharCode(Number.parseInt(octal, 8));
    return "";
  });
}

function normalizeExtractedText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .replace(/[ \t]+/gu, " ")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}
