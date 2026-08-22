import { uniqueSearchTerms } from "../library/lexical";
import type { SubmissionKind } from "../submissions/types";
import type { ParsedSource } from "./types";
import { MAX_REVISION_CHUNKS } from "./limits";

const defaultMaxCodePoints = 1_200;
const defaultOverlapCodePoints = 120;

export interface ChunkDraft {
  ordinal: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
  body: string;
  searchBody: string;
}

export function chunkDocument(
  document: Pick<ParsedSource, "normalizedMarkdown"> & { kind: SubmissionKind; lineBaseline?: number },
  options?: { maxCodePoints?: number; overlapCodePoints?: number },
): ChunkDraft[] {
  const maxCodePoints = options?.maxCodePoints ?? defaultMaxCodePoints;
  const overlapCodePoints = options?.overlapCodePoints ?? defaultOverlapCodePoints;
  assertChunkOptions(maxCodePoints, overlapCodePoints);

  if (document.normalizedMarkdown.trim().length === 0) return [];

  const blocks = parseBlocks(document.normalizedMarkdown);
  const drafts: ChunkDraft[] = [];
  for (const block of blocks) {
    const chunks = block.kind === "code"
      ? splitCodeBlock(block, maxCodePoints, overlapCodePoints)
      : splitTextBlock(block, maxCodePoints, overlapCodePoints);
    for (const chunk of chunks) {
      const searchBody = makeSearchBody(chunk.body);
      if (chunk.body.trim().length === 0 || searchBody.trim().length === 0) continue;
      drafts.push({
        ordinal: drafts.length,
        headingPath: [...block.headingPath],
        ...sourceLocation(document, chunk.startLine, chunk.endLine),
        body: chunk.body,
        searchBody,
      });
      if (drafts.length > MAX_REVISION_CHUNKS) {
        throw new RangeError(`Document exceeds ${MAX_REVISION_CHUNKS} revision chunks`);
      }
    }
  }

  // A document containing only headings still has useful source material. This
  // fallback also keeps the non-empty-input invariant explicit.
  if (drafts.length === 0) {
    const firstLine = document.normalizedMarkdown
      .split("\n")
      .map((text, index) => ({ text, line: index + 1 }))
      .find(({ text }) => text.trim().length > 0);
    if (firstLine === undefined) return [];
    const heading = parseHeading(firstLine.text);
    return [{
      ordinal: 0,
      headingPath: heading === null ? [] : [heading.title],
      ...sourceLocation(document, firstLine.line, firstLine.line),
      body: firstLine.text,
      searchBody: makeSearchBody(firstLine.text),
    }];
  }
  return drafts;
}

function sourceLocation(
  document: Pick<ParsedSource, "normalizedMarkdown"> & { kind: SubmissionKind; lineBaseline?: number },
  startLine: number,
  endLine: number,
): Pick<ChunkDraft, "startLine" | "endLine"> {
  if (document.kind !== "code" || document.lineBaseline === undefined) return { startLine, endLine };
  const lines = document.normalizedMarkdown.endsWith("\n")
    ? document.normalizedMarkdown.slice(0, -1).split("\n")
    : document.normalizedMarkdown.split("\n");
  const firstSourceLine = 2;
  const lastSourceLine = Math.max(firstSourceLine, lines.length - 1);
  const translate = (line: number) => document.lineBaseline! + Math.min(
    Math.max(line, firstSourceLine),
    lastSourceLine,
  ) - firstSourceLine;
  return { startLine: translate(startLine), endLine: translate(endLine) };
}

interface SourceLine {
  text: string;
  line: number;
}

interface Block {
  kind: "text" | "code";
  lines: SourceLine[];
  headingPath: string[];
}

interface LocatedChunk {
  body: string;
  startLine: number;
  endLine: number;
}

function parseBlocks(markdown: string): Block[] {
  const sourceLines = markdown.endsWith("\n") ? markdown.slice(0, -1).split("\n") : markdown.split("\n");
  const blocks: Block[] = [];
  const headingStack: Array<{ level: number; title: string }> = [];
  let pending: SourceLine[] = [];

  const flushPending = (): void => {
    if (pending.length === 0) return;
    blocks.push({ kind: "text", lines: pending, headingPath: headingStack.map(({ title }) => title) });
    pending = [];
  };

  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index]!;
    const sourceLine: SourceLine = { text: line, line: index + 1 };
    const heading = parseHeading(line);
    if (heading !== null) {
      flushPending();
      while (headingStack.at(-1)?.level !== undefined && headingStack.at(-1)!.level >= heading.level) {
        headingStack.pop();
      }
      headingStack.push(heading);
      continue;
    }

    const fence = parseFenceStart(line);
    if (fence !== null) {
      flushPending();
      const lines = [sourceLine];
      let closed = false;
      while (++index < sourceLines.length) {
        const codeLine = sourceLines[index]!;
        lines.push({ text: codeLine, line: index + 1 });
        if (isFenceEnd(codeLine, fence)) {
          closed = true;
          break;
        }
      }
      // An unclosed fence is still treated as a code block; preserving all
      // lines is safer and deterministic for malformed source.
      void closed;
      blocks.push({ kind: "code", lines, headingPath: headingStack.map(({ title }) => title) });
      continue;
    }

    if (/^\s*$/u.test(line)) {
      flushPending();
      continue;
    }
    pending.push(sourceLine);
  }
  flushPending();
  return blocks;
}

