import type { CitationCase } from "../../src/evaluation/citation-metrics";

export const M5_CITATION_CASES: readonly CitationCase[] = Object.freeze([
  { id: "supported", outcome: "supported", allowedCitationIds: ["citation-supported"], expectedCitationIds: ["citation-supported"] },
  { id: "partial", outcome: "partial", allowedCitationIds: ["citation-partial"], expectedCitationIds: ["citation-partial"] },
  { id: "conflict", outcome: "conflict", allowedCitationIds: ["citation-conflict-a", "citation-conflict-b"], expectedCitationIds: [] },
  { id: "no-source", outcome: "none", allowedCitationIds: [], expectedCitationIds: [] },
]);
