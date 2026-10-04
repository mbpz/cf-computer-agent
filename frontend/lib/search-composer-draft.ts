export type SearchComposerDraft = { readonly query: string; readonly name: string };
export type StoredSearchComposerDraft = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; draft: SearchComposerDraft };
const storageKey = (memberId: string) => `memory-garden:search-composer:v1:${encodeURIComponent(memberId)}`;
const memberPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RAW = 8_192;
const encoder = new TextEncoder();

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("SEARCH_COMPOSER_STORAGE_UNAVAILABLE");
  return value;
}
function malformedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}
function validQuery(value: string): boolean {
  return value.length > 0 && [...value].length <= 200 && encoder.encode(value).byteLength <= 512
    && !/\p{Cc}/u.test(value) && !malformedSurrogate(value);
}
function validName(value: string): boolean {
  return value.length > 0 && [...value].length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
function ready(draft: { query: string; name: string }): boolean {
  return (draft.query === "" || validQuery(draft.query)) && (draft.name === "" || validName(draft.name)) && (draft.query !== "" || draft.name !== "");
}

// Tab-scoped unsent search text and saved-view name. Survives refresh, not tab closure.
// Restoring never submits the query or creates a view.
export function loadSearchComposerDraft(memberId: string): StoredSearchComposerDraft {
  try {
    if (!memberPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || Object.keys(value).length !== 3) return { kind: "blocked" };
    const draft = value.draft as Record<string, unknown> | null;
    if (!draft || typeof draft !== "object" || Array.isArray(draft) || Object.keys(draft).length !== 2) return { kind: "blocked" };
    if (typeof draft.query !== "string" || typeof draft.name !== "string" || !ready({ query: draft.query, name: draft.name })) return { kind: "blocked" };
    return { kind: "ready", draft: Object.freeze({ query: draft.query, name: draft.name }) };
  } catch { return { kind: "blocked" }; }
}

export function persistSearchComposerDraft(memberId: string, draft: SearchComposerDraft): boolean {
  try {
    if (!memberPattern.test(memberId)) return false;
    if (draft.query === "" && draft.name === "") { storage().removeItem(storageKey(memberId)); return true; }
    if (!ready(draft)) return false;
    const body = JSON.stringify({ version: 1, memberId, draft: { query: draft.query, name: draft.name } });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId), body);
    return true;
  } catch { return false; }
}

export function discardBlockedSearchComposerDraft(memberId: string): boolean {
  try {
    if (!memberPattern.test(memberId)) return false;
    storage().removeItem(storageKey(memberId));
    return true;
  } catch { return false; }
}
