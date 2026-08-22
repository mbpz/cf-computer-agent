import { AppError } from "../http";
import { hasSemanticSourceContent } from "./limits";
import type { ParsedSource, ParseSourceInput } from "./types";

const maxSourceBytes = 128 * 1024;
const parserVersion = "m1-v1" as const;
const parserSchemaVersion = "m1-v2" as const;
const allowedLanguages = new Set([
  "plaintext", "javascript", "typescript", "python", "go", "rust", "java", "sql", "json", "yaml", "shell",
]);

export async function parseSource(input: ParseSourceInput): Promise<ParsedSource> {
  assertParseInput(input);
  const codeMetadata = normalizeCodeMetadata(input);
  const normalizedMarkdown = normalizeSource(input, codeMetadata);
  const normalizedBytes = new TextEncoder().encode(normalizedMarkdown);
  if (!hasSemanticSourceContent(input.kind, normalizedMarkdown)) {
    throw new AppError("SOURCE_EMPTY", "Source content is empty", 400);
  }
  if (normalizedBytes.byteLength > maxSourceBytes) {
    throw new AppError("SOURCE_TOO_LARGE", "Source content exceeds the limit", 400);
  }
  const [digest, sourceIdentityDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", normalizedBytes),
    crypto.subtle.digest("SHA-256", canonicalSourceIdentityBytes(input.kind, normalizedMarkdown, codeMetadata)),
  ]);
  return {
    normalizedMarkdown,
    contentSha256: hex(digest),
    parserVersion,
    parserSchemaVersion,
    sourceIdentitySha256: hex(sourceIdentityDigest),
    warnings: [],
    codeMetadata,
    lineCount: countLines(normalizedMarkdown),
  };
}

function assertParseInput(input: ParseSourceInput): void {
  if (!input || !isSourceKind(input.kind) || typeof input.content !== "string"
    || input.content.includes("\0") || hasMalformedSurrogate(input.content)) {
    throw new AppError("SOURCE_METADATA_INVALID", "Source metadata is invalid", 400);
  }
  if (new TextEncoder().encode(input.content).byteLength > maxSourceBytes) {
    throw new AppError("SOURCE_TOO_LARGE", "Source content exceeds the limit", 400);
  }
}

function normalizeSource(input: ParseSourceInput, codeMetadata: import("./types").CodeSourceMetadata | null): string {
  const content = normalizeNewlines(input.content);
  if (input.kind === "text") return escapeLiteralMarkdown(content);
  if (input.kind === "markdown") return normalizeMarkdown(content);

  const body = content.endsWith("\n") ? content : `${content}\n`;
  const longestBacktickRun = Math.max(0, ...[...body.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}${codeMetadata!.language}\n${body}${fence}\n`;
}

function normalizeCodeMetadata(input: ParseSourceInput): import("./types").CodeSourceMetadata | null {
  if (input.kind !== "code") {
    if (input.language !== undefined || input.fileLabel !== undefined || input.lineBaseline !== undefined) {
      throw new AppError("SOURCE_METADATA_INVALID", "Source metadata is invalid", 400);
    }
    return null;
  }
  if (input.language !== undefined && typeof input.language !== "string"
    || input.fileLabel !== undefined && typeof input.fileLabel !== "string"
    || input.lineBaseline !== undefined && (!Number.isSafeInteger(input.lineBaseline)
      || input.lineBaseline < 1 || input.lineBaseline > 1_000_000)) {
    throw new AppError("SOURCE_METADATA_INVALID", "Source metadata is invalid", 400);
  }
  const language = (input.language ?? "plaintext").trim().toLowerCase();
  const fileLabel = (input.fileLabel ?? "untitled").trim();
  if (!allowedLanguages.has(language) || !fileLabel
    || new TextEncoder().encode(fileLabel).byteLength > 128
    || /[\\/\p{Cc}]/u.test(fileLabel)) {
    throw new AppError("SOURCE_METADATA_INVALID", "Source metadata is invalid", 400);
  }
  return { language, fileLabel, lineBaseline: input.lineBaseline ?? 1 };
}

function normalizeMarkdown(content: string): string {
  if (containsRawHtml(content) || containsExecutableMarkdownUrl(content)) {
    throw new AppError("SOURCE_METADATA_INVALID", "Source metadata is invalid", 400);
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
  const decoded = decodeMarkdownDestinationSyntax(content);
  const controlFolded = decoded.replace(/[\u0000-\u0020\u007f]/gu, "");
  return /(?:\]\(<?|\]:<?|<)(?:javascript|data|vbscript):/iu.test(controlFolded);
}
function decodeMarkdownDestinationSyntax(content: string): string {
  return content
    .replace(/&#(?:[xX]([0-9A-Fa-f]{1,6})|([0-9]{1,7}));/gu, (reference, hex: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hex ?? decimal!, hex === undefined ? 10 : 16);
      return codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff)
        ? String.fromCodePoint(codePoint)
        : reference;
    })
    .replace(/&(colon|Tab|NewLine);/gu, (_reference, name: string) => ({ colon: ":", Tab: "\t", NewLine: "\n" })[name]!)
    .replace(/\\([!-/:-@[-`{-~])/gu, "$1");
}
function countLines(content: string): number {
  const withoutTerminalNewline = content.endsWith("\n") ? content.slice(0, -1) : content;
  return withoutTerminalNewline.split("\n").length;
}
function canonicalSourceIdentityBytes(
  kind: ParseSourceInput["kind"],
  normalizedMarkdown: string,
  codeMetadata: import("./types").CodeSourceMetadata | null,
): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify([
    "m1-source-identity-v1", parserSchemaVersion, kind, normalizedMarkdown,
    codeMetadata?.language ?? null, codeMetadata?.fileLabel ?? null, codeMetadata?.lineBaseline ?? null,
  ])).buffer as ArrayBuffer;
}
function hex(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
