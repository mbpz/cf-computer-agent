import { apiFetch, type Fetcher } from "./api";

/**
 * Administrator chunk maintenance for one published revision.
 *
 * Read-only reporting: the chunk list (`GET …/chunks`) and the rebuild report
 * (`GET …/chunks/rebuild-report`) describe what the index holds.
 * Mutating: `PATCH …/chunks/:chunkId/status` moves one chunk between `active`
 * (searchable) and `disabled` (kept, but excluded from retrieval).
 */
export type AdminChunkStatus = "active" | "disabled";

export interface AdminChunk {
  readonly id: string;
  readonly status: AdminChunkStatus;
  readonly ordinal: number;
  readonly headingPath: readonly string[];
  readonly startLine: number;
  readonly endLine: number;
  readonly body: string;
  readonly tokenEstimate: number;
}

export interface AdminChunkPage {
  readonly items: readonly AdminChunk[];
  readonly nextCursor: string | null;
}

export interface AdminChunkRebuildMapping {
  readonly ordinal: number;
  readonly expectedId: string;
  readonly existingId: string | null;
  readonly existingStatus: AdminChunkStatus | null;
}

export interface AdminChunkRebuildReport {
  readonly revisionId: string;
  readonly sourceVersionId: string;
  readonly chunkCount: number;
  readonly unchanged: boolean;
  readonly mappings: readonly AdminChunkRebuildMapping[];
}

function invalid(): Error {
  return new Error("ADMIN_CHUNK_RESPONSE_INVALID");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isStatus(value: unknown): value is AdminChunkStatus {
  return value === "active" || value === "disabled";
}

function headingPath(value: unknown): string[] {
  if (!Array.isArray(value)) throw invalid();
  const path: string[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== "string") throw invalid();
    path.push(entry);
  }
  return path;
}

function chunk(value: unknown): AdminChunk {
  const body = record(value);
  const id = text(body.id);
  const ordinal = count(body.ordinal);
  const startLine = count(body.startLine);
  const endLine = count(body.endLine);
  const tokenEstimate = count(body.tokenEstimate);
  if (!id || !isStatus(body.status) || ordinal === null || startLine === null || endLine === null
    || tokenEstimate === null || typeof body.body !== "string") {
    throw invalid();
  }
  return Object.freeze({
    id, status: body.status, ordinal, headingPath: headingPath(body.headingPath),
    startLine, endLine, body: body.body, tokenEstimate,
  });
}

export function adminChunkPage(value: unknown): AdminChunkPage {
  const body = record(value);
  if (!Array.isArray(body.items)) throw invalid();
  const items = (body.items as unknown[]).map(chunk);
  if (new Set(items.map((item) => item.id)).size !== items.length) throw invalid();
  const nextCursor = body.nextCursor === undefined || body.nextCursor === null ? null : text(body.nextCursor);
  if (body.nextCursor !== undefined && body.nextCursor !== null && nextCursor === null) throw invalid();
  return Object.freeze({ items: Object.freeze(items), nextCursor });
}

export function adminChunkRebuildReport(value: unknown): AdminChunkRebuildReport {
  const body = record(value);
  const revisionId = text(body.revisionId);
  const sourceVersionId = text(body.sourceVersionId);
  const chunkCount = count(body.chunkCount);
  if (!revisionId || !sourceVersionId || chunkCount === null || typeof body.unchanged !== "boolean" || !Array.isArray(body.mappings)) {
    throw invalid();
  }
  const mappings: AdminChunkRebuildMapping[] = [];
  for (const entry of body.mappings as unknown[]) {
    const mapping = record(entry);
    const ordinal = count(mapping.ordinal);
    const expectedId = text(mapping.expectedId);
    if (ordinal === null || !expectedId) throw invalid();
    const existingId = mapping.existingId === null ? null : text(mapping.existingId);
    const existingStatus = mapping.existingStatus === null ? null : mapping.existingStatus;
    if (mapping.existingId !== null && existingId === null) throw invalid();
    if (existingStatus !== null && !isStatus(existingStatus)) throw invalid();
    mappings.push(Object.freeze({ ordinal, expectedId, existingId, existingStatus }));
  }
  return Object.freeze({
    revisionId, sourceVersionId, chunkCount, unchanged: body.unchanged, mappings: Object.freeze(mappings),
  });
}

export async function loadRevisionChunks(input: {
  readonly knowledgeItemId: string;
  readonly revisionId: string;
  readonly limit: number;
  readonly cursor: string | null;
  readonly requester?: Fetcher;
  readonly signal?: AbortSignal;
}): Promise<AdminChunkPage> {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50) throw new Error("ADMIN_CHUNK_REQUEST_INVALID");
  const params = new URLSearchParams({ limit: String(input.limit) });
  if (input.cursor !== null && input.cursor.length > 0) params.set("cursor", input.cursor);
  return adminChunkPage(await apiFetch<unknown>(`/api/admin/knowledge/${encodeURIComponent(input.knowledgeItemId)}/revisions/${encodeURIComponent(input.revisionId)}/chunks?${params}`, {
    requester: input.requester ?? fetch,
    signal: input.signal,
  }));
}

export async function loadChunkRebuildReport(input: {
  readonly knowledgeItemId: string;
  readonly revisionId: string;
  readonly requester?: Fetcher;
  readonly signal?: AbortSignal;
}): Promise<AdminChunkRebuildReport> {
  return adminChunkRebuildReport(await apiFetch<unknown>(`/api/admin/knowledge/${encodeURIComponent(input.knowledgeItemId)}/revisions/${encodeURIComponent(input.revisionId)}/chunks/rebuild-report`, {
    requester: input.requester ?? fetch,
    signal: input.signal,
  }));
}

export async function setChunkIndexStatus(input: {
  readonly knowledgeItemId: string;
  readonly revisionId: string;
  readonly chunkId: string;
  readonly status: AdminChunkStatus;
  readonly requester?: Fetcher;
}): Promise<{ readonly id: string; readonly status: AdminChunkStatus }> {
  if (!isStatus(input.status)) throw new Error("ADMIN_CHUNK_REQUEST_INVALID");
  const payload = record(await apiFetch<unknown>(`/api/admin/knowledge/${encodeURIComponent(input.knowledgeItemId)}/revisions/${encodeURIComponent(input.revisionId)}/chunks/${encodeURIComponent(input.chunkId)}/status`, {
    requester: input.requester ?? fetch,
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: input.status }),
  }));
  const chunkState = record(payload.chunk);
  const id = text(chunkState.id);
  if (!id || !isStatus(chunkState.status)) throw invalid();
  return Object.freeze({ id, status: chunkState.status });
}
