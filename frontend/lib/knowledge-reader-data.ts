import { apiFetch, type Fetcher } from "./api";
import { createAsyncOwner } from "./async-owner";

export interface KnowledgeRevision {
  id: string;
  knowledgeItemId: string;
  title?: string;
  markdown: string;
  publishedAt?: string;
  isCurrent: boolean;
  visibility?: string;
  chunks: readonly { id: string; text: string; citationId?: string; headingPath: readonly string[] }[];
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
    visibility: typeof record.visibility === "string" ? record.visibility : undefined,
    chunks,
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
