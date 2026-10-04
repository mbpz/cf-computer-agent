export type AdminRoleComposerDraft = {
  readonly roleId: string;
  readonly mask: string;
  readonly memberId: string;
  readonly newKey: string;
  readonly newName: string;
  readonly newMask: string;
};
export type StoredAdminRoleDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: AdminRoleComposerDraft };
const storageKey = (memberId: string) => `memory-garden:admin-role-draft:v1:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const bitsPattern = /^0x[0-9a-f]+$/iu;
const MAX_RAW = 8192;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("ROLE_DRAFT_STORAGE_UNAVAILABLE");
  return value;
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && [...value].length <= max && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function bits(value: unknown): value is string {
  if (typeof value !== "string" || !bitsPattern.test(value) || value.length > 18) return false;
  try {
    const mask = BigInt(value);
    return mask >= 0n && mask <= ((1n << 64n) - 1n);
  } catch { return false; }
}
export function validAdminRoleDraft(value: unknown): value is AdminRoleComposerDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 6
    && typeof record.roleId === "string" && idPattern.test(record.roleId)
    && bits(record.mask) && text(record.memberId, 128) && text(record.newKey, 64) && text(record.newName, 200) && text(record.newMask, 18);
}
function plain(draft: AdminRoleComposerDraft): AdminRoleComposerDraft {
  return { roleId: draft.roleId, mask: draft.mask.toLowerCase(), memberId: draft.memberId, newKey: draft.newKey, newName: draft.newName, newMask: draft.newMask };
}

// Tab-scoped unsent role edits. Separate from an in-flight role write.
// Survives refresh, not tab closure. Restoring never sends the change.
export function loadAdminRoleDraft(memberId: string): StoredAdminRoleDraft {
  try {
    if (!memberId || !idPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || Object.keys(value).length !== 3 || !validAdminRoleDraft(value.draft)) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze(plain(value.draft)) };
  } catch { return { kind: "blocked" }; }
}

export function persistAdminRoleDraft(memberId: string, draft: AdminRoleComposerDraft | null): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    if (draft === null) { storage().removeItem(storageKey(memberId)); return true; }
    if (!validAdminRoleDraft(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, draft: plain(draft) });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedAdminRoleDraft(memberId: string): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    storage().removeItem(storageKey(memberId));
    return true;
  } catch { return false; }
}
