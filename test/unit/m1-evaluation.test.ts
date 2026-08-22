import { describe, expect, it } from "vitest";

import {
  assertM1EvaluationGate,
  M1_EVALUATION_CASES,
  runM1Evaluation,
  summarizeM1Evaluation,
  M1_EVIDENCE_CONFIDENCE_CASES,
  M1_ACCEPTANCE_DENOMINATORS,
  M1_LOCAL_ATOM_IDS,
  M1_REMOTE_ATOM_IDS,
} from "../fixtures/m1-evaluation";
import { m1ParserCases } from "../fixtures/m1-parser-cases";
import { EVIDENCE_CONFIDENCE_THRESHOLD } from "../../src/ai/evidence-confidence";

describe("M1 fixed knowledge-loop evaluation", () => {
  it("reports exact nonzero local acceptance denominators and all 24 atom outcomes", () => {
    expect(M1_ACCEPTANCE_DENOMINATORS).toEqual({
      retrievalCases: 24, answerCases: 16, refusalCases: 7,
      denialCases: 1, languageCases: 8, requiredCitations: 16, returnedCitations: 16,
      downloadAuthorizationCases: 8, rankingCases: 4, highlightSafetyCases: 5,
      localAtoms: 23, remoteAtoms: 1,
    });
    expect(Object.values(M1_ACCEPTANCE_DENOMINATORS).every((count) => count > 0)).toBe(true);
    expect(m1ParserCases).toHaveLength(34);
    expect(M1_LOCAL_ATOM_IDS).toHaveLength(23);
    expect(M1_REMOTE_ATOM_IDS).toEqual(["OPS-015"]);
    expect(new Set([...M1_LOCAL_ATOM_IDS, ...M1_REMOTE_ATOM_IDS])).toHaveLength(24);
  });

  it("keeps at least twenty hand-labelled cases across the required risk surfaces", () => {
    const coverage = new Set(M1_EVALUATION_CASES.flatMap((entry) => entry.coverage));

    expect(M1_EVALUATION_CASES.map((entry) => entry.id)).toEqual([
      "english-title",
      "english-body",
      "english-tag",
      "rollback-body",
      "english-normalization",
      "chinese-title",
      "chinese-body",
      "chinese-tag",
      "code-camel",
      "code-constant",
      "code-underscore",
      "code-tag",
      "markdown-title",
      "citation-location",
      "citation-heading",
      "chinese-location",
      "degraded-readable",
      "prompt-injection",
      "inert-source",
      "admin-only-contributor",
      "admin-only-admin",
      "disabled-user",
      "no-result",
      "partial-match-refusal",
    ]);
    for (const required of [
      "chinese",
      "english",
      "code-identifier",
      "title",
      "tag",
      "body",
      "no-result",
      "partial-match-refusal",
      "admin-only",
      "disabled-user",
      "prompt-injection",
      "citation-location",
      "degraded",
    ]) {
      expect(coverage, `missing coverage: ${required}`).toContain(required);
    }
  });

  it("keeps nonzero independently labelled strong and weak confidence denominators", () => {
    const strong = M1_EVIDENCE_CONFIDENCE_CASES.filter(({ expected }) => expected.mayCallAi);
    const weak = M1_EVIDENCE_CONFIDENCE_CASES.filter(({ expected }) => !expected.mayCallAi);

    expect(strong.length).toBeGreaterThan(0);
    expect(weak.length).toBeGreaterThan(0);
    expect(strong.every(({ expected }) => expected.score >= EVIDENCE_CONFIDENCE_THRESHOLD)).toBe(true);
    expect(weak.every(({ expected }) => expected.score < EVIDENCE_CONFIDENCE_THRESHOLD)).toBe(true);
  });

  it("gates recall, exact citations, citation locations, and permission isolation", async () => {
    const report = await runM1Evaluation();

    expect(report.metrics.recallAt5).toBeGreaterThanOrEqual(0.85);
    expect(report.metrics.citationPrecision).toBe(1);
    expect(report.metrics.citationRecall).toBe(1);
    expect(report.metrics.citationLocationRate).toBe(1);
    expect(report.metrics.wrongCitations).toBe(0);
    expect(report.metrics.permissionLeaks).toBe(0);
    expect(report.metrics.expectedRetrievalCitations).toBeGreaterThan(0);
    expect(report.metrics.requiredAnswerCitations).toBeGreaterThan(0);
    expect(report.metrics.returnedCitations).toBeGreaterThan(0);
    expect(report.metrics.answerExpectedCases).toBeGreaterThan(0);
    expect(report.metrics.expectedRefusals).toBeGreaterThan(0);
    expect(report.metrics).toMatchObject({
      expectedRetrievalCitations: 20,
      requiredAnswerCitations: 16,
      returnedCitations: 16,
      answerExpectedCases: 16,
      expectedRefusals: 7,
      expectedOutcomeFailures: 0,
    });
    expect(() => assertM1EvaluationGate(report)).not.toThrow();
  });

  it("requires every answer citation and fails closed when answers disappear", async () => {
    const report = await runM1Evaluation();
    const answerCitationMismatches = M1_EVALUATION_CASES
      .filter((entry) => entry.expectedOutcome === "answer")
      .filter((entry) => {
        const result = report.cases.find((candidate) => candidate.id === entry.id);
        return JSON.stringify(result?.returnedCitationIds) !== JSON.stringify(entry.expectedAnswerCitationIds)
          || JSON.stringify(result?.locatedCitationIds) !== JSON.stringify(entry.expectedAnswerCitationIds);
      })
      .map((entry) => ({
        id: entry.id,
        result: report.cases.find((candidate) => candidate.id === entry.id),
      }));
    expect(answerCitationMismatches).toEqual([]);

    for (const evaluation of M1_EVALUATION_CASES) {
      const result = report.cases.find((entry) => entry.id === evaluation.id);
      expect(result, evaluation.id).toBeDefined();
      if (evaluation.expectedOutcome === "answer") {
        expect(result?.returnedCitationIds, evaluation.id).toEqual(evaluation.expectedAnswerCitationIds);
        expect(result?.locatedCitationIds, evaluation.id).toEqual(evaluation.expectedAnswerCitationIds);
        expect(result?.providerCalled, evaluation.id).toBe(true);
        expect(result?.noEvidence, evaluation.id).toBe(false);
        expect(result?.evidenceConfidence, evaluation.id).toBeGreaterThanOrEqual(EVIDENCE_CONFIDENCE_THRESHOLD);
      } else if (evaluation.expectedOutcome === "refusal") {
        expect(result?.returnedCitationIds, evaluation.id).toEqual([]);
        expect(result?.providerCalled, evaluation.id).toBe(false);
        expect(result?.noEvidence, evaluation.id).toBe(true);
        expect(result?.denied, evaluation.id).toBe(false);
        expect(result?.evidenceConfidence, evaluation.id).toBeLessThan(EVIDENCE_CONFIDENCE_THRESHOLD);
      } else {
        expect(result?.returnedCitationIds, evaluation.id).toEqual([]);
        expect(result?.providerCalled, evaluation.id).toBe(false);
        expect(result?.denied, evaluation.id).toBe(true);
      }
    }

    const zeroAnswerCases = report.cases.map((entry) => ({
      ...entry,
      answer: "",
      noEvidence: true,
      returnedCitationIds: [],
      locatedCitationIds: [],
      wrongCitationIds: [],
    }));
    const zeroAnswerReport = summarizeM1Evaluation(M1_EVALUATION_CASES, zeroAnswerCases);

    expect(zeroAnswerReport.metrics.citationPrecision).toBe(0);
    expect(zeroAnswerReport.metrics.citationRecall).toBe(0);
    expect(zeroAnswerReport.metrics.citationLocationRate).toBe(0);
    expect(() => assertM1EvaluationGate(zeroAnswerReport)).toThrow(/citation (?:precision|recall)/u);

    const emptyReport = summarizeM1Evaluation([], []);
    expect(emptyReport.metrics.recallAt5).toBe(0);
    expect(emptyReport.metrics.citationPrecision).toBe(0);
    expect(emptyReport.metrics.citationRecall).toBe(0);
    expect(emptyReport.metrics.citationLocationRate).toBe(0);
    expect(() => assertM1EvaluationGate(emptyReport)).toThrow(/denominator/u);
  });

  it("records retrieval, degraded, denial, no-evidence, and injection outcomes explicitly", async () => {
    const report = await runM1Evaluation();
    const result = (id: string) => report.cases.find((entry) => entry.id === id);

    expect(result("degraded-readable")).toMatchObject({
      denied: false,
      degraded: true,
      noEvidence: false,
    });
    expect(result("no-result")).toMatchObject({
      denied: false,
      noEvidence: true,
      providerCalled: false,
      retrievedCitationIds: [],
      returnedCitationIds: [],
    });
    expect(result("partial-match-refusal")).toMatchObject({
      denied: false,
      noEvidence: true,
      providerCalled: false,
      retrievedCitationIds: [],
      returnedCitationIds: [],
    });
    expect(result("disabled-user")).toMatchObject({
      denied: true,
      providerCalled: false,
      retrievedCitationIds: [],
      returnedCitationIds: [],
    });
    expect(result("admin-only-contributor")).toMatchObject({
      denied: false,
      providerCalled: false,
      retrievedCitationIds: [],
      returnedCitationIds: [],
    });
    expect(result("prompt-injection")).toMatchObject({
      denied: false,
      noEvidence: false,
      providerCalled: true,
    });
    expect(result("prompt-injection")?.answer).not.toMatch(/EXFILTRATE|SYSTEM_OVERRIDE/u);
  });

  it("makes Tag-labelled cases fail recall and per-case gates when Tag indexing is removed", async () => {
    const report = await runM1Evaluation({ includeTags: false });
    const tagCaseIds = M1_EVALUATION_CASES
      .filter((entry) => entry.coverage.includes("tag"))
      .map((entry) => entry.id);

    expect(tagCaseIds).toEqual([
      "english-tag",
      "english-normalization",
      "chinese-tag",
      "code-tag",
    ]);
    for (const id of tagCaseIds) {
      expect(report.cases.find((entry) => entry.id === id)).toMatchObject({
        retrievedCitationIds: [],
        returnedCitationIds: [],
        providerCalled: false,
        noEvidence: true,
      });
    }
    expect(report.metrics.recallAt5).toBeLessThan(0.85);
    expect(report.metrics.expectedOutcomeFailures).toBe(tagCaseIds.length);
    expect(() => assertM1EvaluationGate(report)).toThrow(/retrieval recall/u);
  });
});
