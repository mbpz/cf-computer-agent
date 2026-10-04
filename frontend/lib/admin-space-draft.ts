export type SpaceCreateDraft = { readonly slug: string; readonly name: string };
export type SpaceEditorFields = { readonly name: string; readonly slug: string; readonly description: string; readonly status: "active" | "disabled"; readonly position: string; readonly parentId: string };
export type SpaceEditorDraft = { readonly kind: "space" | "create-collection" | "collection"; readonly spaceId: string; readonly collectionId: string; readonly fields: SpaceEditorFields };
export type AdminSpaceDraft = { readonly create: SpaceCreateDraft | null; readonly editor: SpaceEditorDraft | null };
export type StoredAdminSpaceDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: AdminSpaceDraft };
const storageKey = (memberId: string) => `memory-garden:admin-space-draft:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RAW = 8192;
const fieldNames = ["name", "slug", "description", "status", "position", "parentId"] as const;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("SPACE_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && [...value].length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function editorFields(value: unknown): value is SpaceEditorFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === fieldNames.length && fieldNames.every((key) => key in record)
    && text(record.name, 120) && text(record.slug, 80) && text(record.description, 1000)
    && (record.status === "active" || record.status === "disabled")
    && typeof record.position === "string" && /^\d{0,7}$/u.test(record.position)
    && (record.parentId === "" || (typeof record.parentId === "string" && idPattern.test(record.parentId)));
}
function validCreate(value: unknown): value is SpaceCreateDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && text(record.slug, 80) && text(record.name, 120) && (record.slug !== "" || record.name !== "");
}
function validEditor(value: unknown): value is SpaceEditorDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 4 || !editorFields(record.fields) || typeof record.spaceId !== "string" || !idPattern.test(record.spaceId)) return false;
  if (record.kind !== "space" && record.kind !== "create-collection" && record.kind !== "collection") return false;
  return record.kind === "collection" ? typeof record.collectionId === "string" && idPattern.test(record.collectionId) : record.collectionId === "";
}
export function validAdminSpaceDraft(value: unknown): value is AdminSpaceDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2 || !("create" in record) || !("editor" in record)) return false;
  if (record.create !== null && !validCreate(record.create)) return false;
  if (record.editor !== null && !validEditor(record.editor)) return false;
  return record.create !== null || record.editor !== null;
}
function plain(draft: AdminSpaceDraft): AdminSpaceDraft {
  const editor = draft.editor;
  return {
    create: draft.create ? { slug: draft.create.slug, name: draft.create.name } : null,
    editor: editor ? { kind: editor.kind, spaceId: editor.spaceId, collectionId: editor.collectionId, fields: { name: editor.fields.name, slug: editor.fields.slug, description: editor.fields.description, status: editor.fields.status, position: editor.fields.position, parentId: editor.fields.parentId } } : null,
  };
}

// Tab-scoped unsent space create or editor. Separate from an in-flight space write.
// Survives refresh, not tab closure. Restoring never sends the change.
export function loadAdminSpaceDraft(memberId: string): StoredAdminSpaceDraft {
  try {
    if (!memberId || !idPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || Object.keys(value).length !== 3 || !validAdminSpaceDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze(plain(value.draft)) };
  } catch { return { kind: "blocked" }; }
}

export function persistAdminSpaceDraft(memberId: string, draft: AdminSpaceDraft | null): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    if (draft === null) { storage().removeItem(storageKey(memberId)); return true; }
    if (!validAdminSpaceDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, draft: plain(draft) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedAdminSpaceDraft(memberId: string): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    storage().removeItem(storageKey(memberId));
    return true;
  } catch { return false; }
}
