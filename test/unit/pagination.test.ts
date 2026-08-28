import { describe, expect, it } from "vitest";
import {
  buildPageMetadata,
  decodeOpaqueCursor,
  decodePageCursor,
  deriveCursorScopeKey,
  encodeOpaqueCursor,
  encodePageCursor,
  pageOffset,
  parseNumberedPageRequest,
  parsePageRequest,
} from "../../src/pagination";

describe("pagination", () => {
  it("parses numbered pagination defaults and exact supported sizes", () => {
    expect(parseNumberedPageRequest(new URL("https://app.test/api/items"), [])).toEqual({ page: 1, pageSize: 20 });
    expect(parseNumberedPageRequest(new URL("https://app.test/api/items?page=3&pageSize=50"), [])).toEqual({ page: 3, pageSize: 50 });
    expect(parseNumberedPageRequest(new URL("https://app.test/api/items?page=2&pageSize=100"), [])).toEqual({ page: 2, pageSize: 100 });
  });

  it("allows each whitelisted filter exactly once", () => {
    expect(parseNumberedPageRequest(
      new URL("https://app.test/api/items?status=active&page=2"),
      ["status"],
    )).toEqual({ page: 2, pageSize: 20 });
  });

  it.each([
    "?page=0",
    "?page=-1",
    "?page=1.5",
    "?page=1e2",
    "?pageSize=10",
    "?pageSize=20.0",
    "?page=1&page=2",
    "?pageSize=20&pageSize=50",
    "?status=active&status=closed",
    "?unknown=1",
    "?page=101&pageSize=100",
  ])("rejects invalid numbered query %s", (query) => {
    expect(() => parseNumberedPageRequest(
      new URL(`https://app.test/api/items${query}`),
      ["status"],
    )).toThrow(expect.objectContaining({ code: "PAGE_INVALID", status: 400 }));
  });

  it("uses the supplied error code for invalid numbered requests", () => {
    expect(() => parseNumberedPageRequest(
      new URL("https://app.test/api/items?page=0"),
      [],
      "ITEM_PAGE_INVALID",
    )).toThrow(expect.objectContaining({ code: "ITEM_PAGE_INVALID", status: 400 }));
  });

  it("enforces the 10,000-row query window", () => {
    expect(pageOffset({ page: 100, pageSize: 100 })).toBe(9_900);
    expect(() => pageOffset({ page: 101, pageSize: 100 }))
      .toThrow(expect.objectContaining({ code: "PAGE_INVALID", status: 400 }));
  });

  it("keeps a requested page beyond the total in metadata", () => {
    expect(buildPageMetadata({ page: 4, pageSize: 20 }, 21)).toEqual({
      page: 4,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    expect(buildPageMetadata({ page: 1, pageSize: 50 }, 0)).toEqual({
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    });
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid metadata total %s", (total) => {
    expect(() => buildPageMetadata({ page: 1, pageSize: 20 }, total))
      .toThrow(expect.objectContaining({ code: "PAGE_RESULT_INVALID", status: 500 }));
  });

  it.each([
    { page: 0, pageSize: 20 },
    { page: 1.5, pageSize: 20 },
    { page: 1, pageSize: 10 },
    { page: 101, pageSize: 100 },
  ])("rejects invalid metadata request $page/$pageSize", (request) => {
    expect(() => buildPageMetadata(request as never, 1))
      .toThrow(expect.objectContaining({ code: "PAGE_INVALID", status: 400 }));
  });

  it("encodes an opaque base64url versioned position cursor", () => {
    const cursor = encodePageCursor({ sort: 12, id: "collection-12" });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain("collection-12");
    expect(decodePageCursor(cursor)).toEqual({ sort: 12, id: "collection-12" });
  });

  it("round-trips Unicode cursor fields with UTF-8", () => {
    const cursor = encodePageCursor({ sort: 12, id: "集合-😀" });

    expect(decodePageCursor(cursor)).toEqual({ sort: 12, id: "集合-😀" });
    expect(decodeOpaqueCursor(encodeOpaqueCursor({ v: 1, id: "集合-😀" }))).toEqual({ v: 1, id: "集合-😀" });
  });

  it.each([
    "",
    "not-a-cursor",
    "a".repeat(513),
    toBase64Url(JSON.stringify({ v: 2, sort: 1, id: "space-1" })),
    toBase64Url(JSON.stringify({ v: 1, sort: 1.5, id: "space-1" })),
    toBase64Url(JSON.stringify({ v: 1, sort: Number.MAX_SAFE_INTEGER + 1, id: "space-1" })),
    toBase64Url(JSON.stringify({ v: 1, sort: 1, id: "" })),
  ])("rejects malformed, oversized, or incompatible cursors", (cursor) => {
    expect(() => decodePageCursor(cursor)).toThrow(expect.objectContaining({ code: "PAGE_CURSOR_INVALID", status: 400 }));
  });

  it.each([-1, 1_000_001])("rejects position cursors outside the application domain", (sort) => {
    const cursor = encodePageCursor({ sort, id: "space-1" });

    expect(() => decodePageCursor(cursor, { minSort: 0, maxSort: 1_000_000 }))
      .toThrow(expect.objectContaining({ code: "PAGE_CURSOR_INVALID", status: 400 }));
  });

  it.each([-1, 8_640_000_000_000_001])("rejects timestamp cursors outside the Date domain", (sort) => {
    const cursor = encodePageCursor({ sort, id: "event-1" });

    expect(() => decodePageCursor(cursor, { minSort: 0, maxSort: 8_640_000_000_000_000 }))
      .toThrow(expect.objectContaining({ code: "PAGE_CURSOR_INVALID", status: 400 }));
  });

  it("rejects base64url encodings with noncanonical pad bits", () => {
    const canonical = encodeOpaqueCursor({ v: 1, id: "a" });
    const alternate = `${canonical.slice(0, -1)}${canonical.at(-1) === "A" ? "B" : "A"}`;

    expect(() => decodeOpaqueCursor(alternate)).toThrow(expect.objectContaining({ code: "PAGE_CURSOR_INVALID", status: 400 }));
  });

  it("defaults pages to 20 and bounds limits at 50", () => {
    expect(parsePageRequest()).toEqual({ limit: 20 });
    expect(parsePageRequest(50, "cursor")).toEqual({ limit: 50, cursor: "cursor" });
    for (const limit of [NaN, 1.5, 0, 51]) {
      expect(() => parsePageRequest(limit)).toThrow(expect.objectContaining({ code: "PAGE_INVALID", status: 400 }));
    }
  });

  it("derives a canonical cryptographic key for cursor scope fields", async () => {
    const first = await deriveCursorScopeKey("active-tags", { spaceId: "space-a", status: "active" });
    const reordered = await deriveCursorScopeKey("active-tags", { status: "active", spaceId: "space-a" });
    const otherSpace = await deriveCursorScopeKey("active-tags", { spaceId: "space-b", status: "active" });

    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(reordered).toBe(first);
    expect(otherSpace).not.toBe(first);
  });
});

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
