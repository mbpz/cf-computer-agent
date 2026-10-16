import { apiFetch, type Fetcher } from "./api";
import { isCanonicalTimestamp } from "../components/review/review-detail-data";
import { prepareKnowledgeLifecycleOperation, validKnowledgeLifecycleOperation, type KnowledgeLifecycleOperation } from "./knowledge-lifecycle-intent";

export type SearchStatus = "pending" | "indexed" | "search_degraded" | "failed";
export type KnowledgeVisibility = "shared" | "admin_only";

export interface GovernedKnowledgeItem {
  readonly id: string;
  readonly spaceId: string;
  readonly collectionId: string | null;
  readonly revisionId: string;
  readonly title: string;
  readonly visibility: KnowledgeVisibility;
  readonly status: "active" | "trashed";
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly searchStatus: SearchStatus;
}

/**
 * The recycle bin's own retention facts, exactly as the purge path computes
 * them: `trashedAt` is the item's lifecycle timestamp (the anchor the server
 * compares), `purgeEligibleAt` is the deadline, and `purgeable` is the server's
 * own answer to its purge precondition.
 */
export interface TrashedKnowledgeRetention {
  readonly trashedAt: string;
  readonly purgeEligibleAt: string;
  readonly purgeable: boolean;
}

export interface TrashedKnowledgeItem extends Omit<GovernedKnowledgeItem, "status"> {
  readonly status: "trashed";
  readonly retention: TrashedKnowledgeRetention;
}

export interface TrashPage {
  readonly items: TrashedKnowledgeItem[];
  readonly nextCursor?: string;
}

export interface PurgeResult {
  readonly knowledgeItemId: string;
  readonly status: "purged";
  readonly purgedRevisionCount: number;
  readonly alreadyPurged?: boolean;
}

export interface LoadTrashPageInput {
  limit?: number;
  cursor?: string;
  requester?: Fetcher;
  signal?: AbortSignal;
}

const maxCursorLength = 512;
const retentionWindowMs = 30 * 24 * 60 * 60 * 1000;
const idPattern = /^[A-Za-z0-9_-]+$/u;
const visibilityValues: Record<KnowledgeVisibility, true> = { shared: true, admin_only: true };
const searchStatusValues: Record<SearchStatus, true> = { pending: true, indexed: true, search_degraded: true, failed: true };

function invalidResponse(): never {
  throw new Error("TRASH_RESPONSE_INVALID");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedId(value: unknown): string {
  if (typeof value !== "string" || !idPattern.test(value)) return invalidResponse();
  return value;
}

function isVisibility(value: unknown): value is KnowledgeVisibility {
  return typeof value === "string" && Object.hasOwn(visibilityValues, value);
}

function isSearchStatus(value: unknown): value is SearchStatus {
  return typeof value === "string" && Object.hasOwn(searchStatusValues, value);
}

function normalizeGovernedKnowledgeItem(value: unknown): GovernedKnowledgeItem {
  const record = asRecord(value);
  if (!record) return invalidResponse();
  const status = record.status;
  if (status !== "active" && status !== "trashed") return invalidResponse();
  if (!isVisibility(record.visibility) || !isSearchStatus(record.searchStatus)) return invalidResponse();
  if (!isCanonicalTimestamp(record.publishedAt) || !isCanonicalTimestamp(record.updatedAt)) return invalidResponse();
  return {
    id: boundedId(record.id),
    spaceId: boundedId(record.spaceId),
    collectionId: record.collectionId === null ? null : boundedId(record.collectionId),
    revisionId: boundedId(record.revisionId),
    title: typeof record.title === "string" && record.title.length <= 500 ? record.title : invalidResponse(),
    visibility: record.visibility,
    status,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    searchStatus: record.searchStatus,
  };
}

function normalizeRetention(value: unknown): TrashedKnowledgeRetention {
  const record = asRecord(value);
  if (!record) return invalidResponse();
  if (!isCanonicalTimestamp(record.trashedAt) || !isCanonicalTimestamp(record.purgeEligibleAt)) return invalidResponse();
  if (typeof record.purgeable !== "boolean") return invalidResponse();
  // The deadline is derived from the same constant the purge path enforces; a
  // deadline that does not match the anchor is a different policy, and a surface
  // that printed either half would state a window the server does not honour.
  const eligibleAt = new Date(Date.parse(record.trashedAt) + retentionWindowMs).toISOString();
  if (eligibleAt !== record.purgeEligibleAt) return invalidResponse();
  return { trashedAt: record.trashedAt, purgeEligibleAt: record.purgeEligibleAt, purgeable: record.purgeable };
}

function normalizeTrashedItem(value: unknown): TrashedKnowledgeItem {
  const base = normalizeGovernedKnowledgeItem(value);
  const record = asRecord(value);
  if (!record || base.status !== "trashed") return invalidResponse();
  return { ...base, status: "trashed", retention: normalizeRetention(record.retention) };
}

function normalizeTrashPage(value: unknown): TrashPage {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.items)) return invalidResponse();
  const items = record.items.map(normalizeTrashedItem);
  if (new Set(items.map((item) => item.id)).size !== items.length) return invalidResponse();
  const nextCursor = record.nextCursor;
  if (nextCursor === undefined) return { items };
  if (typeof nextCursor !== "string" || nextCursor.length === 0 || nextCursor.length > maxCursorLength) return invalidResponse();
  return { items, nextCursor };
}

