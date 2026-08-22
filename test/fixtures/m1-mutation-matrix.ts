export interface M1MutationObservation {
  featureId: string;
  passed: boolean;
  reason: string;
}

export interface M1MutationWitness {
  id: string;
  featureId: string;
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
  if (witnesses.length === 0) throw new Error("M1_MUTATION_WITNESSES_MISSING");
  if (new Set(witnesses.map(({ id }) => id)).size !== witnesses.length) {
    throw new Error("M1_MUTATION_WITNESS_IDS_DUPLICATE");
  }
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
  if (results.length === 0) throw new Error("M1_MUTATION_RESULTS_MISSING");
  for (const result of results) {
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
