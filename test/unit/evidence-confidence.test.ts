import { describe, expect, it } from "vitest";
import {
  computeEvidenceConfidence,
  evidenceConfidenceFeatures,
  EVIDENCE_CONFIDENCE_THRESHOLD,
} from "../../src/ai/evidence-confidence";
import {
  evidenceHit,
  M1_CORPUS_GROWTH_FIXTURE,
  M1_EVIDENCE_CONFIDENCE_CASES,
} from "../fixtures/m1-evidence-confidence";

describe("corpus-stable evidence confidence", () => {
  it.each(M1_EVIDENCE_CONFIDENCE_CASES)(
    "pins independent feature components and decision for $id",
    ({ query, hits, expected }) => {
      const features = evidenceConfidenceFeatures(query, hits);

      expect(features.termCoverage).toBeCloseTo(expected.termCoverage, 10);
      expect(features.phraseAdjacency).toBeCloseTo(expected.phraseAdjacency, 10);
      expect(features.matchedFieldQuality).toBeCloseTo(expected.matchedFieldQuality, 10);
      expect(features.multiChunkConsistency).toBeCloseTo(expected.multiChunkConsistency, 10);
      expect(computeEvidenceConfidence(query, hits)).toBe(expected.score);
      expect(computeEvidenceConfidence(query, hits) >= EVIDENCE_CONFIDENCE_THRESHOLD)
        .toBe(expected.mayCallAi);
    },
  );

  it("uses the exact weighted formula and rounds only the final score to four decimals", () => {
    const fixture = M1_EVIDENCE_CONFIDENCE_CASES.find(({ id }) => id === "query-stuffing")!;
    const features = evidenceConfidenceFeatures(fixture.query, fixture.hits);
    const independentlyCalculated = 0.45 * features.termCoverage
      + 0.20 * features.phraseAdjacency
      + 0.20 * features.matchedFieldQuality
      + 0.15 * features.multiChunkConsistency;

    expect(independentlyCalculated).toBeCloseTo(0.3416666666666667, 12);
    expect(computeEvidenceConfidence(fixture.query, fixture.hits)).toBe(0.3417);
    expect(EVIDENCE_CONFIDENCE_THRESHOLD).toBe(0.6);
  });

  it("ignores BM25 magnitude and unrelated result growth", () => {
    const { query, authorizedHits, unrelatedHits } = M1_CORPUS_GROWTH_FIXTURE;
    const baseline = computeEvidenceConfidence(query, [...authorizedHits]);
    const scoreMutated = authorizedHits.map((hit, index) => ({
      ...hit,
      score: index === 0 ? -1e-12 : -1e9,
    }));

    expect(computeEvidenceConfidence(query, scoreMutated)).toBe(baseline);
    expect(computeEvidenceConfidence(query, [...authorizedHits, ...unrelatedHits])).toBe(baseline);
  });

  it("keeps unpunctuated Han confidence invariant as unrelated corpus entries grow", () => {
    const {
      hanQuery, hanAuthorizedHits, unrelatedHits,
    } = M1_CORPUS_GROWTH_FIXTURE;
    const baseline = computeEvidenceConfidence(hanQuery, [...hanAuthorizedHits]);

    expect(baseline).toBe(0.7);
    expect(computeEvidenceConfidence(hanQuery, [
      ...hanAuthorizedHits,
      ...unrelatedHits,
    ])).toBe(0.7);
  });

  it("does not let a matched-field label without visible term evidence inflate confidence", () => {
    const forgedLabel = evidenceHit(
      "label-only",
      "Vacation handbook",
      "Directory contacts and holiday policy.",
      ["title", "summary", "tags", "body", "code"],
    );

    expect(evidenceConfidenceFeatures("launch latency", [forgedLabel])).toEqual({
      termCoverage: 0,
      phraseAdjacency: 0,
      matchedFieldQuality: 0,
      multiChunkConsistency: 0,
    });
    expect(computeEvidenceConfidence("launch latency", [forgedLabel])).toBe(0);
  });

  it("deduplicates repeated chunks and items before multi-source consistency", () => {
    const hit = evidenceHit("duplicate", "Launch", "Launch latency is measured.", ["body"]);
    const duplicate = { ...hit, citationId: "citation-duplicate-copy" };

    expect(evidenceConfidenceFeatures("launch latency", [hit, duplicate]).multiChunkConsistency).toBe(0);
  });
});
