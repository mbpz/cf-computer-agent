import type { SearchHit, SearchMatchedField } from "../../src/library/types";

export interface EvidenceConfidenceFixture {
  id: string;
  query: string;
  hits: SearchHit[];
  expected: Readonly<{
    termCoverage: number;
    phraseAdjacency: number;
    matchedFieldQuality: number;
    multiChunkConsistency: number;
    score: number;
    mayCallAi: boolean;
  }>;
}

export const M1_EVIDENCE_CONFIDENCE_CASES: readonly EvidenceConfidenceFixture[] = Object.freeze([
  confidenceCase("strong-english-body", "launch latency", [
    hit("strong-en", "Launch review", "Launch latency was caused by a compressed test window.", ["body"]),
  ], [1, 1, 0.25, 0, 0.7, true]),
  confidenceCase("weak-scattered-english", "launch latency", [
    hit("weak-scattered", "General handbook", `launch ${"generic policy ".repeat(20)}latency`, ["body"]),
  ], [1, 0, 0.25, 0, 0.5, false]),
  confidenceCase("strong-chinese-body", "权限治理", [
    hit("strong-zh", "团队手册", "权限治理。权限治理需要双人复核。", ["body"]),
  ], [1, 1, 0.25, 0, 0.7, true]),
  confidenceCase("strong-chinese-unpunctuated", "权限治理", [
    hit("strong-zh-unpunctuated", "团队手册", "权限治理需要复核", ["body"]),
  ], [1, 1, 0.25, 0, 0.7, true]),
  confidenceCase("strong-chinese-middle-of-longer-run", "权限治理", [
    hit("strong-zh-middle", "团队手册", "团队权限治理需要复核", ["body"]),
  ], [1, 1, 0.25, 0, 0.7, true]),
  confidenceCase("weak-chinese-scattered", "权限治理", [
    hit("weak-zh-scattered", "团队手册", "权限管理和治理流程", ["body"]),
  ], [0.5, 0, 0.25, 0, 0.275, false]),
  confidenceCase("partial-chinese-overlap", "权限治理", [
    hit("partial-zh-overlap", "团队手册", "限治理流程", ["body"]),
  ], [0.5, 0.5, 0.25, 0, 0.375, false]),
  confidenceCase("unrelated-chinese-substrings", "权限治理", [
    hit("unrelated-zh-substrings", "团队手册", "权力限制治理", ["body"]),
  ], [0.25, 0, 0.25, 0, 0.1625, false]),
  confidenceCase("strong-chinese-longer-query-run", "权限治理流程", [
    hit("strong-zh-long-query", "团队手册", "团队权限治理流程需要复核", ["body"]),
  ], [1, 1, 0.25, 0, 0.7, true]),
  confidenceCase("strong-code", "getUserByID retry", [
    hit("strong-code", "Identity helper", "getUserByID retry uses bounded exponential backoff.", ["code"]),
  ], [1, 1, 0.375, 0, 0.725, true]),
  confidenceCase("title-only", "launch latency", [
    hit("title-only", "Launch latency", "Generic handbook text.", ["title"]),
  ], [1, 1, 1, 0, 0.85, true]),
  confidenceCase("tag-only", "launch latency", [
    hit("tag-only", "General handbook", "Generic handbook text.", ["tags"]),
  ], [0, 0, 0, 0, 0, false]),
  confidenceCase("two-chunks-one-item", "launch latency", [
    hit("same-item-a", "Launch", "Launch latency has a measured budget.", ["body"], "knowledge-same"),
    hit("same-item-b", "Launch", "Launch latency has a rollback threshold.", ["body"], "knowledge-same"),
  ], [1, 1, 0.25, 0.5, 0.775, true]),
  confidenceCase("two-items-consistent", "launch latency", [
    hit("multi-a", "Launch", "Launch latency has a measured budget.", ["body"], "knowledge-a"),
    hit("multi-b", "Launch", "Launch latency has a rollback threshold.", ["body"], "knowledge-b"),
  ], [1, 1, 0.25, 1, 0.85, true]),
  confidenceCase("exact-threshold", "alpha beta gamma", [
    hit("threshold", "alpha beta", "Unrelated body.", ["title"]),
  ], [2 / 3, 1 / 2, 1, 0, 0.6, true]),
  confidenceCase("below-threshold", "alpha beta gamma", [
    hit("below", "alpha beta", "Unrelated body.", ["tags"]),
  ], [2 / 3, 1 / 2, 0.75, 0, 0.55, false]),
  confidenceCase("query-stuffing", "launch latency quantum entropy", [
    hit("stuffed", "General handbook", "launch latency is mentioned without the other requested concepts.", ["body"]),
  ], [1 / 2, 1 / 3, 0.25, 0, 0.3417, false]),
  confidenceCase("admin-only-elided", "secret rotation", [], [0, 0, 0, 0, 0, false]),
  confidenceCase("disabled-member-elided", "launch latency", [], [0, 0, 0, 0, 0, false]),
  confidenceCase("selected-item-loss", "launch latency", [], [0, 0, 0, 0, 0, false]),
]);

export const M1_CORPUS_GROWTH_FIXTURE = Object.freeze({
  query: "launch latency",
  authorizedHits: Object.freeze([
    hit("growth-strong", "Launch review", "Launch latency has a measured budget.", ["body"]),
  ]),
  unrelatedHits: Object.freeze(Array.from({ length: 24 }, (_, index) => hit(
    `growth-unrelated-${index}`,
    `Vacation handbook ${index}`,
    "Directory contacts and holiday policy.",
    [],
    `unrelated-${index}`,
  ))),
  hiddenHits: Object.freeze([
    hit("growth-hidden", "Secret rotation", "Secret rotation is restricted.", ["title"], "admin-only"),
  ]),
  hanQuery: "权限治理",
  hanAuthorizedHits: Object.freeze([
    hit("growth-strong-han", "团队手册", "团队权限治理需要复核", ["body"]),
  ]),
});

function confidenceCase(
  id: string,
  query: string,
  hits: SearchHit[],
  expected: readonly [number, number, number, number, number, boolean],
): EvidenceConfidenceFixture {
  return Object.freeze({
    id,
    query,
    hits: Object.freeze(hits) as unknown as SearchHit[],
    expected: Object.freeze({
      termCoverage: expected[0],
      phraseAdjacency: expected[1],
      matchedFieldQuality: expected[2],
      multiChunkConsistency: expected[3],
      score: expected[4],
      mayCallAi: expected[5],
    }),
  });
}

export function evidenceHit(
  id: string,
  title: string,
  excerpt: string,
  matchedFields: SearchMatchedField[],
  knowledgeItemId = `knowledge-${id}`,
): SearchHit {
  return hit(id, title, excerpt, matchedFields, knowledgeItemId);
}

function hit(
  id: string,
  title: string,
  excerpt: string,
  matchedFields: SearchMatchedField[],
  knowledgeItemId = `knowledge-${id}`,
): SearchHit {
  return {
    citationId: `citation-${id}`,
    knowledgeItemId,
    spaceId: "default",
    collectionId: null,
    revisionId: `revision-${id}`,
    chunkId: `chunk-${id}`,
    title,
    headingPath: ["Evidence"],
    startLine: 3,
    endLine: 3,
    excerpt,
    matchedFields,
    highlights: [],
    score: -0.000001,
    publishedAt: "2026-08-22T00:00:00.000Z",
  };
}
