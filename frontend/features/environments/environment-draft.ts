export type EnvironmentCreateFields = { readonly name: string; readonly type: "personal" | "temporary"; readonly taskId: string };
export type EnvironmentRenameFields = { readonly environmentId: string; readonly name: string };
export type EnvironmentComposerDraft = { readonly create: EnvironmentCreateFields; readonly rename: EnvironmentRenameFields | null };
export type StoredEnvironmentDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: EnvironmentComposerDraft };
const storageKey = (origin: string, memberId: string) => `memory-garden:environment-draft:v1:${encodeURIComponent(origin)}:${encodeURIComponent(memberId)}`;
const memberPattern = /^[A-Za-z0-9_-]{1,128}$/u;
const idPattern = /^[A-Za-z0-9_-]{1,128}$/u;
const MAX_RAW = 8192;
export const blankEnvironmentCreate = (): EnvironmentCreateFields => ({ name: "", type: "personal", taskId: "" });

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("ENVIRONMENT_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
function label(value: unknown): value is string {
  return typeof value === "string" && value.length <= 512 && [...value].length <= 240 && !/[\u0000-\u001f\u007f]/u.test(value);
}
function task(value: unknown): value is string {
  return typeof value === "string" && [...value].length <= 128 && !/[\u0000-\u001f\u007f]/u.test(value);
}
function createFields(value: unknown): value is EnvironmentCreateFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 3 && label(record.name) && (record.type === "personal" || record.type === "temporary") && task(record.taskId);
}
function renameFields(value: unknown): value is EnvironmentRenameFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && idPattern.test(String(record.environmentId)) && label(record.name);
}
export function environmentCreateIsBlank(fields: EnvironmentCreateFields): boolean {
  return fields.name === "" && fields.type === "personal" && fields.taskId === "";
}
export function validEnvironmentDraft(value: unknown): value is EnvironmentComposerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !createFields(record.create)) return false;
  if (record.rename !== null && !renameFields(record.rename)) return false;
  return !environmentCreateIsBlank(record.create) || record.rename !== null;
}
function plain(draft: EnvironmentComposerDraft): EnvironmentComposerDraft {
  return {
    create: { name: draft.create.name, type: draft.create.type, taskId: draft.create.taskId },
    rename: draft.rename ? { environmentId: draft.rename.environmentId, name: draft.rename.name } : null,
  };
}

// Tab-scoped unsent environment create/rename. Separate from an in-flight operation.
// Survives refresh, not tab closure. Restoring never sends a write.
export function loadEnvironmentDraft(origin: string, memberId: string): StoredEnvironmentDraft {
  try {
    if (!label(origin) || !memberPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(origin, memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.origin !== origin || value.memberId !== memberId || Object.keys(value).length !== 4 || !validEnvironmentDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze(plain(value.draft)) };
  } catch { return { kind: "blocked" }; }
}

export function persistEnvironmentDraft(origin: string, memberId: string, draft: EnvironmentComposerDraft): boolean {
  try {
    if (!label(origin) || !memberPattern.test(memberId)) return false;
    if (environmentCreateIsBlank(draft.create) && draft.rename === null) { storage().removeItem(storageKey(origin, memberId)); return true; }
    if (!validEnvironmentDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, origin, memberId, draft: plain(draft) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(origin, memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedEnvironmentDraft(origin: string, memberId: string): boolean {
  try {
    if (!label(origin) || !memberPattern.test(memberId)) return false;
    storage().removeItem(storageKey(origin, memberId));
    return true;
  } catch { return false; }
}
