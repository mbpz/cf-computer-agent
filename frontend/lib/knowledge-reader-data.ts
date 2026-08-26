import { apiFetch, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";

export interface KnowledgeRevision {
  id: string;
  knowledgeItemId: string;
  title?: string;
  markdown: string;
  publishedAt?: string;
  isCurrent: boolean;
  previousRevisionId: string | null;
  visibility?: string;
  chunks: readonly { id: string; text: string; citationId?: string; headingPath: readonly string[] }[];
}

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

function normalizeRevision(value: unknown): KnowledgeRevision | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id || typeof record.knowledgeItemId !== "string" || !record.knowledgeItemId) return null;
  if (typeof record.markdown !== "string") return null;
  const chunks = Array.isArray(record.chunks) ? record.chunks.flatMap((chunk) => {
    if (!chunk || typeof chunk !== "object" || Array.isArray(chunk)) return [];
    const item = chunk as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.text !== "string") return [];
    return [{
      id: item.id,
      text: item.text,
      citationId: typeof item.citationId === "string" && item.citationId ? item.citationId : undefined,
      headingPath: Array.isArray(item.headingPath) ? item.headingPath.filter((heading): heading is string => typeof heading === "string") : [],
    }];
  }) : [];
  return {
    id: record.id,
    knowledgeItemId: record.knowledgeItemId,
    title: typeof record.title === "string" ? record.title : undefined,
    markdown: record.markdown,
    publishedAt: typeof record.publishedAt === "string" ? record.publishedAt : undefined,
    isCurrent: record.isCurrent === true,
    previousRevisionId: typeof record.previousRevisionId === "string" && record.previousRevisionId ? record.previousRevisionId : null,
    visibility: typeof record.visibility === "string" ? record.visibility : undefined,
    chunks,
  };
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
  if (!diff) throw new Error("KNOWLEDGE_DIFF_INVALID");
  return diff;
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

export async function loadKnowledgeRevision(knowledgeItemId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<KnowledgeRevision> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(knowledgeItemId)) throw new Error("KNOWLEDGE_ID_INVALID");
  const data = await apiFetch<{ knowledge?: { currentRevision?: unknown } }>(`/api/knowledge/${encodeURIComponent(knowledgeItemId)}`, { requester, signal });
  const revision = normalizeRevision(data.knowledge?.currentRevision);
  if (!revision) throw new Error("KNOWLEDGE_REVISION_INVALID");
  return revision;
}

export function createKnowledgeReaderRequestController(requester: Fetcher = fetch) {
  let active: AbortController | null = null;
  const owner = createAsyncOwner();
  return {
    request(knowledgeItemId: string) {
      active?.abort();
      active = new AbortController();
      const generation = owner.claim();
      const promise = loadKnowledgeRevision(knowledgeItemId, requester, active.signal).then((revision) => ({ generation, revision }));
      return { generation, promise };
    },
    isCurrent(generation: number) { return owner.isCurrent(generation); },
    cancel() { owner.invalidate(); active?.abort(); active = null; },
  };
}
