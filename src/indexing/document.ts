import type { ChunkDraft } from "../sources/chunker";

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
  const fields = buildIndexChunkFields(chunks);
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
  chunks: ReadonlyArray<ChunkDraft & { id?: string }>,
): IndexChunkFields[] {
  return chunks.map((chunk) => {
    const code = chunk.indexField === "code";
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
