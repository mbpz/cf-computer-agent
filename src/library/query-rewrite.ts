import { normalizeSearchQuery } from "./lexical";

export interface SearchQueryRewriteProvider {
  rewrite(query: string): Promise<unknown>;
}

export type SearchQueryRewriteReason = "provider" | "same" | "unavailable" | "provider_error" | "invalid";

export interface SearchQueryRewriteResult {
  query: string;
  rewritten: boolean;
  reason: SearchQueryRewriteReason;
}

export async function rewriteSearchQuery(
  originalQuery: string,
  provider?: SearchQueryRewriteProvider,
): Promise<SearchQueryRewriteResult> {
  const original = normalizeSearchQuery(originalQuery).normalizedQuery;
  if (provider === undefined) return { query: original, rewritten: false, reason: "unavailable" };
  let candidate: unknown;
  try {
    candidate = await provider.rewrite(original);
  } catch {
    return { query: original, rewritten: false, reason: "provider_error" };
  }
  if (typeof candidate !== "string") return { query: original, rewritten: false, reason: "invalid" };
  try {
    const rewritten = normalizeSearchQuery(candidate).normalizedQuery;
    if (rewritten === original) return { query: original, rewritten: false, reason: "same" };
    return { query: rewritten, rewritten: true, reason: "provider" };
  } catch {
    return { query: original, rewritten: false, reason: "invalid" };
  }
}
