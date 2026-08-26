import { tokenizeSearchText } from "../library/lexical";

const MAX_SIMILARITY_TOKENS = 2048;

/** Computes a bounded token-set Jaccard score for advisory duplicate hints. */
export function sourceSimilarity(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) intersection += 1;
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}

function tokenSet(value: string): Set<string> {
  return new Set(tokenizeSearchText(value).tokens.slice(0, MAX_SIMILARITY_TOKENS).map((token) => token.comparisonKey));
}
