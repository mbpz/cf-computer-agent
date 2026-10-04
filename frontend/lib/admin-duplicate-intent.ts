import type { AdminDuplicateCandidate, DuplicateDecision } from "./admin-duplicates-data";

export type AdminDuplicateIntent = {
  readonly submissionId: string;
  readonly decision: DuplicateDecision;
  readonly canonicalSubmissionId: string;
  readonly canonicalSourceId: string;
  readonly canonicalSourceVersionId: string;
};
export type StoredAdminDuplicate = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; intents: readonly AdminDuplicateIntent[] };
const storageKey = (memberId: string) => `memory-garden:admin-duplicate:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/u;
const decisions = new Set<DuplicateDecision>(["associate", "keep_separate", "reject"]);
const intentKeys = ["submissionId", "decision", "canonicalSubmissionId", "canonicalSourceId", "canonicalSourceVersionId"];
function isId(value: unknown): value is string { return typeof value === "string" && idPattern.test(value); }
export function validAdminDuplicateIntent(value: unknown): value is AdminDuplicateIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === intentKeys.length && intentKeys.every((key) => keys.includes(key))
    && isId(record.submissionId) && decisions.has(record.decision as DuplicateDecision)
    && isId(record.canonicalSubmissionId) && isId(record.canonicalSourceId) && isId(record.canonicalSourceVersionId);
}
export function candidateFromAdminDuplicateIntent(intent: AdminDuplicateIntent): AdminDuplicateCandidate {
  return { submissionId: intent.submissionId, canonicalSubmissionId: intent.canonicalSubmissionId, canonicalSourceId: intent.canonicalSourceId, canonicalSourceVersionId: intent.canonicalSourceVersionId, submissionTitle: intent.submissionId, canonicalTitle: intent.submissionId, decision: "pending" };
}
function plain(intent: AdminDuplicateIntent): AdminDuplicateIntent {
  return { submissionId: intent.submissionId, decision: intent.decision, canonicalSubmissionId: intent.canonicalSubmissionId, canonicalSourceId: intent.canonicalSourceId, canonicalSourceVersionId: intent.canonicalSourceVersionId };
}
function same(left: AdminDuplicateIntent, right: AdminDuplicateIntent): boolean { return JSON.stringify(plain(left)) === JSON.stringify(plain(right)); }
function freeze(intent: AdminDuplicateIntent): AdminDuplicateIntent { return Object.freeze(plain(intent)); }
function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("DUPLICATE_STORAGE_UNAVAILABLE");
  return value;
}
function parseIntents(value: unknown): AdminDuplicateIntent[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20 || !value.every(validAdminDuplicateIntent)) return null;
  if (new Set(value.map((item) => item.submissionId)).size !== value.length) return null;
  return value.map(freeze);
}
// Tab-scoped, member-scoped session storage: survives refresh/navigation, not tab closure.
// Written before the decision is sent, so a refresh during an unknown result still reconciles by reading.
export function loadAdminDuplicateDecisions(memberId: string): StoredAdminDuplicate {
  try {
    if (!memberId) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > 16384) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    const intents = parseIntents(value?.intents);
    if (!value || value.version !== 1 || value.memberId !== memberId || !intents
      || Object.keys(value).length !== 3 || Object.keys(value).some((key) => !["version", "memberId", "intents"].includes(key))) return { kind: "blocked" };
    return { kind: "ready", intents: Object.freeze(intents) };
  } catch { return { kind: "blocked" }; }
}
export function saveAdminDuplicateDecision(memberId: string, intent: AdminDuplicateIntent): boolean {
  try {
    if (!memberId || !validAdminDuplicateIntent(intent)) return false;
    const current = loadAdminDuplicateDecisions(memberId);
    if (current.kind === "blocked") return false;
    const existing = current.kind === "ready" ? current.intents.find((item) => item.submissionId === intent.submissionId) : undefined;
    if (existing) return same(existing, intent);
    if (current.kind === "ready" && current.intents.length >= 20) return false;
    const intents = [...(current.kind === "ready" ? current.intents.map(plain) : []), plain(intent)];
    const store = storage();
    const key = storageKey(memberId);
    const previous = store.getItem(key);
    store.setItem(key, JSON.stringify({ version: 1, memberId, intents }));
    const saved = loadAdminDuplicateDecisions(memberId);
    const ok = saved.kind === "ready" && saved.intents.some((item) => same(item, intent));
    if (!ok) {
      if (previous === null) store.removeItem(key);
      else store.setItem(key, previous);
    }
    return ok;
  } catch { return false; }
}
export function clearAdminDuplicateDecision(memberId: string, intent: AdminDuplicateIntent): boolean {
  try {
    if (!memberId || !validAdminDuplicateIntent(intent)) return false;
    const current = loadAdminDuplicateDecisions(memberId);
    if (current.kind === "blocked") return false;
    if (current.kind === "empty") return true;
    const match = current.intents.find((item) => item.submissionId === intent.submissionId);
    if (!match) return true;
    if (!same(match, intent)) return false;
    const intents = current.intents.filter((item) => item.submissionId !== intent.submissionId).map(plain);
    const store = storage();
    const key = storageKey(memberId);
    if (intents.length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify({ version: 1, memberId, intents }));
    const saved = loadAdminDuplicateDecisions(memberId);
    return saved.kind === "empty" || (saved.kind === "ready" && saved.intents.every((item) => item.submissionId !== intent.submissionId));
  } catch { return false; }
}
export function discardBlockedAdminDuplicate(memberId: string): boolean {
  try {
    if (!memberId || loadAdminDuplicateDecisions(memberId).kind !== "blocked") return false;
    storage().removeItem(storageKey(memberId));
    return loadAdminDuplicateDecisions(memberId).kind === "empty";
  } catch { return false; }
}
