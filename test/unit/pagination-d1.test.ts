import { describe, expect, it, vi } from "vitest";
import { queryNumberedPage } from "../../src/pagination-d1";

describe("D1 numbered pagination", () => {
  const request = { page: 2, pageSize: 20 } as const;
  const countStatement = { kind: "count" } as unknown as D1PreparedStatement;
  const rowsStatement = { kind: "rows" } as unknown as D1PreparedStatement;

  it("returns mapped rows and metadata from one paired batch", async () => {
    const batch = vi.fn(async () => [
      d1Result([{ total: 41 }]),
      d1Result([{ id: "row-21", title: "Twenty one" }]),
    ]);
    const db = { batch } as unknown as D1Database;

    const result = await queryNumberedPage(
      db,
      countStatement,
      rowsStatement,
      request,
      (row) => ({ id: String(row.id), label: String(row.title) }),
    );

    expect(result).toEqual({
      items: [{ id: "row-21", label: "Twenty one" }],
      pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
    });
    expect(batch).toHaveBeenCalledWith([countStatement, rowsStatement]);
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { countRows: [] },
    { countRows: [{}] },
    { countRows: [{ total: -1 }] },
    { countRows: [{ total: 1.5 }] },
    { countRows: [{ total: Number.POSITIVE_INFINITY }] },
  ])("rejects malformed count rows $countRows", async ({ countRows }) => {
    const db = {
      batch: vi.fn(async () => [d1Result(countRows), d1Result([])]),
    } as unknown as D1Database;

    await expect(queryNumberedPage(db, countStatement, rowsStatement, request, (row) => row))
      .rejects.toMatchObject({ code: "PAGE_RESULT_INVALID", status: 500 });
  });

  it("propagates a batch failure without returning partial data", async () => {
    const failure = new Error("D1 batch failed");
    const db = {
      batch: vi.fn(async () => { throw failure; }),
    } as unknown as D1Database;

    await expect(queryNumberedPage(db, countStatement, rowsStatement, request, (row) => row))
      .rejects.toBe(failure);
  });
});

function d1Result<T>(results: T[]): D1Result<T> {
  return {
    success: true,
    meta: {},
    results,
  } as D1Result<T>;
}
