import { describe, expect, it } from "vitest";
import { decodePageCursor, encodePageCursor, parsePageRequest } from "../../src/pagination";

describe("pagination", () => {
  it("encodes an opaque base64url versioned position cursor", () => {
    const cursor = encodePageCursor({ sort: 12, id: "collection-12" });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cursor).not.toContain("collection-12");
    expect(decodePageCursor(cursor)).toEqual({ sort: 12, id: "collection-12" });
  });

  it.each([
    "",
    "not-a-cursor",
    "a".repeat(513),
    toBase64Url(JSON.stringify({ v: 2, sort: 1, id: "space-1" })),
    toBase64Url(JSON.stringify({ v: 1, sort: 1.5, id: "space-1" })),
    toBase64Url(JSON.stringify({ v: 1, sort: 1, id: "" })),
  ])("rejects malformed, oversized, or incompatible cursors", (cursor) => {
    expect(() => decodePageCursor(cursor)).toThrow(expect.objectContaining({ code: "PAGE_CURSOR_INVALID", status: 400 }));
  });

  it("defaults pages to 20 and bounds limits at 50", () => {
    expect(parsePageRequest()).toEqual({ limit: 20 });
    expect(parsePageRequest(50, "cursor")).toEqual({ limit: 50, cursor: "cursor" });
    for (const limit of [NaN, 1.5, 0, 51]) {
      expect(() => parsePageRequest(limit)).toThrow(expect.objectContaining({ code: "PAGE_INVALID", status: 400 }));
    }
  });
});

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
