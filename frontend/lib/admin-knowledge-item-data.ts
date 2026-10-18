import { ApiRequestError, apiFetch, type Fetcher } from "./api";
import { isCanonicalTimestamp } from "../components/review/review-detail-data";
import { prepareKnowledgeLifecycleOperation, validKnowledgeLifecycleOperation, type KnowledgeLifecycleOperation } from "./knowledge-lifecycle-intent";

export type KnowledgeVisibility = "shared" | "admin_only";

/**
 * The one revision the admin read can name. There is no endpoint that lists an
 * item's revisions, so `previousRevisionId` is the only earlier revision the
 * server can point at (and it is null when the item has none).
 */
export interface KnowledgeItemRevision {
  readonly id: string;
  readonly title: string;
  readonly visibility: KnowledgeVisibility;
  readonly publishedAt: string;
  readonly isCurrent: true;
  readonly previousRevisionId: string | null;
  readonly indexStatus: string;
}

export interface AdminKnowledgeItem {
  readonly id: string;
  readonly spaceId: string;
  readonly collectionId: string | null;
  readonly title: string;
  readonly tagIds: readonly string[];
  readonly visibility: KnowledgeVisibility;
  readonly searchStatus: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly status: "active" | "trashed";
  readonly currentRevision: KnowledgeItemRevision;
}

/** The governed item a lifecycle write returns. */
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
  readonly searchStatus: string;
}

/** The revision a rollback left current. */
export interface RollbackRevision {
  readonly id: string;
  readonly knowledgeItemId: string;
  readonly sourceVersionId: string | null;
  readonly title: string;
  readonly tagIds: readonly string[];
  readonly visibility: KnowledgeVisibility;
  /** The publishing principal, when the server names it as a plain id. */
  readonly publishedBy: string | null;
  readonly publishedAt: string;
  readonly searchStatus: string;
}

export interface RollbackReceipt {
  /** The revision that is now current (the one that was rolled back to). */
  readonly revision: RollbackRevision;
  /** The revision that was current before and is now replaced. */
  readonly previousRevisionId: string;
}

/**
 * A write's failure, placed by the server code it carries. `unknown-outcome` is
 * the only retryable kind: the write may have committed, so the page offers a
 * retry of the SAME operation number rather than a fresh one.
 */
export type KnowledgeItemWriteOutcome =
  | { readonly kind: "target-invalid"; readonly code: string }
  | { readonly kind: "state-conflict"; readonly code: string }
  | { readonly kind: "operation-conflict"; readonly code: string }
  | { readonly kind: "refused"; readonly code: string }
  | { readonly kind: "unknown-outcome"; readonly code: string };

export class KnowledgeItemWriteError extends Error {
  readonly name = "KnowledgeItemWriteError";
  constructor(readonly outcome: KnowledgeItemWriteOutcome, message: string) { super(message); }
}

export type KnowledgeLifecycleSendResult =
  | { readonly kind: "trash"; readonly knowledge: GovernedKnowledgeItem }
  | { readonly kind: "rollback"; readonly receipt: RollbackReceipt };

/** One row of the item's revision history: identity and publication facts only. */
export interface KnowledgeRevisionSummary {
  readonly id: string;
  readonly title: string;
  readonly visibility: KnowledgeVisibility;
  readonly publishedAt: string;
  readonly isCurrent: boolean;
}

/** What an authoritative readback found for a stored operation number. */
export type KnowledgeLifecycleResolution =
  | { readonly kind: "rollback"; readonly receipt: RollbackReceipt }
  | { readonly kind: "trash"; readonly knowledge: GovernedKnowledgeItem };

const idPattern = /^[A-Za-z0-9_-]+$/u;
const operationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmptyId(value: unknown): string | null {
  return typeof value === "string" && idPattern.test(value) ? value : null;
}

function visibility(value: unknown): KnowledgeVisibility | null {
  return value === "shared" || value === "admin_only" ? value : null;
}

function idList(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string") ? [...value] : null;
}