function normalizePurgeResult(value: unknown, expectedId: string): PurgeResult {
  const record = asRecord(value);
  if (!record || record.status !== "purged") return invalidResponse();
  if (record.knowledgeItemId !== expectedId) return invalidResponse();
  const count = record.purgedRevisionCount;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return invalidResponse();
  if (record.alreadyPurged !== undefined && typeof record.alreadyPurged !== "boolean") return invalidResponse();
  return {
    knowledgeItemId: expectedId,
    status: "purged",
    purgedRevisionCount: count,
    ...(record.alreadyPurged === undefined ? {} : { alreadyPurged: record.alreadyPurged }),
  };
}

export async function loadTrashPage({ limit = 20, cursor, requester = fetch, signal }: LoadTrashPageInput = {}): Promise<TrashPage> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("TRASH_REQUEST_INVALID");
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.length === 0 || cursor.length > maxCursorLength)) {
    throw new Error("TRASH_REQUEST_INVALID");
  }
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined) params.set("cursor", cursor);
  return normalizeTrashPage(await apiFetch<unknown>(`/api/admin/knowledge/trash?${params}`, { requester, signal }));
}

export type TrashOperationOutcome =
  | { kind: "restored"; knowledge: GovernedKnowledgeItem }
  | { kind: "purged"; result: PurgeResult };

/**
 * Replays a frozen recycle-bin write. The stored `body` is sent verbatim, so a
 * retry after a lost response carries the same operation number and the same
 * typed confirmation the server recorded.
 */
export async function sendTrashOperation(operation: KnowledgeLifecycleOperation, requester: Fetcher = fetch): Promise<TrashOperationOutcome> {
  if (!validKnowledgeLifecycleOperation(operation) || (operation.action !== "restore" && operation.action !== "purge")) {
    throw new Error("TRASH_OPERATION_INVALID");
  }
  // The frozen operation stays the authority for the operation identity (the
  // body carries the operation number); the target is spelled as a literal per
  // action, from the knowledge item the record names, so the request target stays
  // statically visible to the repository's frontend-operation audit. Both must
  // name the same write.
  const path = operation.action === "restore"
    ? `/api/admin/knowledge/${encodeURIComponent(operation.id)}/restore`
    : `/api/admin/knowledge/${encodeURIComponent(operation.id)}/purge`;
  if (path !== operation.path) throw new Error("TRASH_OPERATION_INVALID");
  const payload = await apiFetch<unknown>(path, {
    requester, method: "POST", headers: { "content-type": "application/json" }, body: operation.body,
  });
  const record = asRecord(payload);
  if (operation.action === "restore") {
    const knowledge = normalizeGovernedKnowledgeItem(record?.knowledge);
    if (knowledge.id !== operation.id || knowledge.status !== "active") return invalidResponse();
    return { kind: "restored", knowledge };
  }
  return { kind: "purged", result: normalizePurgeResult(record?.purge, operation.id) };
}

export async function restoreTrashedKnowledge(knowledgeItemId: string, operationId?: string, requester: Fetcher = fetch): Promise<GovernedKnowledgeItem> {
  const operation = prepareKnowledgeLifecycleOperation(knowledgeItemId, "restore", {}, operationId);
  const outcome = await sendTrashOperation(operation, requester);
  if (outcome.kind !== "restored") throw new Error("TRASH_RESPONSE_INVALID");
  return outcome.knowledge;
}

export async function purgeTrashedKnowledge(
  { knowledgeItemId, operationId, confirm }: { knowledgeItemId: string; operationId?: string; confirm: string },
  requester: Fetcher = fetch,
): Promise<PurgeResult> {
  const operation = prepareKnowledgeLifecycleOperation(knowledgeItemId, "purge", { confirm }, operationId);
  const outcome = await sendTrashOperation(operation, requester);
  if (outcome.kind !== "purged") throw new Error("TRASH_RESPONSE_INVALID");
  return outcome.result;
}
