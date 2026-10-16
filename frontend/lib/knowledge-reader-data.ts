import { apiFetch, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";
import { loadGraphCitation } from "./graph-evidence";
import { clearReaderVisitIntent, openReaderVisitIntent } from "./reader-visit-intent";

export interface KnowledgeRevision {
  selectedChunkId?: string;
  id: string;
  knowledgeItemId: string;
  title?: string;
  markdown: string;
  publishedAt?: string;
  isCurrent: boolean;
  previousRevisionId: string | null;
  sourceVersionId: string;
  sourceVersionOrdinal: number | null;
  parserSchemaVersion: string | null;
  indexStatus: "pending" | "indexed" | "search_degraded" | "failed";
  visibility?: string;
  chunks: readonly {
    id: string;
    ordinal: number;
    text: string;
    citationId?: string;
    headingPath: readonly string[];
    startLine: number;
    endLine: number;
    location?: KnowledgeSourceLocation;
  }[];
}

export type KnowledgeSourceLocation =
  | { kind: "pdf"; page: number | "unknown" }
  | { kind: "spreadsheet"; sheet: string; range: string }
  | { kind: "slide"; slide: number; elementStart: number; elementEnd: number };

export interface KnowledgeRevisionDiffLine {
  kind: "context" | "added" | "removed";
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface KnowledgeRevisionDiff {
  fromRevisionId: string;
  toRevisionId: string;
  changed: boolean;
  metadataChanges: readonly { field: string; from: unknown; to: unknown }[];
  stats: { added: number; removed: number; unchanged: number; truncated: boolean };
  hunks: readonly { oldStart: number; newStart: number; lines: readonly KnowledgeRevisionDiffLine[] }[];
}

export async function loadKnowledgeFavorite(knowledgeItemId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<boolean> {
  assertKnowledgeId(knowledgeItemId);
  const data = await apiFetch<unknown>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/favorite`, { requester, signal });
  if (!data || typeof data !== "object" || Array.isArray(data) || typeof (data as { favorite?: unknown }).favorite !== "boolean") throw new Error("KNOWLEDGE_FAVORITE_INVALID");
  return (data as { favorite: boolean }).favorite;
}

/** The server's frozen record of one favorite write, addressed by operation number. */
export interface KnowledgeFavoriteOperationReceipt {
  operationId: string;
  kind: "knowledge.favorite.add" | "knowledge.favorite.remove";
  knowledgeItemId: string;
  favorited: boolean;
  createdAt: string;
}

export interface KnowledgeFavoriteWriteReceipt {
  favorite: boolean;
  operation: KnowledgeFavoriteOperationReceipt;
}

const OPERATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/**
 * Sends the caller's frozen operation number. The server replays the original
 * receipt for a repeated number, so a lost response is resolved by that receipt
 * and never by resending a new write.
 */
export async function setKnowledgeFavorite(knowledgeItemId: string, favorite: boolean, operationId: string, requester: Fetcher = fetch): Promise<KnowledgeFavoriteWriteReceipt> {
  assertKnowledgeId(knowledgeItemId);
  assertOperationId(operationId);
  const expectedKind = favorite ? "knowledge.favorite.add" : "knowledge.favorite.remove";
  const data = await apiFetch<unknown>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/favorite`, {
    requester,
    method: favorite ? "PUT" : "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operationId }),
  });
  const record = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
  const operation = normalizeFavoriteOperation(record?.operation);
  if (!record || !operation || operation.operationId !== operationId || operation.knowledgeItemId !== knowledgeItemId
    || operation.kind !== expectedKind || operation.favorited !== favorite) {
    throw new Error("KNOWLEDGE_FAVORITE_INVALID");
  }
  // A replayed number may omit the live edge (a later operation removed it); the
  // recorded result above is what settles the write. A value that IS present must
  // still match, so a mismatched live edge is never accepted.
  if (record.favorite !== undefined) {
    const live = record.favorite;
    if (!live || typeof live !== "object" || Array.isArray(live) || (live as Record<string, unknown>).knowledgeItemId !== knowledgeItemId) {
      throw new Error("KNOWLEDGE_FAVORITE_INVALID");
    }
  }
  return { favorite: operation.favorited, operation };
}

/** Exact operation query: the recorded result, never a coincidental current state. */
export async function loadKnowledgeFavoriteOperation(operationId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<KnowledgeFavoriteOperationReceipt> {
  assertOperationId(operationId);
  const data = await apiFetch<{ operation?: unknown }>(
    `/api/knowledge/favorites/operations/${encodeURIComponent(operationId)}`,
    { requester, signal },
  );
  const operation = normalizeFavoriteOperation(data?.operation);
  if (!operation || operation.operationId !== operationId) throw new Error("KNOWLEDGE_FAVORITE_OPERATION_INVALID");
  return operation;
}

function normalizeFavoriteOperation(value: unknown): KnowledgeFavoriteOperationReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 5) return null;
  const { operationId, kind, knowledgeItemId, favorited, createdAt } = record;
  if (typeof operationId !== "string" || !OPERATION_ID.test(operationId)) return null;
  if (kind !== "knowledge.favorite.add" && kind !== "knowledge.favorite.remove") return null;
  if (typeof knowledgeItemId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(knowledgeItemId)) return null;
  if (typeof favorited !== "boolean" || typeof createdAt !== "string" || createdAt.length === 0) return null;
  return { operationId, kind, knowledgeItemId, favorited, createdAt };
}

function assertOperationId(operationId: string): void {
  if (!OPERATION_ID.test(operationId)) throw new Error("KNOWLEDGE_FAVORITE_OPERATION_INVALID");
}

export interface RelatedKnowledgeItem {
  id: string;
  title: string;
  publishedAt: string;
  reasonFields: readonly string[];
}

export interface KnowledgeBacklinkItem {
  id: string;
  revisionId: string;
  chunkId: string;
  title: string;
  publishedAt: string;
  startLine: number;
  endLine: number;
}

function normalizeRevision(value: unknown): KnowledgeRevision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id || typeof record.knowledgeItemId !== "string" || !record.knowledgeItemId) return null;
  if (typeof record.markdown !== "string" || !Array.isArray(record.chunks)) return null;
  const sourceVersionId = record.sourceVersionId;
  const indexStatus = record.indexStatus;
  if (typeof sourceVersionId !== "string" || sourceVersionId.length === 0) return null;
  if (indexStatus !== "pending" && indexStatus !== "indexed" && indexStatus !== "search_degraded" && indexStatus !== "failed") return null;
  if (typeof record.title !== "string" || typeof record.publishedAt !== "string" || record.publishedAt.length === 0 || typeof record.isCurrent !== "boolean") return null;
  const chunks = record.chunks.flatMap((chunk) => {
    if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) return [];
    const item = chunk as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.text !== "string") return [];
    const startLine = Number.isSafeInteger(item.startLine) && (item.startLine as number) >= 1 ? item.startLine as number : 1;
    const endLine = Number.isSafeInteger(item.endLine) && (item.endLine as number) >= startLine ? item.endLine as number : startLine;
    const location = normalizeSourceLocation(item.location);
    return [{
      id: item.id,
      ordinal: Number.isSafeInteger(item.ordinal) && (item.ordinal as number) >= 0 ? item.ordinal as number : 0,
      text: item.text,
      citationId: typeof item.citationId === "string" && item.citationId ? item.citationId : undefined,
      headingPath: Array.isArray(item.headingPath) ? item.headingPath.filter((heading): heading is string => typeof heading === "string") : [],
      startLine,
      endLine,
      ...(location ? { location } : {}),
    }];
  });
  return {
    id: record.id,
    knowledgeItemId: record.knowledgeItemId,
    title: record.title,
    markdown: record.markdown,
    publishedAt: record.publishedAt,
    isCurrent: record.isCurrent,
    previousRevisionId: typeof record.previousRevisionId === "string" && record.previousRevisionId ? record.previousRevisionId : null,
    sourceVersionId,
    sourceVersionOrdinal: Number.isSafeInteger(record.sourceVersionOrdinal) && (record.sourceVersionOrdinal as number) >= 0 ? record.sourceVersionOrdinal as number : null,
    parserSchemaVersion: typeof record.parserSchemaVersion === "string" && record.parserSchemaVersion ? record.parserSchemaVersion : null,
    indexStatus,
    visibility: typeof record.visibility === "string" ? record.visibility : undefined,
    chunks,
  };
}

