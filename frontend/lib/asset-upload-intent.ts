import { createIdempotencyKey } from "../components/submissions/submission-form-model";
export type AssetIntent = {
  version: 1; key: string; file: { name: string; size: number; type: string; sha256: string };
  review?: { key: string; title: string };
};
export type AssetIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type AssetIntentLoad = { kind: "empty" | "invalid" | "unavailable" } | { kind: "ready"; intent: AssetIntent };
function storageKey(memberId: string) {
  if (!memberId.trim() || memberId.length > 512) throw Error("ASSET_MEMBER_INVALID");
  return `personal-workbench:asset-intent:v1:${encodeURIComponent(memberId)}`;
}
function browserStorage() { const storage = (globalThis as { window?: { localStorage?: Storage } }).window?.localStorage; if (!storage) throw Error("ASSET_STORAGE_UNAVAILABLE"); return storage; }
const validKey = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/u.test(value);
function valid(value: unknown): value is AssetIntent {
  if (!value || typeof value !== "object") return false;
  const v = value as AssetIntent; const f = v.file;
  return v.version === 1 && validKey(v.key) && Boolean(f) && typeof f.name === "string" && !!f.name.trim() && f.name.length <= 200
    && !/[\/\\\u0000-\u001f\u007f]/u.test(f.name) && Number.isSafeInteger(f.size) && f.size > 0
    && typeof f.type === "string" && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/u.test(f.type) && /^[a-f0-9]{64}$/u.test(f.sha256)
    && (v.review === undefined || Boolean(v.review && validKey(v.review.key) && typeof v.review.title === "string" && v.review.title.trim() && new TextEncoder().encode(v.review.title).byteLength <= 512));
}
export function loadAssetIntent(memberId: string, storage?: AssetIntentStorage): AssetIntentLoad {
  try {
    const raw = (storage ?? browserStorage()).getItem(storageKey(memberId)); if (raw === null) return { kind: "empty" };
    try { const value: unknown = JSON.parse(raw); return valid(value) ? { kind: "ready", intent: value } : { kind: "invalid" }; } catch { return { kind: "invalid" }; }
  } catch { return { kind: "unavailable" }; }
}
/** Append review intent only once; never replace an unresolved upload or its original review payload. */
export function saveAssetIntent(memberId: string, intent: AssetIntent, storage?: AssetIntentStorage): boolean {
  if (!valid(intent)) return false;
  try {
    const target = storage ?? browserStorage(); const previous = loadAssetIntent(memberId, target);
    if (previous.kind !== "empty") {
      if (previous.kind !== "ready" || previous.intent.key !== intent.key || JSON.stringify(previous.intent.file) !== JSON.stringify(intent.file)
        || (previous.intent.review && JSON.stringify(previous.intent.review) !== JSON.stringify(intent.review))) return false;
    }
    target.setItem(storageKey(memberId), JSON.stringify(intent)); return true;
  } catch { return false; }
}
export function clearAssetIntent(memberId: string, key: string, storage?: AssetIntentStorage): boolean {
  try {
    const target = storage ?? browserStorage(); const previous = loadAssetIntent(memberId, target);
    if (previous.kind !== "ready" || previous.intent.key !== key) return false;
    target.removeItem(storageKey(memberId)); return true;
  } catch { return false; }
}
export async function describeAssetFile(file: File, type: string): Promise<AssetIntent["file"]> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return { name: file.name, size: file.size, type, sha256: Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("") };
}
export const newAssetKey = createIdempotencyKey;
