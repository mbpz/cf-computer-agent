import { tokenizeSearchText } from "./lexical";
import type { SearchHighlightRange, SearchMatchedField } from "./types";

export const SEARCH_POLICY_VERSION = 2;

export const SEARCH_POLICY = Object.freeze({
  version: SEARCH_POLICY_VERSION,
  weights: Object.freeze({ title: 8, summary: 4, tags: 6, body: 1, code: 3 }),
  maxTags: 8,
  maxHighlights: 8,
});

const MAX_EXCERPT_CODE_POINTS = 240;
const MATCHED_FIELD_ORDER: readonly SearchMatchedField[] = ["title", "summary", "tags", "body", "code"];

export interface SearchPresentation {
  excerpt: string;
  matchedFields: SearchMatchedField[];
  highlights: SearchHighlightRange[];
}

export function buildSearchPresentation(
  body: string,
  termKeys: readonly string[],
  fieldEvidence: readonly unknown[],
): SearchPresentation {
  const inert = body.normalize("NFKC").replace(/\p{Cc}/gu, " ").replace(/\s+/gu, " ").trim();
  const full = tokenizeSearchText(inert);
  const keySet = new Set(termKeys);
  let anchorMatch: (typeof full.tokens)[number] | undefined;
  for (let index = termKeys.length - 1; index >= 0 && anchorMatch === undefined; index -= 1) {
    anchorMatch = full.tokens.find((token) => token.comparisonKey === termKeys[index]);
  }
  const points = [...full.normalizedText];
  let start = 0;
  let end = points.length;
  if (points.length > MAX_EXCERPT_CODE_POINTS) {
    const anchor = anchorMatch?.start ?? 0;
    start = Math.max(0, anchor - 59);
    const prefixLength = start > 0 ? 1 : 0;
    const provisionalSuffixLength = start + MAX_EXCERPT_CODE_POINTS - prefixLength < points.length ? 1 : 0;
    const contentBudget = MAX_EXCERPT_CODE_POINTS - prefixLength - provisionalSuffixLength;
    if (start + contentBudget > points.length) start = Math.max(0, points.length - contentBudget);
    end = Math.min(points.length, start + contentBudget);
  }
  const hasPrefix = start > 0;
  const excerpt = `${hasPrefix ? "…" : ""}${points.slice(start, end).join("")}${end < points.length ? "…" : ""}`;
  const highlightCandidates = full.tokens
    .filter((token) => keySet.has(token.comparisonKey) && token.start >= start && token.end <= end)
    .map((token) => ({
      start: token.start - start + (hasPrefix ? 1 : 0),
      end: token.end - start + (hasPrefix ? 1 : 0),
    }))
    .sort((left, right) => left.start - right.start || right.end - left.end);

  return {
    excerpt,
    matchedFields: MATCHED_FIELD_ORDER.filter((field) => fieldEvidence.includes(field)),
    highlights: mergeRanges(highlightCandidates).slice(0, SEARCH_POLICY.maxHighlights),
  };
}

function mergeRanges(ranges: SearchHighlightRange[]): SearchHighlightRange[] {
  const merged: SearchHighlightRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start < previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else if (!previous || previous.start !== range.start || previous.end !== range.end) {
      merged.push({ ...range });
    }
  }
  return merged;
}
