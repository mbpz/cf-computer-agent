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
  const total = countResult?.results?.[0]?.total;
  if (countResult?.success !== true
    || rowsResult?.success !== true
    || !Array.isArray(rowsResult.results)
    || typeof total !== "number"
    || !Number.isSafeInteger(total)
    || total < 0) {
    throw new AppError("PAGE_RESULT_INVALID", "Pagination query returned an invalid result", 500);
  }

  return {
    items: rowsResult.results.map(mapRow),
    pagination: buildPageMetadata(request, total),
  };
}
