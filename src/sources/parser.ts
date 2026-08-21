import { AppError } from "../http";
import type { ParsedSource, ParseSourceInput } from "./types";

const maxSourceBytes = 128 * 1024;
const parserVersion = "m1-v1" as const;
const allowedLanguages = new Set([
  "bash", "c", "cpp", "csharp", "css", "go", "html", "java", "javascript", "js", "json",
  "markdown", "python", "rust", "shell", "sql", "text", "ts", "typescript", "yaml",
]);

export async function parseSource(input: ParseSourceInput): Promise<ParsedSource> {
  assertParseInput(input);
  const normalizedMarkdown = normalizeSource(input);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedMarkdown));
  return {
    normalizedMarkdown,
    contentSha256: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
    parserVersion,
    lineCount: countLines(normalizedMarkdown),
  };
}

function assertParseInput(input: ParseSourceInput): void {
  if (!input || !isSourceKind(input.kind) || typeof input.content !== "string" || input.content.length === 0
    || input.content.includes("\0") || hasMalformedSurrogate(input.content)
    || new TextEncoder().encode(input.content).byteLength > maxSourceBytes
    || (input.language !== undefined && typeof input.language !== "string")) {
    throw new AppError("SOURCE_INVALID", "Source content is invalid", 400);
  }
}

function normalizeSource(input: ParseSourceInput): string {
  const content = normalizeNewlines(input.content);
  if (input.kind === "text") return escapeLiteralMarkdown(content);
  if (input.kind === "markdown") return normalizeMarkdown(content);

  const body = content.endsWith("\n") ? content : `${content}\n`;
  const longestBacktickRun = Math.max(0, ...[...body.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  const language = input.language && allowedLanguages.has(input.language.toLowerCase())
    ? input.language.toLowerCase()
    : "";
  return `${fence}${language}\n${body}${fence}\n`;
}

function normalizeMarkdown(content: string): string {
  if (containsRawHtml(content) || containsExecutableMarkdownUrl(content)) {
    throw new AppError("SOURCE_INVALID", "Source content is invalid", 400);
  }
  const lines = content.split("\n").map((line) => line.replace(/[\t ]+$/u, ""));
  while (lines.at(-1) === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

function normalizeNewlines(content: string): string { return content.replace(/\r\n?/gu, "\n"); }
function escapeLiteralMarkdown(content: string): string { return content.replace(/[!-/:-@[-`{-~]/gu, "\\$&"); }
function containsRawHtml(content: string): boolean {
  if (/<(?:!--|!\[CDATA\[|![A-Za-z]|\?)/iu.test(content)) return true;
  for (const match of content.matchAll(/<\/?[A-Za-z][^>]*>/gu)) {
    const token = match[0];
    if (/^<(?:https?|mailto):[^<>\s]+>$/iu.test(token) || /^<[^<>\s@]+@[^<>\s@]+>$/u.test(token)) continue;
    return true;
  }
  return false;
}
function containsExecutableMarkdownUrl(content: string): boolean {
  return /(?:\]\(\s*<?|\]:\s*<?|<)\s*(?:javascript|data|vbscript)\s*:/imu.test(content);
}
function countLines(content: string): number {
  const withoutTerminalNewline = content.endsWith("\n") ? content.slice(0, -1) : content;
  return withoutTerminalNewline.split("\n").length;
}
function isSourceKind(value: unknown): value is ParseSourceInput["kind"] {
  return value === "text" || value === "markdown" || value === "code";
}
function hasMalformedSurrogate(content: string): boolean {
  for (let index = 0; index < content.length; index += 1) {
    const unit = content.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = content.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}