/** Null for anything that is not exactly the shape the server defines. */
export function normalizeKnowledgeItemRevision(value: unknown): KnowledgeItemRevision | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = nonEmptyId(record.id);
  const knowledgeItemId = nonEmptyId(record.knowledgeItemId);
  const view = visibility(record.visibility);
  const indexStatus = typeof record.indexStatus === "string" && record.indexStatus.length > 0 ? record.indexStatus : null;
  if (!id || !knowledgeItemId || typeof record.title !== "string" || !view || !indexStatus) return null;
  if (record.isCurrent !== true) return null;
  if (!isCanonicalTimestamp(record.publishedAt)) return null;
  const previousRevisionId = record.previousRevisionId === null ? null : nonEmptyId(record.previousRevisionId);
  if (record.previousRevisionId !== null && previousRevisionId === null) return null;
  return { id, title: record.title, visibility: view, publishedAt: record.publishedAt, isCurrent: true, previousRevisionId, indexStatus };
}

export function normalizeAdminKnowledgeItem(value: unknown): AdminKnowledgeItem | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = nonEmptyId(record.id);
  const spaceId = nonEmptyId(record.spaceId);
  const view = visibility(record.visibility);
  const tags = idList(record.tagIds);
  const searchStatus = typeof record.searchStatus === "string" && record.searchStatus.length > 0 ? record.searchStatus : null;
  const rawCollection = record.collectionId;
  const collectionId = rawCollection === null ? null : (typeof rawCollection === "string" && rawCollection.length > 0 ? rawCollection : undefined);
  const status = record.status === "active" || record.status === "trashed" ? record.status : null;
  if (!id || !spaceId || typeof record.title !== "string" || !view || !tags || !searchStatus || !status || collectionId === undefined) return null;
  if (!isCanonicalTimestamp(record.publishedAt) || !isCanonicalTimestamp(record.updatedAt)) return null;
  const revisionRecord = asRecord(record.currentRevision);
  const revision = normalizeKnowledgeItemRevision(record.currentRevision);
  // `isCurrent` and the revision's own item id are the server's own claims about
  // which revision this item is on; a mismatch means the read cannot be trusted.
  if (!revision || !revisionRecord || revisionRecord.knowledgeItemId !== id) return null;
  return { id, spaceId, collectionId, title: record.title, tagIds: tags, visibility: view, searchStatus, publishedAt: record.publishedAt, updatedAt: record.updatedAt, status, currentRevision: revision };
}

export async function loadAdminKnowledgeItem(knowledgeItemId: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<AdminKnowledgeItem> {
  if (!idPattern.test(knowledgeItemId)) throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
  const payload = await apiFetch<unknown>(`/api/admin/knowledge/${encodeURIComponent(knowledgeItemId)}`, { requester, signal });
  const item = normalizeAdminKnowledgeItem(asRecord(payload)?.knowledge);
  if (!item || item.id !== knowledgeItemId) throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
  return item;
}

export function normalizeKnowledgeRevisionSummary(value: unknown): KnowledgeRevisionSummary | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = nonEmptyId(record.id);
  const view = visibility(record.visibility);
  if (!id || typeof record.title !== "string" || !view) return null;
  if (typeof record.isCurrent !== "boolean" || !isCanonicalTimestamp(record.publishedAt)) return null;
  return { id, title: record.title, visibility: view, publishedAt: record.publishedAt, isCurrent: record.isCurrent };
}

/** One page of revision history; `nextCursor` continues older rows. */
export interface KnowledgeRevisionHistory {
  readonly revisions: readonly KnowledgeRevisionSummary[];
  readonly nextCursor?: string;
}

/**
 * The bounded revision history the rollback selector names. Null means the
 * server answered with something other than a 1–50 row list of unique rows, so
 * the page can refuse to offer a target it could not verify.
 */
