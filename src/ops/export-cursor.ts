import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageRequest } from "../pagination";
import { AppError } from "../http";

const EXPORT_CURSOR_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/u;

export interface ExportPageOptions {
  exportId: string;
  category: string;
  snapshotSha256: string;
  limit?: number;
  cursor?: string;
}

export interface ExportPage<T extends { id: string }> {
  items: T[];
  nextCursor?: string;
}

interface ExportCursor {
  v: typeof EXPORT_CURSOR_VERSION;
  exportId: string;
  category: string;
  snapshotSha256: string;
  lastId: string;
}

/**
 * Pages a fixed export snapshot by opaque, scope-bound IDs.
 * Callers must use the same snapshot digest for every page; changing the
 * source between pages is rejected instead of silently skipping records.
 */
export function pageExportRecords<T extends { id: string }>(records: readonly T[], options: ExportPageOptions): ExportPage<T> {
  validateScope(options);
  const page = parsePageRequest(options.limit, options.cursor);
  const sorted = [...records].sort((left, right) => left.id.localeCompare(right.id));
  assertUniqueIds(sorted);
  const cursor = options.cursor === undefined ? undefined : decodeExportCursor(options.cursor, options);
  const after = cursor?.lastId;
  const start = after === undefined ? 0 : sorted.findIndex((record) => record.id > after);
  const offset = start < 0 ? sorted.length : start;
  const items = sorted.slice(offset, offset + page.limit);
  const next = sorted[offset + items.length];
  return {
    items,
    ...(next === undefined ? {} : {
      nextCursor: encodeOpaqueCursor({
        v: EXPORT_CURSOR_VERSION,
        exportId: options.exportId,
        category: options.category,
        snapshotSha256: options.snapshotSha256,
        lastId: items.at(-1)?.id,
      }),
    }),
  };
}

function decodeExportCursor(value: string, options: ExportPageOptions): ExportCursor {
  const decoded = decodeOpaqueCursor(value);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw invalidCursor();
  const cursor = decoded as Record<string, unknown>;
  if (cursor.v !== EXPORT_CURSOR_VERSION
    || cursor.exportId !== options.exportId
    || cursor.category !== options.category
    || cursor.snapshotSha256 !== options.snapshotSha256
    || typeof cursor.lastId !== "string"
    || !isSafeId(cursor.lastId)) throw invalidCursor();
  return cursor as unknown as ExportCursor;
}

function validateScope(options: ExportPageOptions): void {
  if (!isSafeId(options.exportId) || !isSafeId(options.category) || !SHA256.test(options.snapshotSha256)) {
    throw invalidCursor();
  }
}

function assertUniqueIds<T extends { id: string }>(records: readonly T[]): void {
  const ids = records.map((record) => record.id);
  if (ids.some((id) => !isSafeId(id)) || new Set(ids).size !== ids.length) throw invalidCursor();
}

function isSafeId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value);
}

function invalidCursor(): AppError {
  return new AppError("EXPORT_CURSOR_INVALID", "Export cursor is invalid", 400);
}
