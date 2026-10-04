import { MENU_LABEL_KEYS } from "../../shared/admin-menu-fields";

export type MenuEditorFields = {
  readonly key: string;
  readonly labelKey: string;
  readonly path: string;
  readonly parentId: string;
  readonly icon: string;
  readonly groupName: string;
  readonly position: string;
  readonly requiredBits: string;
  readonly status: string;
  readonly visible: string;
};
export type AdminMenuEditorDraft = { readonly mode: "create" | "edit"; readonly menuId: string; readonly fields: MenuEditorFields };
export type StoredAdminMenuDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: AdminMenuEditorDraft };
const storageKey = (memberId: string) => `memory-garden:admin-menu-draft:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const labels = new Set<string>(MENU_LABEL_KEYS);
const MAX_RAW = 8192;
const fieldNames = ["key", "labelKey", "path", "parentId", "icon", "groupName", "position", "requiredBits", "status", "visible"] as const;

export function menuEditorBaseline(menu?: { key?: string; labelKey?: string; path?: string | null; parentId?: string | null; icon?: string | null; groupName?: string; position?: number; requiredBits?: string; status?: string; visible?: boolean }): MenuEditorFields {
  return { key: menu?.key ?? "", labelKey: menu?.labelKey ?? "NAV_HOME", path: menu?.path ?? "", parentId: menu?.parentId ?? "", icon: menu?.icon ?? "", groupName: menu?.groupName ?? "workspace", position: String(menu?.position ?? 0), requiredBits: menu?.requiredBits ?? "0x0", status: menu?.status ?? "active", visible: String(menu?.visible ?? true) };
}

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("MENU_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && [...value].length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function fields(value: unknown): value is MenuEditorFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === fieldNames.length && fieldNames.every((key) => key in record)
    && text(record.key, 64) && typeof record.labelKey === "string" && labels.has(record.labelKey)
    && text(record.path, 200) && (record.parentId === "" || (typeof record.parentId === "string" && idPattern.test(record.parentId)))
    && text(record.icon, 64) && (record.groupName === "workspace" || record.groupName === "admin")
    && typeof record.position === "string" && /^\d{0,6}$/u.test(record.position)
    && text(record.requiredBits, 18) && (record.status === "active" || record.status === "disabled")
    && (record.visible === "true" || record.visible === "false");
}
export function validAdminMenuDraft(value: unknown): value is AdminMenuEditorDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || !fields(record.fields)) return false;
  if (record.mode === "create") return record.menuId === "";
  return record.mode === "edit" && typeof record.menuId === "string" && idPattern.test(record.menuId);
}
function plain(draft: AdminMenuEditorDraft): AdminMenuEditorDraft {
  const source = draft.fields;
  return { mode: draft.mode, menuId: draft.menuId, fields: { key: source.key, labelKey: source.labelKey, path: source.path, parentId: source.parentId, icon: source.icon, groupName: source.groupName, position: source.position, requiredBits: source.requiredBits, status: source.status, visible: source.visible } };
}

// Tab-scoped unsent menu editor. Separate from an in-flight menu write.
// Survives refresh, not tab closure. Restoring never sends the change.
export function loadAdminMenuDraft(memberId: string): StoredAdminMenuDraft {
  try {
    if (!memberId || !idPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || Object.keys(value).length !== 3 || !validAdminMenuDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze(plain(value.draft)) };
  } catch { return { kind: "blocked" }; }
}

export function persistAdminMenuDraft(memberId: string, draft: AdminMenuEditorDraft | null): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    if (draft === null) { storage().removeItem(storageKey(memberId)); return true; }
    if (!validAdminMenuDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, draft: plain(draft) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedAdminMenuDraft(memberId: string): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    storage().removeItem(storageKey(memberId));
    return true;
  } catch { return false; }
}

export type MenuPositionEntry = { readonly menuId: string; readonly position: string };
export type StoredMenuPositions = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; positions: readonly MenuPositionEntry[] };
const positionKey = (memberId: string) => `memory-garden:admin-menu-position:v1:${encodeURIComponent(memberId)}`;

function positionEntry(value: unknown): value is MenuPositionEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 && typeof record.menuId === "string" && idPattern.test(record.menuId) && typeof record.position === "string" && /^\d{0,6}$/u.test(record.position);
}
function validPositions(value: unknown): value is readonly MenuPositionEntry[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40 || !value.every(positionEntry)) return false;
  return new Set(value.map((entry) => entry.menuId)).size === value.length;
}

// Tab-scoped unsent row positions. Separate from the editor draft and from an in-flight write.
export function loadMenuPositionDraft(memberId: string): StoredMenuPositions {
  try {
    if (!memberId || !idPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(positionKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || Object.keys(value).length !== 3 || !validPositions(value.positions)) return { kind: "blocked" };
    return { kind: "ready", positions: Object.freeze(value.positions.map((entry) => Object.freeze({ menuId: entry.menuId, position: entry.position }))) };
  } catch { return { kind: "blocked" }; }
}

export function persistMenuPositionDraft(memberId: string, positions: readonly MenuPositionEntry[]): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    if (positions.length === 0) { storage().removeItem(positionKey(memberId)); return true; }
    if (!validPositions(positions)) return false;
    const body = JSON.stringify({ version: 1, memberId, positions: positions.map((entry) => ({ menuId: entry.menuId, position: entry.position })) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(positionKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedMenuPositionDraft(memberId: string): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    storage().removeItem(positionKey(memberId));
    return true;
  } catch { return false; }
}

export function releaseMenuPositionDraft(memberId: string, menuId: string): boolean {
  const current = loadMenuPositionDraft(memberId);
  if (current.kind === "blocked") return false;
  if (current.kind === "empty") return true;
  return persistMenuPositionDraft(memberId, current.positions.filter((entry) => entry.menuId !== menuId));
}
