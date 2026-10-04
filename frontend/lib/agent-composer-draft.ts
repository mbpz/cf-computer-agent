export type AgentSourceDraft = { readonly kind: "all" | "space" | "collection" | "items"; readonly ids: string };
export type AgentComposerDraft = { readonly question: string; readonly source: AgentSourceDraft | null };
export type StoredAgentComposerDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: AgentComposerDraft };
const storageKey = (memberId: string) => `memory-garden:agent-composer:v1:${encodeURIComponent(memberId)}`;
const memberPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const kinds = new Set(["all", "space", "collection", "items"]);
const MAX_RAW = 8_192;
const hidden = /[\p{Cc}\p{Cf}]/u;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("AGENT_COMPOSER_STORAGE_UNAVAILABLE");
  return value;
}
function validQuestion(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4_000 && !hidden.test(value);
}
function validSource(value: unknown): value is AgentSourceDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && kinds.has(String(record.kind))
    && typeof record.ids === "string" && record.ids.length <= 2_048 && !hidden.test(record.ids);
}
function plain(draft: AgentComposerDraft): AgentComposerDraft {
  return { question: draft.question, source: draft.source ? { kind: draft.source.kind, ids: draft.source.ids } : null };
}

// Tab-scoped unsent question and source fields. Separate from an in-flight turn.
// Survives refresh and navigation, not tab closure. Restoring never sends the question.
export function loadAgentComposerDraft(memberId: string): StoredAgentComposerDraft {
  try {
    if (!memberPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || Object.keys(value).length !== 3) return { kind: "blocked" };
    const draft = value.draft as Record<string, unknown> | null;
    if (!draft || typeof draft !== "object" || Array.isArray(draft) || Object.keys(draft).length !== 2) return { kind: "blocked" };
    const question = draft.question === "" ? "" : validQuestion(draft.question) ? draft.question : null;
    const source = draft.source === null ? null : validSource(draft.source) ? { kind: draft.source.kind, ids: draft.source.ids } : null;
    if (question === null || (draft.source !== null && !source) || (question === "" && !source)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze(plain({ question, source })) };
  } catch { return { kind: "blocked" }; }
}

export function persistAgentComposerDraft(memberId: string, draft: AgentComposerDraft): boolean {
  try {
    if (!memberPattern.test(memberId)) return false;
    if (draft.question === "" && draft.source === null) { storage().removeItem(storageKey(memberId)); return true; }
    if ((draft.question !== "" && !validQuestion(draft.question)) || (draft.source !== null && !validSource(draft.source))) return false;
    const body = JSON.stringify({ version: 1, memberId, draft: plain(draft) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedAgentComposerDraft(memberId: string): boolean {
  try {
    if (!memberPattern.test(memberId)) return false;
    storage().removeItem(storageKey(memberId));
    return true;
  } catch { return false; }
}
