import { describe, expect, it } from "vitest";
import { M4_RETRIEVAL_QUERY_SET } from "../fixtures/m4-retrieval-cases";
import { evaluateRetrieval } from "../../src/evaluation/retrieval-metrics";

describe("provider-free retrieval evaluation", () => {
  it("covers the six M4 query kinds and computes deterministic metrics", () => {
    expect(new Set(M4_RETRIEVAL_QUERY_SET.map((item) => item.kind))).toEqual(new Set(["keyword", "semantic", "synonym", "cross_language", "code", "table"]));
    const rankings = new Map(M4_RETRIEVAL_QUERY_SET.map((item) => [item.id, item.relevantIds] as const));
    expect(evaluateRetrieval(M4_RETRIEVAL_QUERY_SET, rankings)).toEqual({ recallAt5: 1, mrr: 1, ndcgAt5: 1, cases: 6 });
  });

  it("penalizes a relevant item outside top five without hiding the denominator", () => {
    const rankings = new Map(M4_RETRIEVAL_QUERY_SET.map((item) => [item.id, item.id === "table-budget" ? ["noise-1", "noise-2", "noise-3", "noise-4", "noise-5", "doc-budget"] : item.relevantIds] as const));
    expect(evaluateRetrieval(M4_RETRIEVAL_QUERY_SET, rankings)).toMatchObject({ cases: 6, recallAt5: 5 / 6, mrr: 5 / 6 });
  });
});
