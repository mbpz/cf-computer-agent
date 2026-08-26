import { describe, expect, it } from "vitest";
import { M5_CITATION_CASES } from "../fixtures/m5-citation-cases";
import { evaluateCitations } from "../../src/evaluation/citation-metrics";

describe("citation quality evaluation", () => {
  it("covers supported, partial, conflict, and no-source outcomes", () => {
    const observations = new Map([
      ["supported", { returnedCitationIds: ["citation-supported"], locatedCitationIds: ["citation-supported"] }],
      ["partial", { returnedCitationIds: ["citation-partial"], locatedCitationIds: ["citation-partial"] }],
      ["conflict", { returnedCitationIds: [], locatedCitationIds: [] }],
      ["no-source", { returnedCitationIds: [], locatedCitationIds: [] }],
    ] as const);
    expect(evaluateCitations(M5_CITATION_CASES, observations)).toEqual({ wrongCitations: 0, locationMisses: 0, refusalFailures: 0, cases: 4 });
  });

  it("counts wrong and unlocated citations and unsafe conflict answers", () => {
    const observations = new Map([
      ["supported", { returnedCitationIds: ["other"], locatedCitationIds: [] }],
      ["partial", { returnedCitationIds: ["citation-partial"], locatedCitationIds: [] }],
      ["conflict", { returnedCitationIds: ["citation-conflict-a"], locatedCitationIds: ["citation-conflict-a"] }],
      ["no-source", { returnedCitationIds: [], locatedCitationIds: [] }],
    ] as const);
    expect(evaluateCitations(M5_CITATION_CASES, observations)).toEqual({ wrongCitations: 1, locationMisses: 2, refusalFailures: 1, cases: 4 });
  });
});
