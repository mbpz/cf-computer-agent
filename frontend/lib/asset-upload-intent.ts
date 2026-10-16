import { validateSubmissionTarget, type SubmissionTarget } from "./submission-data";
import { createIdempotencyKey } from "../components/submissions/submission-form-model";
/** The resolved description of an asset. URL-sourced intents learn it from the confirmed server response. */
export type AssetFileDescription = { name: string; size: number; type: string; sha256: string };
/** A snapshot the member asked the server to fetch: no local bytes exist until the server confirms them. */
export type AssetUrlSource = { kind: "url"; url: string };
/** `content` is present only when the member supplied alternative text for an unparseable asset. */
export type AssetReview = { key: string; title: string; target?: SubmissionTarget; content?: string };
export type AssetIntent = {
  version: 1; key: string;
  file?: AssetFileDescription;
  source?: AssetUrlSource;
  review?: AssetReview;
};
export type AssetIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type AssetIntentLoad = { kind: "empty" | "invalid" | "unavailable" } | { kind: "ready"; intent: AssetIntent };
const maxReviewTitleBytes = 512;
function storageKey(memberId: string) {
  if (!memberId.trim() || memberId.length > 512) throw Error("ASSET_MEMBER_INVALID");
  return `personal-workbench:asset-intent:v1:${encodeURIComponent(memberId)}`;
}
function browserStorage() { const storage = (globalThis as { window?: { localStorage?: Storage } }).window?.localStorage; if (!storage) throw Error("ASSET_STORAGE_UNAVAILABLE"); return storage; }
const validKey = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/u.test(value);
export function validAssetFile(value: unknown): value is AssetFileDescription {
  if (!value || typeof value !== "object") return false;
  if (!("name" in value) || typeof value.name !== "string" || !value.name.trim() || value.name.length > 200 || /[\/\\\u0000-\u001f\u007f]/u.test(value.name)) return false;
  if (!("size" in value) || !Number.isSafeInteger(value.size) || Number(value.size) <= 0) return false;
  if (!("type" in value) || typeof value.type !== "string" || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/u.test(value.type)) return false;
  return "sha256" in value && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/u.test(value.sha256);
}
/** The server owns fetch policy (https, blocked hosts, redirects); the client only rejects malformed input. */
export function validAssetUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048 || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:"; } catch { return false; }
}
function validSource(value: unknown): value is AssetUrlSource {
  return Boolean(value && typeof value === "object" && "kind" in value && value.kind === "url" && "url" in value && validAssetUrl(value.url));
}
function validTarget(value: unknown) { try { validateSubmissionTarget(value as SubmissionTarget); return true; } catch { return false; } }
function validReview(value: unknown): value is AssetReview {
  if (!value || typeof value !== "object") return false;
  if (!("key" in value) || !validKey(value.key)) return false;
  if (!("title" in value) || typeof value.title !== "string" || !value.title.trim() || new TextEncoder().encode(value.title).byteLength > maxReviewTitleBytes) return false;
  if ("target" in value && value.target !== undefined && !validTarget(value.target)) return false;
  if ("content" in value && value.content !== undefined && (typeof value.content !== "string" || !value.content.trim())) return false;
  return true;
}
function valid(value: unknown): value is AssetIntent {
  if (!value || typeof value !== "object") return false;
  if (!("version" in value) || value.version !== 1 || !("key" in value) || !validKey(value.key)) return false;
  const source = "source" in value ? value.source : undefined;
  if (source !== undefined && !validSource(source)) return false;
  const file = "file" in value ? value.file : undefined;
  // A file description may be absent only for a URL snapshot whose bytes the server has not confirmed yet.
  if (file === undefined) { if (source === undefined) return false; }
  else if (!validAssetFile(file)) return false;
  if ("review" in value && value.review !== undefined && !validReview(value.review)) return false;
  return true;
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
      if (previous.kind !== "ready" || previous.intent.key !== intent.key
        || JSON.stringify(previous.intent.source) !== JSON.stringify(intent.source)
        || (previous.intent.file !== undefined && JSON.stringify(previous.intent.file) !== JSON.stringify(intent.file))
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
export async function describeAssetFile(file: File, type: string): Promise<AssetFileDescription> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return { name: file.name, size: file.size, type, sha256: Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("") };
}
export const newAssetKey = createIdempotencyKey;
