import type { EnvironmentTombstone } from "../../../shared/environments";

export interface EnvironmentAccountScope {
  readonly origin: string;
  readonly memberId: string;
  readonly sessionEpoch: number;
}

export interface EnvironmentDeletionReconcileOptions extends EnvironmentAccountScope {
  signal: AbortSignal;
  isCurrent: (scope: EnvironmentAccountScope) => boolean;
  fetchPage: (input: EnvironmentAccountScope & { page: number; pageSize: number; signal: AbortSignal }) => Promise<unknown>;
  /** Must be idempotent, use an account-scoped store, and call assertCurrent just before writing. */
  removeLocalCopy: (input: EnvironmentAccountScope & EnvironmentTombstone & {
    signal: AbortSignal;
    assertCurrent: () => void;
  }) => Promise<void>;
}

class ReconciliationError extends Error {
  constructor(readonly code: "ACCOUNT_CHANGED" | "CANCELLED" | "INVALID_PAGE") {
    super(code);
    this.name = "EnvironmentDeletionReconciliationError";
  }
}

const PAGE_SIZE = 100;
const MAX_MARKERS = 10_000;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function validatePage(value: unknown, page: number, previousTotal: number, seen: Set<string>) {
  const invalid = () => { throw new ReconciliationError("INVALID_PAGE"); };
  if (!record(value) || !Array.isArray(value.items) || !record(value.pagination)) return invalid();
  const { total, totalPages, pageSize, page: receivedPage } = value.pagination;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < previousTotal || total > MAX_MARKERS ||
      receivedPage !== page || pageSize !== PAGE_SIZE || totalPages !== Math.ceil(total / PAGE_SIZE) ||
      value.items.length !== Math.max(0, Math.min(PAGE_SIZE, total - (page - 1) * PAGE_SIZE))) return invalid();
  const items: EnvironmentTombstone[] = [];
  const pageIds = new Set<string>();
  for (const item of value.items) {
    if (!record(item)) return invalid();
    const { environmentId, version, deletedAt } = item;
    if (typeof environmentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(environmentId) ||
        typeof version !== "number" || !Number.isSafeInteger(version) || version < 2 ||
        typeof deletedAt !== "string" || !Number.isFinite(Date.parse(deletedAt)) ||
        new Date(deletedAt).toISOString() !== deletedAt || seen.has(environmentId) || pageIds.has(environmentId)) return invalid();
    pageIds.add(environmentId);
    items.push({ environmentId, version, deletedAt });
  }
  return { items, total, totalPages: totalPages as number };
}

/** Replays append-only tombstones. This is not a storage adapter or proof of physical erasure. */
export async function reconcileDeletedEnvironments(options: EnvironmentDeletionReconcileOptions) {
  const scope = Object.freeze({ origin: options.origin, memberId: options.memberId, sessionEpoch: options.sessionEpoch });
  const { signal, isCurrent, fetchPage, removeLocalCopy } = options;
  const assertCurrent = () => {
    if (signal.aborted) throw new ReconciliationError("CANCELLED");
    if (!isCurrent(scope)) throw new ReconciliationError("ACCOUNT_CHANGED");
  };
  const seen = new Set<string>();
  let removed = 0;
  let previousTotal = 0;
  for (let page = 1; ; page += 1) {
    assertCurrent();
    const response = await fetchPage({ ...scope, page, pageSize: PAGE_SIZE, signal });
    assertCurrent();
    // Validate the whole page before any local mutation. Never infer deletion from an empty list.
    const validated = validatePage(response, page, previousTotal, seen);
    previousTotal = validated.total;
    for (const marker of validated.items) {
      assertCurrent();
      await removeLocalCopy({ ...scope, ...marker, signal, assertCurrent });
      assertCurrent();
      seen.add(marker.environmentId);
      removed += 1;
    }
    if (page >= validated.totalPages) return { removed, pages: page, complete: true as const };
  }
}
