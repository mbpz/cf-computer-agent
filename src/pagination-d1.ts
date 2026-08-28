import { AppError } from "./http";
import { buildPageMetadata, type NumberedPage, type NumberedPageRequest } from "./pagination";

export async function queryNumberedPage<T>(
  db: D1Database,
  countStatement: D1PreparedStatement,
  rowsStatement: D1PreparedStatement,
  request: NumberedPageRequest,
  mapRow: (row: Record<string, unknown>) => T,
): Promise<NumberedPage<T>> {
  const [countResult, rowsResult] = await db.batch<Record<string, unknown>>([
    countStatement,
    rowsStatement,
  ]);
  const countRows: unknown = countResult?.results;
  const selectedRows: unknown = rowsResult?.results;
  if (countResult?.success !== true
    || rowsResult?.success !== true
    || !Array.isArray(countRows)
    || countRows.length !== 1
    || !isRow(countRows[0])
    || !Array.isArray(selectedRows)
    || selectedRows.length > request.pageSize
    || !selectedRows.every(isRow)) {
    throw new AppError("PAGE_RESULT_INVALID", "Pagination query returned an invalid result", 500);
  }
  const total = countRows[0].total;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total < 0) {
    throw new AppError("PAGE_RESULT_INVALID", "Pagination query returned an invalid result", 500);
  }

  return {
    items: selectedRows.map(mapRow),
    pagination: buildPageMetadata(request, total),
  };
}

function isRow(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