function normalizeSourceLocation(value: unknown): KnowledgeSourceLocation | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind === "pdf" && (record.page === "unknown" || (Number.isSafeInteger(record.page) && (record.page as number) >= 1))) {
    return { kind: "pdf", page: record.page as number | "unknown" };
  }
  if (record.kind === "spreadsheet"
    && typeof record.sheet === "string" && record.sheet.length > 0 && record.sheet.length <= 120
    && typeof record.range === "string" && /^[A-Z]{1,3}[1-9][0-9]*:[A-Z]{1,3}[1-9][0-9]*$/u.test(record.range)) {
    return { kind: "spreadsheet", sheet: record.sheet, range: record.range };
  }
  if (record.kind === "slide"
    && Number.isSafeInteger(record.slide) && (record.slide as number) >= 1
    && Number.isSafeInteger(record.elementStart) && (record.elementStart as number) >= 1
    && Number.isSafeInteger(record.elementEnd) && (record.elementEnd as number) >= (record.elementStart as number)) {
    return { kind: "slide", slide: record.slide as number, elementStart: record.elementStart as number, elementEnd: record.elementEnd as number };
  }
  return undefined;
}

export async function loadKnowledgeRevisionDiff(
  knowledgeItemId: string,
  fromRevisionId: string,
  toRevisionId: string,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<KnowledgeRevisionDiff> {
  const validId = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
  if (!validId.test(knowledgeItemId) || !validId.test(fromRevisionId) || !validId.test(toRevisionId)) {
    throw new Error("KNOWLEDGE_DIFF_ID_INVALID");
  }
  const data = await apiFetch<{ diff?: unknown }>(
    `/api/knowledge/${encodeURIComponent(knowledgeItemId)}/revisions/${encodeURIComponent(fromRevisionId)}/diff/${encodeURIComponent(toRevisionId)}`,
    { requester, signal },
  );
  const diff = normalizeDiff(data.diff);
  if (!diff || diff.fromRevisionId !== fromRevisionId || diff.toRevisionId !== toRevisionId) throw new Error("KNOWLEDGE_DIFF_INVALID");
  return diff;
}

const RELATED_REASON_FIELDS = new Set(["title", "summary", "tags", "body", "code"]);

export async function loadRelatedKnowledge(
  knowledgeItemId: string,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<readonly RelatedKnowledgeItem[]> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(knowledgeItemId)) throw new Error("KNOWLEDGE_ID_INVALID");
  const data = await apiFetch<{ related?: unknown }>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/related`, { requester, signal });
  if (!data.related || typeof data.related !== "object" || Array.isArray(data.related)) throw new Error("KNOWLEDGE_RELATED_INVALID");
  const items = (data.related as Record<string, unknown>).items;
  if (!Array.isArray(items)) throw new Error("KNOWLEDGE_RELATED_INVALID");
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id || typeof record.title !== "string" || typeof record.publishedAt !== "string") return [];
    if (!Array.isArray(record.reasonFields) || !record.reasonFields.every((field): field is string => typeof field === "string" && RELATED_REASON_FIELDS.has(field))) throw new Error("KNOWLEDGE_RELATED_INVALID");
    const reasonFields = record.reasonFields.slice(0, 5);
    return [{ id: record.id, title: record.title, publishedAt: record.publishedAt, reasonFields }];
  }).slice(0, 5);
}

export async function loadKnowledgeBacklinks(
  knowledgeItemId: string,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<readonly KnowledgeBacklinkItem[]> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(knowledgeItemId)) throw new Error("KNOWLEDGE_ID_INVALID");
  const data = await apiFetch<{ backlinks?: unknown }>(
    "/api/knowledge/" + encodeURIComponent(knowledgeItemId) + "/backlinks",
    { requester, signal },
  );
  if (!data.backlinks || typeof data.backlinks !== "object" || Array.isArray(data.backlinks)) throw new Error("KNOWLEDGE_BACKLINKS_INVALID");
  const items = (data.backlinks as Record<string, unknown>).items;
  if (!Array.isArray(items)) throw new Error("KNOWLEDGE_BACKLINKS_INVALID");
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id
      || typeof record.revisionId !== "string" || !record.revisionId
      || typeof record.chunkId !== "string" || !record.chunkId
      || typeof record.title !== "string" || typeof record.publishedAt !== "string"
      || !Number.isSafeInteger(record.startLine) || (record.startLine as number) < 1
      || !Number.isSafeInteger(record.endLine) || (record.endLine as number) < (record.startLine as number)) return [];
    return [{
      id: record.id,
      revisionId: record.revisionId,
      chunkId: record.chunkId,
      title: record.title,
      publishedAt: record.publishedAt,
      startLine: record.startLine as number,
      endLine: record.endLine as number,
    }];
  }).slice(0, 50);
}

function normalizeDiff(value: unknown): KnowledgeRevisionDiff | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.fromRevisionId !== "string" || typeof record.toRevisionId !== "string" || !record.fromRevisionId || !record.toRevisionId) return null;
  const stats = record.stats;
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return null;
  const statsRecord = stats as Record<string, unknown>;
  const numbers = [statsRecord.added, statsRecord.removed, statsRecord.unchanged];
  if (!numbers.every((item) => Number.isSafeInteger(item) && (item as number) >= 0) || typeof statsRecord.truncated !== "boolean") return null;
  if (!Array.isArray(record.metadataChanges) || !Array.isArray(record.hunks)) return null;
  const metadataChanges = record.metadataChanges.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    return typeof candidate.field === "string" ? [{ field: candidate.field, from: candidate.from, to: candidate.to }] : [];
  });
  const hunks = record.hunks.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    if (!Number.isSafeInteger(candidate.oldStart) || !Number.isSafeInteger(candidate.newStart) || !Array.isArray(candidate.lines)) return [];
    const lines = candidate.lines.flatMap((line) => {
      if (!line || typeof line !== "object" || Array.isArray(line)) return [];
      const current = line as Record<string, unknown>;
      if (current.kind !== "context" && current.kind !== "added" && current.kind !== "removed") return [];
      if (typeof current.text !== "string") return [];
      const oldLine = current.oldLine === null ? null : Number.isSafeInteger(current.oldLine) ? current.oldLine as number : undefined;
      const newLine = current.newLine === null ? null : Number.isSafeInteger(current.newLine) ? current.newLine as number : undefined;
      return oldLine === undefined || newLine === undefined ? [] : [{ kind: current.kind as KnowledgeRevisionDiffLine["kind"], text: current.text, oldLine, newLine }];
    });
    return [{ oldStart: candidate.oldStart as number, newStart: candidate.newStart as number, lines }];
  });
  return {
    fromRevisionId: record.fromRevisionId,
    toRevisionId: record.toRevisionId,
    changed: record.changed === true,
    metadataChanges,
    stats: { added: statsRecord.added as number, removed: statsRecord.removed as number, unchanged: statsRecord.unchanged as number, truncated: statsRecord.truncated as boolean },
    hunks,
  };
}

export async function loadKnowledgeRevision(knowledgeItemId: string, requester: Fetcher = fetch, signal?: AbortSignal, citationHash = "", memberId = ""): Promise<KnowledgeRevision> {
  assertKnowledgeId(knowledgeItemId);
  if (citationHash && citationHash !== "#") {
    if (!citationHash.startsWith("#")) throw new Error("KNOWLEDGE_CITATION_INVALID");
    const citationId = decodeURIComponent(citationHash.slice(1));
    if (!citationId.trim() || citationId.length > 2048) throw new Error("KNOWLEDGE_CITATION_INVALID");
    const citation = await loadGraphCitation(citationId, requester, signal);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (citation.knowledgeItemId !== knowledgeItemId) throw new Error("KNOWLEDGE_CITATION_INVALID");
    assertKnowledgeId(citation.revisionId);
    const data = await apiFetch<{ revision?: unknown }>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}/revisions/${encodeURIComponent(citation.revisionId)}`, { requester, signal });
    const revision = normalizeRevision(data.revision);
    const chunk = revision?.chunks.find((item) => item.id === citation.chunkId);
    if (!revision || revision.knowledgeItemId !== knowledgeItemId || revision.id !== citation.revisionId
      || !chunk || chunk.citationId !== citationId || chunk.startLine !== citation.startLine || chunk.endLine !== citation.endLine) {
      throw new Error("KNOWLEDGE_CITATION_INVALID");
    }
    return { ...revision, selectedChunkId: chunk.id };
  }
  // One explicit identity per visit: a retried read reuses it and is not counted
  // twice, while a fresh visit invents a new one. It is cleared only after the
  // read that recorded it succeeds, so a lost response keeps the same identity.
  const visitIdentity = memberId === "" ? null : openReaderVisitIntent(memberId, knowledgeItemId);
  const data = await apiFetch<{ knowledge?: { currentRevision?: unknown } }>(
    `/api/knowledge/${encodeURIComponent(knowledgeItemId)}`,
    { requester, signal, ...(visitIdentity === null ? {} : { headers: { "x-visit-id": visitIdentity } }) },
  );
  if (visitIdentity !== null) clearReaderVisitIntent(memberId, knowledgeItemId, visitIdentity);
  const revision = normalizeRevision(data.knowledge?.currentRevision);
  if (!revision || revision.knowledgeItemId !== knowledgeItemId) throw new Error("KNOWLEDGE_REVISION_INVALID");
  return revision;
}

function assertKnowledgeId(knowledgeItemId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(knowledgeItemId)) throw new Error("KNOWLEDGE_ID_INVALID");
}

export function createKnowledgeReaderRequestController(memberId = "", requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return {
    request(knowledgeItemId: string, citationHash = "") {
      active?.abort();
      active = new AbortController();
      const generation = owner.claim();
      const promise = loadKnowledgeRevision(knowledgeItemId, requester, active.signal, citationHash, memberId).then((revision) => ({ generation, revision }));
      return { generation, promise };
    },
    isCurrent(generation: number) { return owner.isCurrent(generation); },
    cancel() { owner.invalidate(); active?.abort(); active = null; },
  };
}
