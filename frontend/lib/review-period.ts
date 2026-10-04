export type ReviewPeriodSurface = "knowledge" | "workbench";
export type ReviewPeriodValue = "daily" | "weekly";
export type StoredReviewPeriod = { kind: "empty" } | { kind: "blocked" } | { kind: "ready"; period: ReviewPeriodValue };
const storageKey = (memberId: string, surface: ReviewPeriodSurface) => `memory-garden:review-period:v1:${surface}:${encodeURIComponent(memberId)}`;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RAW = 8192;

function storage(): Storage {
  const value = (globalThis as { window?: { sessionStorage?: Storage } }).window?.sessionStorage;
  if (!value) throw new Error("REVIEW_PERIOD_STORAGE_UNAVAILABLE");
  return value;
}

// Tab-scoped non-default review period. Daily is the blank view and is not stored.
// Survives refresh and return. Restoring only changes the following read.
export function loadReviewPeriod(memberId: string, surface: ReviewPeriodSurface): StoredReviewPeriod {
  try {
    if (!memberId || !idPattern.test(memberId)) return { kind: "blocked" };
    const raw = storage().getItem(storageKey(memberId, surface));
    if (raw === null) return { kind: "empty" };
    if (raw.length > MAX_RAW) return { kind: "blocked" };
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.version !== 1 || value.memberId !== memberId || value.period !== "weekly" || Object.keys(value).length !== 3) return { kind: "blocked" };
    return { kind: "ready", period: "weekly" };
  } catch { return { kind: "blocked" }; }
}

export function persistReviewPeriod(memberId: string, surface: ReviewPeriodSurface, period: ReviewPeriodValue): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    if (period === "daily") { storage().removeItem(storageKey(memberId, surface)); return true; }
    if (period !== "weekly") return false;
    const body = JSON.stringify({ version: 1, memberId, period: "weekly" });
    if (body.length > MAX_RAW) return false;
    storage().setItem(storageKey(memberId, surface), body);
    return true;
  } catch { return false; }
}

export function discardBlockedReviewPeriod(memberId: string, surface: ReviewPeriodSurface): boolean {
  try {
    if (!memberId || !idPattern.test(memberId)) return false;
    storage().removeItem(storageKey(memberId, surface));
    return true;
  } catch { return false; }
}
