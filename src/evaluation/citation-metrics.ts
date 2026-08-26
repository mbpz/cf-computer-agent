export type CitationOutcome = "supported" | "partial" | "conflict" | "none";
export type CitationCase = { id: string; outcome: CitationOutcome; allowedCitationIds: readonly string[]; expectedCitationIds: readonly string[] };
export type CitationObservation = { returnedCitationIds: readonly string[]; locatedCitationIds: readonly string[] };
export type CitationMetrics = { wrongCitations: number; locationMisses: number; refusalFailures: number; cases: number };

export function evaluateCitations(cases: readonly CitationCase[], observations: ReadonlyMap<string, CitationObservation>): CitationMetrics {
  if (cases.length === 0) throw new Error("CITATION_EVALUATION_EMPTY");
  let wrongCitations = 0;
  let locationMisses = 0;
  let refusalFailures = 0;
  for (const item of cases) {
    const observation = observations.get(item.id);
    if (!observation) throw new Error("CITATION_OBSERVATION_MISSING");
    const allowed = new Set(item.allowedCitationIds);
    if (observation.returnedCitationIds.some((id) => !allowed.has(id))) wrongCitations += 1;
    if (item.outcome === "none" || item.outcome === "conflict") {
      if (observation.returnedCitationIds.length > 0) refusalFailures += 1;
    } else if (observation.returnedCitationIds.length === 0) {
      refusalFailures += 1;
    }
    const located = new Set(observation.locatedCitationIds);
    if (observation.returnedCitationIds.some((id) => !located.has(id))) locationMisses += 1;
  }
  return { wrongCitations, locationMisses, refusalFailures, cases: cases.length };
}
