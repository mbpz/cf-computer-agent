/**
 * Recovery record for the one derivative write that has no idempotency key:
 * `POST /api/knowledge/:id/research-runs/:runId/draft`. The server mints the
 * draft id itself, and there is no endpoint that lists drafts, so a lost
 * response cannot be settled by reading anything back. What this record does
 * is freeze the exact request that was sent, so a retry sends that same request
 * and never a newly composed one, and so a second tab cannot start an unrelated
 * draft while the first one is unresolved.
 *
 * The record is a per-member, per-run hint in localStorage; it is not a lock and
 * not a cross-device backup. It never claims the write happened.
 */
export interface ResearchDraftIntent {
  id: string;
  knowledgeItemId: string;
  researchRunId: string;
  reportId: string;
  reportTitle: string;
  requestedSpaceId: string;
  requestedCollectionId: string | null;
  requestedVisibility: "shared" | "admin_only";
}

export type StoredResearchDraftIntent =
  | { kind: "empty" }
  | { kind: "blocked" }
  | { kind: "ready"; intent: ResearchDraftIntent };

type DraftIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const BOUNDED_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const TARGET_ID = /^[A-Za-z0-9_-]{1,200}$/u;

export function draftIntentKey(memberId: string, knowledgeItemId: string, researchRunId: string): string {
  return `memory-garden:research-draft-intent:v1:${encodeURIComponent(memberId)}:${encodeURIComponent(knowledgeItemId)}:${encodeURIComponent(researchRunId)}`;
}

const INTENT_KEYS = ["id", "knowledgeItemId", "researchRunId", "reportId", "reportTitle", "requestedSpaceId", "requestedCollectionId", "requestedVisibility"] as const;

function isIntent(value: unknown): value is ResearchDraftIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const intent = value as Record<string, unknown>;
  if (Object.keys(intent).length !== INTENT_KEYS.length || !INTENT_KEYS.every((key) => Object.hasOwn(intent, key))) return false;
  const { id, knowledgeItemId, researchRunId, reportId, reportTitle, requestedSpaceId, requestedCollectionId, requestedVisibility } = intent;
  return typeof id === "string" && BOUNDED_ID.test(id)
    && typeof knowledgeItemId === "string" && BOUNDED_ID.test(knowledgeItemId)
    && typeof researchRunId === "string" && BOUNDED_ID.test(researchRunId)
    && typeof reportId === "string" && reportId.length > 0 && reportId.length <= 512
    && typeof reportTitle === "string" && new TextEncoder().encode(reportTitle).byteLength <= 2048
    && typeof requestedSpaceId === "string" && TARGET_ID.test(requestedSpaceId)
    && (requestedCollectionId === null || (typeof requestedCollectionId === "string" && TARGET_ID.test(requestedCollectionId)))
    && (requestedVisibility === "shared" || requestedVisibility === "admin_only");
}

function browserStorage(): DraftIntentStorage {
  // The DOM `window` global is absent from the Worker lib set, so read the host
  // global at runtime; Storage is declared for both libs but localStorage is not.
  const host = globalThis as { window?: { localStorage?: Storage } };
  if (!host.window?.localStorage) throw new Error("RESEARCH_DRAFT_INTENT_STORAGE_FAILED");
  return host.window.localStorage;
}

export function loadResearchDraftIntent(
  memberId: string,
  knowledgeItemId: string,
  researchRunId: string,
  storage?: DraftIntentStorage,
): StoredResearchDraftIntent {
  try {
    if (!BOUNDED_ID.test(memberId) || !BOUNDED_ID.test(knowledgeItemId) || !BOUNDED_ID.test(researchRunId)) return { kind: "blocked" };
    const raw = (storage ?? browserStorage()).getItem(draftIntentKey(memberId, knowledgeItemId, researchRunId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "blocked" };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { kind: "blocked" };
    const envelope = value as Record<string, unknown>;
    if (envelope.v !== 1 || envelope.member !== memberId || envelope.item !== knowledgeItemId || envelope.run !== researchRunId) return { kind: "blocked" };
    if (!isIntent(envelope.intent)) return { kind: "blocked" };
    return { kind: "ready", intent: envelope.intent };
  } catch {
    return { kind: "blocked" };
  }
}

/** Records the request before it is sent. An existing record is never overwritten. */
export function prepareResearchDraftIntent(
  memberId: string,
  knowledgeItemId: string,
  researchRunId: string,
  intent: ResearchDraftIntent,
  storage?: DraftIntentStorage,
): void {
  const target = storage ?? browserStorage();
  if (!isIntent(intent) || intent.knowledgeItemId !== knowledgeItemId || intent.researchRunId !== researchRunId) {
    throw new Error("RESEARCH_DRAFT_INTENT_INVALID");
  }
  if (loadResearchDraftIntent(memberId, knowledgeItemId, researchRunId, target).kind !== "empty") {
    throw new Error("RESEARCH_DRAFT_INTENT_BLOCKED");
  }
  target.setItem(draftIntentKey(memberId, knowledgeItemId, researchRunId), JSON.stringify({ v: 1, member: memberId, item: knowledgeItemId, run: researchRunId, intent }));
  const saved = loadResearchDraftIntent(memberId, knowledgeItemId, researchRunId, target);
  if (saved.kind !== "ready" || JSON.stringify(saved.intent) !== JSON.stringify(intent)) throw new Error("RESEARCH_DRAFT_INTENT_STORAGE_FAILED");
}

/** Clears the record only for the exact intent it was written for. */
export function finishResearchDraftIntent(
  memberId: string,
  knowledgeItemId: string,
  researchRunId: string,
  intent: ResearchDraftIntent,
  storage?: DraftIntentStorage,
): void {
  const target = storage ?? browserStorage();
  const saved = loadResearchDraftIntent(memberId, knowledgeItemId, researchRunId, target);
  if (saved.kind === "empty") return;
  if (saved.kind !== "ready" || JSON.stringify(saved.intent) !== JSON.stringify(intent)) throw new Error("RESEARCH_DRAFT_INTENT_CHANGED");
  const key = draftIntentKey(memberId, knowledgeItemId, researchRunId);
  target.removeItem(key);
  if (target.getItem(key) !== null) throw new Error("RESEARCH_DRAFT_INTENT_STORAGE_FAILED");
}

/** Drops an unresolved record without sending anything. The caller owns the warning. */
export function discardResearchDraftIntent(
  memberId: string,
  knowledgeItemId: string,
  researchRunId: string,
  storage?: DraftIntentStorage,
): void {
  (storage ?? browserStorage()).removeItem(draftIntentKey(memberId, knowledgeItemId, researchRunId));
}
