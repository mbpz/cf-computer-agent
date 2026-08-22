export interface M1MutationObservation {
  featureId: string;
  passed: boolean;
  reason: string;
}

export const REQUIRED_M1_MUTATION_FEATURE_IDS = Object.freeze([
  "fatal-decode", "code-metadata", "governance-metadata-audit", "governance-target",
  "governance-visibility-expansion", "governance-resubmit", "fts-field-title", "fts-field-summary",
  "fts-field-tags", "fts-field-body", "fts-field-code", "current-revision-switch", "index-status",
  "ranking-policy", "matched-fields", "highlights", "revision-metadata", "download-visibility",
  "confidence-refusal", "tag-and", "tag-or", "chat-scope-all", "chat-scope-space",
  "chat-scope-collection", "chat-scope-items", "submission-status-filter", "markdown-sanitization",
  "translation-keys",
] as const);

export type M1MutationFeatureId = typeof REQUIRED_M1_MUTATION_FEATURE_IDS[number];

export interface M1MutationWitness {
  id: M1MutationFeatureId;
  featureId: M1MutationFeatureId;
  baseline: () => Promise<M1MutationObservation>;
  mutant: () => Promise<M1MutationObservation>;
}

export interface M1MutationWitnessResult {
  id: string;
  featureId: string;
  baselineFailures: string[];
  mutantFailures: string[];
  mutantReasons: string[];
}

export function observation(featureId: string, passed: boolean, reason: string): M1MutationObservation {
  return { featureId, passed, reason };
}

export async function runM1MutationWitnesses(
  witnesses: readonly M1MutationWitness[],
): Promise<M1MutationWitnessResult[]> {
  assertExactFeatureIds("M1_MUTATION_WITNESS_IDS", witnesses.map(({ id }) => id));
  if (witnesses.some(({ id, featureId }) => id !== featureId)) throw new Error("M1_MUTATION_WITNESS_FEATURE_ID_MISMATCH");
  return Promise.all(witnesses.map(async (witness) => {
    const [baseline, mutant] = await Promise.all([witness.baseline(), witness.mutant()]);
    return {
      id: witness.id,
      featureId: witness.featureId,
      baselineFailures: baseline.passed ? [] : [baseline.featureId],
      mutantFailures: mutant.passed ? [] : [mutant.featureId],
      mutantReasons: mutant.passed ? [] : [mutant.reason],
    };
  }));
}

export function assertStrictM1MutationResults(results: readonly M1MutationWitnessResult[]): void {
  assertExactFeatureIds("M1_MUTATION_RESULT_IDS", results.map(({ id }) => id));
  for (const result of results) {
    if (result.id !== result.featureId) throw new Error(`${result.id}:M1_MUTATION_RESULT_FEATURE_ID_MISMATCH`);
    if (result.baselineFailures.length !== 0) {
      throw new Error(`${result.id}:BASELINE_FAILED:${result.baselineFailures.join(",")}`);
    }
    if (result.mutantFailures.length !== 1 || result.mutantFailures[0] !== result.featureId) {
      throw new Error(`${result.id}:MUTATION_NOT_ISOLATED:${result.mutantFailures.join(",")}`);
    }
    if (result.mutantReasons.length !== 1 || result.mutantReasons[0]!.length === 0) {
      throw new Error(`${result.id}:MUTATION_REASON_MISSING`);
    }
  }
}

function assertExactFeatureIds(label: string, ids: readonly string[]): void {
  const actual = new Set(ids);
  const required = new Set<string>(REQUIRED_M1_MUTATION_FEATURE_IDS);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
  if (duplicates.length > 0) throw new Error(`${label}_DUPLICATE:${duplicates.join(",")}`);
  const missing = REQUIRED_M1_MUTATION_FEATURE_IDS.filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !required.has(id)).sort();
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`${label}_SET_MISMATCH:missing=${missing.join(",")};extra=${extra.join(",")}`);
  }
}