export async function loadAdminKnowledgeRevisions(
  knowledgeItemId: string,
  cursor?: string,
  requester: Fetcher = fetch,
  signal?: AbortSignal,
): Promise<KnowledgeRevisionHistory | null> {
  if (!idPattern.test(knowledgeItemId)) throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
  if (cursor !== undefined && !/^[A-Za-z0-9_-]{1,512}$/u.test(cursor)) throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
  const query = cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`;
  const payload = await apiFetch<unknown>(`/api/admin/knowledge/${encodeURIComponent(knowledgeItemId)}/revisions${query}`, { requester, signal });
  const record = asRecord(payload);
  const rows = record?.revisions;
  if (!record || !Array.isArray(rows) || rows.length < 1 || rows.length > 50) return null;
  const revisions = rows.map(normalizeKnowledgeRevisionSummary);
  if (revisions.some((revision) => revision === null)) return null;
  const ids = new Set(revisions.map((revision) => revision!.id));
  if (ids.size !== revisions.length) return null;
  const nextCursor = record.nextCursor;
  if (nextCursor !== undefined && (typeof nextCursor !== "string" || !/^[A-Za-z0-9_-]{1,512}$/u.test(nextCursor))) return null;
  return {
    revisions: revisions as KnowledgeRevisionSummary[],
    ...(typeof nextCursor === "string" ? { nextCursor } : {}),
  };
}

/**
 * Reads back the recorded answer for one stored operation after an unknown
 * outcome. Null means the server holds no receipt for it yet, so the only safe
 * next step is replaying the same operation number.
 */
export async function loadKnowledgeLifecycleResolution(
  knowledgeItemId: string,
  operationId: string,
  requester: Fetcher = fetch,
): Promise<KnowledgeLifecycleResolution | null> {
  if (!idPattern.test(knowledgeItemId) || !operationIdPattern.test(operationId)) throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
  const payload = await apiFetch<unknown>(`/api/admin/knowledge/${encodeURIComponent(knowledgeItemId)}/operations/${encodeURIComponent(operationId)}`, { requester });
  const record = asRecord(payload);
  if (!record || !Object.hasOwn(record, "operation")) throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
  if (record.operation === null) return null;
  const operation = asRecord(record.operation);
  if (!operation) throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
  if (operation.kind === "knowledge.rollback") {
    const response = asRecord(operation.response);
    const previousRevisionId = response ? nonEmptyId(response.previousRevisionId) : null;
    if (!response || !previousRevisionId) throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
    const receipt = normalizeRollbackReceipt({ revision: response, previousRevisionId });
    if (!receipt || receipt.revision.knowledgeItemId !== knowledgeItemId) throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
    return { kind: "rollback", receipt };
  }
  if (operation.kind === "knowledge.trash") {
    const knowledge = normalizeGovernedKnowledgeItem(operation.response);
    if (!knowledge || knowledge.id !== knowledgeItemId || knowledge.status !== "trashed") throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
    return { kind: "trash", knowledge };
  }
  throw new Error("KNOWLEDGE_ITEM_RESPONSE_INVALID");
}

export function normalizeGovernedKnowledgeItem(value: unknown): GovernedKnowledgeItem | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = nonEmptyId(record.id);
  const spaceId = nonEmptyId(record.spaceId);
  const revisionId = nonEmptyId(record.revisionId);
  const view = visibility(record.visibility);
  const status = record.status === "active" || record.status === "trashed" ? record.status : null;
  const searchStatus = typeof record.searchStatus === "string" && record.searchStatus.length > 0 ? record.searchStatus : null;
  const rawCollection = record.collectionId;
  const collectionId = rawCollection === null ? null : (typeof rawCollection === "string" && rawCollection.length > 0 ? rawCollection : undefined);
  if (!id || !spaceId || !revisionId || typeof record.title !== "string" || !view || !status || !searchStatus || collectionId === undefined) return null;
  if (!isCanonicalTimestamp(record.publishedAt) || !isCanonicalTimestamp(record.updatedAt)) return null;
  return { id, spaceId, collectionId, revisionId, title: record.title, visibility: view, status, publishedAt: record.publishedAt, updatedAt: record.updatedAt, searchStatus };
}

export function normalizeRollbackReceipt(value: unknown): RollbackReceipt | null {
  const record = asRecord(value);
  if (!record) return null;
  const previousRevisionId = nonEmptyId(record.previousRevisionId);
  const revisionRecord = asRecord(record.revision);
  if (!previousRevisionId || !revisionRecord) return null;
  const id = nonEmptyId(revisionRecord.id);
  const knowledgeItemId = nonEmptyId(revisionRecord.knowledgeItemId);
  const view = visibility(revisionRecord.visibility);
  const tags = idList(revisionRecord.tagIds);
  const sourceVersionId = revisionRecord.sourceVersionId === null || revisionRecord.sourceVersionId === undefined ? null : nonEmptyId(revisionRecord.sourceVersionId);
  const searchStatus = typeof revisionRecord.searchStatus === "string" && revisionRecord.searchStatus.length > 0 ? revisionRecord.searchStatus : null;
  if (!id || !knowledgeItemId || typeof revisionRecord.title !== "string" || !view || !tags || !searchStatus) return null;
  const publishedBy = typeof revisionRecord.publishedBy === "string" && revisionRecord.publishedBy.length > 0 ? revisionRecord.publishedBy : null;
  if (revisionRecord.sourceVersionId !== null && revisionRecord.sourceVersionId !== undefined && sourceVersionId === null) return null;
  if (!isCanonicalTimestamp(revisionRecord.publishedAt)) return null;
  // The replacement is only meaningful if it names a different revision than the
  // one it replaced; the server, not the page, is the source of both numbers.
  if (previousRevisionId === id) return null;
  const declaredPrevious = revisionRecord.previousRevisionId;
  if (declaredPrevious !== undefined && declaredPrevious !== null && declaredPrevious !== previousRevisionId) return null;
  return {
    revision: { id, knowledgeItemId, sourceVersionId, title: revisionRecord.title, tagIds: tags, visibility: view, publishedBy, publishedAt: revisionRecord.publishedAt, searchStatus },
    previousRevisionId,
  };
}

/** Places a failed write by the code the server answered with. */
export function knowledgeItemWriteOutcome(error: unknown): KnowledgeItemWriteOutcome {
  if (error instanceof KnowledgeItemWriteError) return error.outcome;
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case "KNOWLEDGE_OPERATION_CONFLICT": return { kind: "operation-conflict", code: error.code };
      case "ROLLBACK_STATE_CONFLICT":
      case "KNOWLEDGE_LIFECYCLE_CONFLICT": return { kind: "state-conflict", code: error.code };
      case "ROLLBACK_TARGET_INVALID":
      case "KNOWLEDGE_LIFECYCLE_TARGET_INVALID": return { kind: "target-invalid", code: error.code };
      default: break;
    }
    // A retryable transport-shaped failure carries no answer; anything else the
    // server refused is a refusal the human must act on, not a retry.
    if (error.retryable || error.status >= 500) return { kind: "unknown-outcome", code: error.code };
    return { kind: "refused", code: error.code };
  }
  // A record we could not build is never sent, so it cannot have committed.
  if (error instanceof Error && (error.message === "KNOWLEDGE_LIFECYCLE_REQUEST_INVALID" || error.message === "KNOWLEDGE_LIFECYCLE_OPERATION_INVALID")) {
    return { kind: "refused", code: error.message };
  }
  if (error instanceof Error && /^[A-Z][A-Z0-9_]*$/u.test(error.message)) return { kind: "unknown-outcome", code: error.message };
  return { kind: "unknown-outcome", code: "KNOWLEDGE_LIFECYCLE_UNCERTAIN" };
}

/**
 * Sends a frozen operation exactly as it was recorded. A retry must come through
 * here with the stored operation, so the server replays its recorded result
 * instead of performing the write twice.
 */
export async function sendKnowledgeLifecycleOperation(operation: KnowledgeLifecycleOperation, requester: Fetcher = fetch): Promise<KnowledgeLifecycleSendResult> {
  if (!validKnowledgeLifecycleOperation(operation) || (operation.action !== "trash" && operation.action !== "rollback")) throw new Error("KNOWLEDGE_LIFECYCLE_OPERATION_INVALID");
  // The frozen operation stays the authority for the operation identity (the body
  // carries the operation number); each action keeps its own literal request so the
  // target and method stay statically visible to the repository's frontend-operation
  // audit instead of collapsing into a variable.
  const path = operation.action === "trash"
    ? `/api/admin/knowledge/${encodeURIComponent(operation.id)}/trash`
    : `/api/admin/knowledge/${encodeURIComponent(operation.id)}/rollback`;
  if (path !== operation.path) throw new Error("KNOWLEDGE_LIFECYCLE_OPERATION_INVALID");
  let payload: unknown;
  try {
    payload = operation.action === "trash"
      ? await apiFetch<unknown>(`/api/admin/knowledge/${encodeURIComponent(operation.id)}/trash`, {
        requester, method: "POST", headers: { "content-type": "application/json" }, body: operation.body,
      })
      : await apiFetch<unknown>(`/api/admin/knowledge/${encodeURIComponent(operation.id)}/rollback`, {
        requester, method: "POST", headers: { "content-type": "application/json" }, body: operation.body,
      });
  } catch (error: unknown) {
    throw new KnowledgeItemWriteError(knowledgeItemWriteOutcome(error), error instanceof Error ? error.message : "KNOWLEDGE_LIFECYCLE_WRITE_FAILED");
  }
  if (operation.action === "trash") {
    const knowledge = normalizeGovernedKnowledgeItem(asRecord(payload)?.knowledge);
    // The server answered that it trashed the item; a receipt that says otherwise
    // leaves the outcome genuinely unknown rather than good-enough.
    if (!knowledge || knowledge.status !== "trashed") throw new KnowledgeItemWriteError({ kind: "unknown-outcome", code: "KNOWLEDGE_ITEM_RESPONSE_INVALID" }, "KNOWLEDGE_ITEM_RESPONSE_INVALID");
    return { kind: "trash", knowledge };
  }
  const receipt = normalizeRollbackReceipt(payload);
  if (!receipt) throw new KnowledgeItemWriteError({ kind: "unknown-outcome", code: "KNOWLEDGE_ITEM_RESPONSE_INVALID" }, "KNOWLEDGE_ITEM_RESPONSE_INVALID");
  return { kind: "rollback", receipt };
}

export async function trashKnowledgeItem(knowledgeItemId: string, operationId: string, requester: Fetcher = fetch): Promise<GovernedKnowledgeItem> {
  const operation = prepareKnowledgeLifecycleOperation(knowledgeItemId, "trash", {}, operationId);
  const result = await sendKnowledgeLifecycleOperation(operation, requester);
  if (result.kind !== "trash") throw new Error("KNOWLEDGE_LIFECYCLE_OPERATION_INVALID");
  const knowledge = result.knowledge;
  if (knowledge.id !== knowledgeItemId) throw new KnowledgeItemWriteError({ kind: "unknown-outcome", code: "KNOWLEDGE_ITEM_RESPONSE_INVALID" }, "KNOWLEDGE_ITEM_RESPONSE_INVALID");
  return knowledge;
}

export async function rollbackKnowledgeItem(input: { knowledgeItemId: string; revisionId: string; operationId: string }, requester: Fetcher = fetch): Promise<RollbackReceipt> {
  const operation = prepareKnowledgeLifecycleOperation(input.knowledgeItemId, "rollback", { revisionId: input.revisionId }, input.operationId);
  const result = await sendKnowledgeLifecycleOperation(operation, requester);
  if (result.kind !== "rollback") throw new Error("KNOWLEDGE_LIFECYCLE_OPERATION_INVALID");
  const receipt = result.receipt;
  // The receipt must name the revision that was asked for; anything else is an
  // answer to a different question and is not presented as success.
  if (receipt.revision.id !== input.revisionId || receipt.revision.knowledgeItemId !== input.knowledgeItemId) {
    throw new KnowledgeItemWriteError({ kind: "unknown-outcome", code: "KNOWLEDGE_ITEM_RESPONSE_INVALID" }, "KNOWLEDGE_ITEM_RESPONSE_INVALID");
  }
  return receipt;
}
