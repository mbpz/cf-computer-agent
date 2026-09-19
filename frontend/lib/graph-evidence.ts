import { apiFetch, type Fetcher } from "./api";

export interface GraphCitationLocation {
  kind: string;
  page?: number | "unknown";
  sheet?: string;
  range?: string;
  slide?: number;
  elementStart?: number;
  elementEnd?: number;
}

export interface GraphCitation {
  citationId: string;
  knowledgeItemId: string;
  title: string;
  revisionId: string;
  chunkId: string;
  headingPath: string[];
  startLine: number;
  endLine: number;
  location?: GraphCitationLocation;
}

export async function loadGraphCitation(citationId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<GraphCitation> {
  if (!isNonEmptyString(citationId)) throw new Error("GRAPH_CITATION_INVALID");
  const encoded = encodeURIComponent(citationId);
  const value = await apiFetch<unknown>(`/api/knowledge/citations/${encoded}`, { requester, signal });
  return normalizeGraphCitation(value, citationId);
}

export function normalizeGraphCitation(value: unknown, fallbackCitationId?: string): GraphCitation {
  if (!isRecord(value)) throw new Error("GRAPH_CITATION_INVALID");
  const candidate = isRecord(value.citation) ? value.citation : value;
  const citationId = fallbackCitationId || (typeof candidate.citationId === "string" && candidate.citationId ? candidate.citationId : undefined);
  if (!citationId
    || !isNonEmptyString(candidate.knowledgeItemId)
    || !isNonEmptyString(candidate.title)
    || !isNonEmptyString(candidate.revisionId)
    || !isNonEmptyString(candidate.chunkId)
    || !Array.isArray(candidate.headingPath)
    || !candidate.headingPath.every((part) => typeof part === "string")
    || !isLine(candidate.startLine)
    || !isLine(candidate.endLine)
    || candidate.endLine < candidate.startLine) {
    throw new Error("GRAPH_CITATION_INVALID");
  }
  const location = normalizeLocation(candidate.location);
  return {
    citationId,
    knowledgeItemId: candidate.knowledgeItemId,
    title: candidate.title,
    revisionId: candidate.revisionId,
    chunkId: candidate.chunkId,
    headingPath: [...candidate.headingPath],
    startLine: candidate.startLine,
    endLine: candidate.endLine,
    ...(location ? { location } : {}),
  };
}

function normalizeLocation(value: unknown): GraphCitationLocation | undefined {
  if (!isRecord(value) || typeof value.kind !== "string" || !value.kind) return undefined;
  const location: GraphCitationLocation = { kind: value.kind };
  if (value.page === "unknown" || isLine(value.page)) location.page = value.page;
  if (typeof value.sheet === "string") location.sheet = value.sheet;
  if (typeof value.range === "string") location.range = value.range;
  if (isLine(value.slide)) location.slide = value.slide;
  if (isLine(value.elementStart)) location.elementStart = value.elementStart;
  if (isLine(value.elementEnd)) location.elementEnd = value.elementEnd;
  return location;
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isLine(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
