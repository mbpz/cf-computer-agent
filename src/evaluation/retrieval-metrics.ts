export type RetrievalEvaluationCase = { id: string; relevantIds: readonly string[] };
export type RetrievalEvaluationResult = { recallAt5: number; mrr: number; ndcgAt5: number; cases: number };

export function evaluateRetrieval(cases: readonly RetrievalEvaluationCase[], rankings: ReadonlyMap<string, readonly string[]>): RetrievalEvaluationResult {
  if (cases.length === 0) throw new Error("RETRIEVAL_EVALUATION_EMPTY");
  let recalled = 0;
  let reciprocalRank = 0;
  let ndcg = 0;
  for (const item of cases) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(item.id) || item.relevantIds.length === 0 || item.relevantIds.length > 50) throw new Error("RETRIEVAL_EVALUATION_CASE_INVALID");
    const expected = new Set(item.relevantIds);
    const ranking = rankings.get(item.id) ?? [];
    const topFive = ranking.slice(0, 5);
    const hits = topFive.filter((id, index) => expected.has(id) && topFive.indexOf(id) === index);
    recalled += hits.length / expected.size;
    const first = topFive.findIndex((id) => expected.has(id));
    if (first >= 0) reciprocalRank += 1 / (first + 1);
    const dcg = hits.reduce((sum, _id, index) => sum + 1 / Math.log2(index + 2), 0);
    const ideal = Math.min(expected.size, 5);
    const idcg = Array.from({ length: ideal }, (_value, index) => 1 / Math.log2(index + 2)).reduce((sum, value) => sum + value, 0);
    ndcg += idcg === 0 ? 0 : dcg / idcg;
  }
  return { recallAt5: recalled / cases.length, mrr: reciprocalRank / cases.length, ndcgAt5: ndcg / cases.length, cases: cases.length };
}