function parseHeading(line: string): { level: number; title: string } | null {
  const match = /^(?: {0,3})(#{1,6})(?:[ \t]+(.*?)\s*|[ \t]*)$/u.exec(line);
  if (match === null) return null;
  const title = (match[2] ?? "").replace(/[ \t]+#+[ \t]*$/u, "").trim();
  return { level: match[1]!.length, title: title || match[1]! };
}

interface Fence {
  marker: "`" | "~";
  length: number;
}

function parseFenceStart(line: string): Fence | null {
  const match = /^(?: {0,3})(`{3,}|~{3,})[^`~]*$/u.exec(line);
  return match === null ? null : { marker: match[1]![0] as Fence["marker"], length: match[1]!.length };
}

function isFenceEnd(line: string, fence: Fence): boolean {
  const escapedMarker = fence.marker === "`" ? "`" : "~";
  return new RegExp(`^ {0,3}${escapedMarker}{${fence.length},}\\s*$`, "u").test(line);
}

function splitTextBlock(block: Block, max: number, overlap: number): LocatedChunk[] {
  const lines = block.lines;
  const body = lines.map(({ text }) => text).join("\n");
  const codePoints = [...body];
  if (codePoints.length <= max) {
    return [{ body, startLine: lines[0]!.line, endLine: lines.at(-1)!.line }];
  }

  const lineStarts = [0];
  for (const line of lines.slice(0, -1)) lineStarts.push(lineStarts.at(-1)! + [...line.text].length + 1);
  const chunks: LocatedChunk[] = [];
  let start = 0;
  while (start < codePoints.length) {
    const end = Math.min(start + max, codePoints.length);
    const chunkBody = codePoints.slice(start, end).join("");
    if (chunkBody.trim().length === 0) {
      // A small budget can land exactly on a line separator. Do not emit a
      // whitespace-only retrieval unit; the next window owns the separator.
      if (end === codePoints.length) break;
      start = end;
      continue;
    }
    chunks.push({
      body: chunkBody,
      startLine: lineAtOffset(start, lineStarts, lines[0]!.line),
      endLine: lineAtOffset(Math.max(start, end - 1), lineStarts, lines[0]!.line),
    });
    if (end === codePoints.length) break;
    const nextStart = end - overlap;
    if (nextStart <= start) throw new RangeError("overlapCodePoints must be smaller than maxCodePoints");
    start = nextStart;
  }
  return chunks;
}

function splitCodeBlock(block: Block, max: number, overlap: number): LocatedChunk[] {
  const lines = block.lines;
  const total = countJoinedCodePoints(lines);
  if (total <= max) {
    return [{
      body: lines.map(({ text }) => text).join("\n"),
      startLine: lines[0]!.line,
      endLine: lines.at(-1)!.line,
    }];
  }

  const chunks: LocatedChunk[] = [];
  let start = 0;
  while (start < lines.length) {
    const oversizedLine = [...lines[start]!.text];
    if (oversizedLine.length > max) {
      let offset = 0;
      while (offset < oversizedLine.length) {
        const end = Math.min(offset + max, oversizedLine.length);
        const body = oversizedLine.slice(offset, end).join("");
        if (body.length > 0) {
          chunks.push({
            body,
            startLine: lines[start]!.line,
            endLine: lines[start]!.line,
          });
        }
        if (end === oversizedLine.length) break;
        offset = end - overlap;
      }
      start += 1;
      continue;
    }
    let end = start;
    let size = 0;
    while (end < lines.length) {
      const nextSize = size + [...lines[end]!.text].length + (end === start ? 0 : 1);
      if (end > start && nextSize > max) break;
      size = nextSize;
      end += 1;
      if (size >= max) break;
    }
    if (end === start) end += 1;
    chunks.push({
      body: lines.slice(start, end).map(({ text }) => text).join("\n"),
      startLine: lines[start]!.line,
      endLine: lines[end - 1]!.line,
    });
    if (end === lines.length) break;

    let nextStart = end;
    let overlapSize = 0;
    for (let candidate = end - 1; candidate > start; candidate -= 1) {
      const lineSize = [...lines[candidate]!.text].length + (candidate === end - 1 ? 0 : 1);
      if (overlapSize + lineSize > overlap) break;
      overlapSize += lineSize;
      nextStart = candidate;
    }
    start = nextStart;
  }
  return chunks;
}

function countJoinedCodePoints(lines: SourceLine[]): number {
  return lines.reduce((sum, line, index) => sum + [...line.text].length + (index === 0 ? 0 : 1), 0);
}

function lineAtOffset(offset: number, lineStarts: number[], firstLine: number): number {
  let line = 0;
  for (let index = 1; index < lineStarts.length; index += 1) {
    if (lineStarts[index]! > offset) break;
    line = index;
  }
  return firstLine + line;
}

function makeSearchBody(body: string): string {
  const normalized = body.normalize("NFKC");
  return uniqueSearchTerms(normalized).join(" ") || normalized.toLowerCase().trim();
}

function assertChunkOptions(max: number, overlap: number): void {
  if (!Number.isInteger(max) || max <= 0) throw new RangeError("maxCodePoints must be a positive integer");
  if (!Number.isInteger(overlap) || overlap < 0 || overlap >= max) {
    throw new RangeError("overlapCodePoints must be an integer smaller than maxCodePoints");
  }
}
