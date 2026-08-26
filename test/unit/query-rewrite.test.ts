import { describe, expect, it } from "vitest";
import { rewriteSearchQuery } from "../../src/library/query-rewrite";

describe("bounded search query rewrite", () => {
  it("uses a valid provider rewrite while retaining a normalized contract", async () => {
    const result = await rewriteSearchQuery("  database   backup ", { async rewrite() { return "D1 backup"; } });
    expect(result).toEqual({ query: "D1 backup", rewritten: true, reason: "provider" });
  });

  it.each([
    [undefined, "unavailable"],
    [{ async rewrite() { throw new Error("quota"); } }, "provider_error"],
    [{ async rewrite() { return "\u0000unsafe"; } }, "invalid"],
  ])("falls back to the normalized original query when rewrite is unavailable or unsafe", async (provider, reason) => {
    await expect(rewriteSearchQuery("  database   backup ", provider as never)).resolves.toEqual({ query: "database backup", rewritten: false, reason });
  });

  it("does not call a provider for an invalid original query", async () => {
    let calls = 0;
    await expect(rewriteSearchQuery("\u0000", { async rewrite() { calls += 1; return "safe"; } })).rejects.toMatchObject({ code: "SEARCH_QUERY_INVALID" });
    expect(calls).toBe(0);
  });
});
