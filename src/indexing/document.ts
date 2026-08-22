import type { ChunkDraft } from "../sources/chunker";
import type { SubmissionKind } from "../submissions/types";

const MAX_TITLE_CODE_POINTS = 200;
const MAX_TITLE_BYTES = 512;
const MAX_SUMMARY_CODE_POINTS = 240;
const MAX_SUMMARY_BYTES = 1_024;
const MAX_TAGS_CODE_POINTS = 4_096;
const MAX_TAGS_BYTES = 16_384;
const MAX_BODY_CODE_POINTS = 131_072;
const MAX_BODY_BYTES = 131_072;

export interface IndexDocument {
  revisionId: string;
  title: string;
  summary: string;
  tags: string;
  body: string;
  code: string;
}

export interface IndexRevisionSource {
  id: string;
  title: string;
  kind: SubmissionKind;
  content: string;
}

export interface IndexTag {
  id: string;
  slug: string;
  name: string;
}

export interface IndexChunkFields {
  chunkId: string;
  body: string;
  code: string;
}

export function buildIndexDocument(
  revision: IndexRevisionSource,
  chunks: ReadonlyArray<ChunkDraft & { id?: string }>,
  tags: readonly IndexTag[],
): IndexDocument {
  const fields = buildIndexChunkFields(revision, chunks);
  const proseSummary = chunks
    .filter((_chunk, index) => fields[index]?.code.length === 0)
    .map((chunk) => chunk.body)
    .join(" ")
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
  return {
    revisionId: revision.id,
    title: boundText(normalizeText(revision.title), MAX_TITLE_CODE_POINTS, MAX_TITLE_BYTES),
    summary: boundText(proseSummary, MAX_SUMMARY_CODE_POINTS, MAX_SUMMARY_BYTES),
    tags: boundText(normalizeTags(tags), MAX_TAGS_CODE_POINTS, MAX_TAGS_BYTES),
    body: boundText(fields.map((field) => field.body).filter(Boolean).join(" "), MAX_BODY_CODE_POINTS, MAX_BODY_BYTES),
    code: boundText(fields.map((field) => field.code).filter(Boolean).join(" "), MAX_BODY_CODE_POINTS, MAX_BODY_BYTES),
  };
}

export function buildIndexChunkFields(
  revision: Pick<IndexRevisionSource, "kind" | "content">,
  chunks: ReadonlyArray<ChunkDraft & { id?: string }>,
): IndexChunkFields[] {
  const codeLines = revision.kind === "code" ? null : fencedCodeLines(revision.content);
  return chunks.map((chunk) => {
    const code = revision.kind === "code" || isCodeChunk(chunk, codeLines);
    const searchText = boundText(normalizeText(chunk.searchBody), MAX_BODY_CODE_POINTS, MAX_BODY_BYTES);
    return {
      chunkId: chunk.id ?? `${chunk.ordinal}`,
      body: code ? "" : searchText,
      code: code ? searchText : "",
    };
  });
}

function normalizeTags(tags: readonly IndexTag[]): string {
  const unique = new Map<string, IndexTag>();
  for (const tag of tags) {
    const id = normalizeText(tag.id);
    if (id && !unique.has(id)) unique.set(id, tag);
  }
  return [...unique.values()]
    .map((tag) => `${normalizeText(tag.slug).toLocaleLowerCase("en-US")} ${normalizeText(tag.name)}`.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "en-US"))
    .join(" ");
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim();
}

function boundText(value: string, maxCodePoints: number, maxBytes: number): string {
  const points = [...value];
  let low = 0;
  let high = Math.min(points.length, maxCodePoints);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (new TextEncoder().encode(points.slice(0, middle).join("")).byteLength <= maxBytes) low = middle;
    else high = middle - 1;
  }
  return points.slice(0, low).join("");
}

function isCodeChunk(chunk: Pick<ChunkDraft, "startLine" | "endLine">, codeLines: ReadonlySet<number> | null): boolean {
  if (codeLines === null) return true;
  for (let line = chunk.startLine; line <= chunk.endLine; line += 1) {
    if (!codeLines.has(line)) return false;
  }
  return true;
}

function fencedCodeLines(markdown: string): Set<number> {
  const lines = markdown.endsWith("\n") ? markdown.slice(0, -1).split("\n") : markdown.split("\n");
  const result = new Set<number>();
  let open: { marker: "`" | "~"; length: number } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index]!;
    if (open === null) {
      open = fenceStart(line);
      if (open !== null) result.add(lineNumber);
      continue;
    }
    result.add(lineNumber);
    if (fenceEnd(line, open)) open = null;
  }
  return result;
}

function fenceStart(line: string): { marker: "`" | "~"; length: number } | null {
  let offset = 0;
  while (offset < line.length && line[offset] === " " && offset < 4) offset += 1;
  if (offset > 3) return null;
  const marker = line[offset];
  if (marker !== "`" && marker !== "~") return null;
  let end = offset;
  while (line[end] === marker) end += 1;
  if (end - offset < 3) return null;
  const remainder = line.slice(end);
  if (remainder.includes(marker === "`" ? "`" : "~")) return null;
  return { marker, length: end - offset };
}

function fenceEnd(line: string, fence: { marker: "`" | "~"; length: number }): boolean {
  let offset = 0;
  while (offset < line.length && line[offset] === " " && offset < 4) offset += 1;
  if (offset > 3) return false;
  let end = offset;
  while (line[end] === fence.marker) end += 1;
  return end - offset >= fence.length && line.slice(end).trim().length === 0;
}
