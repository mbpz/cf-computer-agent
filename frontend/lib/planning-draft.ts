export type PlanningDraftKind = "GOALS" | "PROJECTS";
export type PlanningComposerDraft = { readonly title: string; readonly description: string };
export type StoredPlanningDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: PlanningComposerDraft };
const storageKey = (memberId: string, kind: PlanningDraftKind) => `memory-garden:planning-draft:v1:${encodeURIComponent(memberId)}:${kind}`;
const memberPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RAW = 64_000;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("PLANNING_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
function text(value: unknown, max: number, multiline: boolean): value is string {
  return typeof value === "string" && [...value].length <= max
    && !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u : /[\u0000-\u001f\u007f-\u009f]/u).test(value);
}
export function validPlanningDraft(value: unknown): value is PlanningComposerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && text(record.title, 400, false) && text(record.description, 200_000, true)
    && (record.title !== "" || record.description !== "");
}

// Tab-scoped unsent goal or project create fields. Separate from an in-flight create.
// Survives refresh, not tab closure. Restoring never creates the row.
export function loadPlanningDraft(memberId: string, kind: PlanningDraftKind): StoredPlanningDraft {
  try {
    if (!memberPattern.test(memberId) || (kind !== "GOALS" && kind !== "PROJECTS")) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId, kind));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || value.kind !== kind || Object.keys(value).length !== 4 || !validPlanningDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze({ title: value.draft.title, description: value.draft.description }) };
  } catch { return { kind: "blocked" }; }
}

export function persistPlanningDraft(memberId: string, kind: PlanningDraftKind, draft: PlanningComposerDraft): boolean {
  try {
    if (!memberPattern.test(memberId) || (kind !== "GOALS" && kind !== "PROJECTS")) return false;
    if (draft.title === "" && draft.description === "") { storage().removeItem(storageKey(memberId, kind)); return true; }
    if (!validPlanningDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, kind, draft: { title: draft.title, description: draft.description } });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId, kind), body);
    return true;
  } catch { return false; }
}

export function discardBlockedPlanningDraft(memberId: string, kind: PlanningDraftKind): boolean {
  try {
    if (!memberPattern.test(memberId) || (kind !== "GOALS" && kind !== "PROJECTS")) return false;
    storage().removeItem(storageKey(memberId, kind));
    return true;
  } catch { return false; }
}
