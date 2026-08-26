import type { RetrievalEvaluationCase } from "../../src/evaluation/retrieval-metrics";

export type M4RetrievalKind = "keyword" | "semantic" | "synonym" | "cross_language" | "code" | "table";
export interface M4RetrievalCase extends RetrievalEvaluationCase { kind: M4RetrievalKind; query: string; }

export const M4_RETRIEVAL_QUERY_SET: readonly M4RetrievalCase[] = Object.freeze([
  { id: "keyword-rollback", kind: "keyword", query: "rollback", relevantIds: ["doc-rollback"] },
  { id: "semantic-latency", kind: "semantic", query: "slow request", relevantIds: ["doc-latency"] },
  { id: "synonym-release", kind: "synonym", query: "ship", relevantIds: ["doc-release"] },
  { id: "cross-language-access", kind: "cross_language", query: "权限", relevantIds: ["doc-access"] },
  { id: "code-identifier", kind: "code", query: "getUserByID", relevantIds: ["doc-code"] },
  { id: "table-budget", kind: "table", query: "budget", relevantIds: ["doc-budget"] },
]);
