import { normalizeSearchQuery, tokenizeSearchText } from "../library/lexical";
import type { SearchHit, SearchMatchedField } from "../library/types";

export const EVIDENCE_CONFIDENCE_THRESHOLD = 0.60;

const FIELD_QUALITY: Readonly<Record<SearchMatchedField, number>> = Object.freeze({
  title: 1,
  tags: 0.75,
  summary: 0.50,
  code: 0.375,
  body: 0.25,
});

export interface EvidenceConfidenceFeatures {
  termCoverage: number;
  phraseAdjacency: number;
  matchedFieldQuality: number;
  multiChunkConsistency: number;
}

interface VisibleHitEvidence {
  hit: SearchHit;
  keys: Set<string>;
  textTokenSequences: string[][];
  exactHanPhrase: boolean;
}

const HAN_POINT = /\p{Script=Han}/u;

export function computeEvidenceConfidence(query: string, hits: readonly SearchHit[]): number {
  const features = evidenceConfidenceFeatures(query, hits);
  const score = clamp01(
    0.45 * features.termCoverage
    + 0.20 * features.phraseAdjacency
    + 0.20 * features.matchedFieldQuality
    + 0.15 * features.multiChunkConsistency,
  );
  return Math.round((score + Number.EPSILON) * 10_000) / 10_000;
}

export function evidenceConfidenceFeatures(
  query: string,
  hits: readonly SearchHit[],
): EvidenceConfidenceFeatures {
  const normalized = normalizeSearchQuery(query);
  const queryKeys = new Set(normalized.termKeys);
  const surfaceSequence = surfaceTokenSequence(normalized.normalizedQuery);
  const visibleHits = Array.isArray(hits)
    ? hits.flatMap((hit) => visibleEvidence(
      hit,
      normalized.normalizedQuery,
      queryKeys,
    ))
    : [];
  const covered = new Set(visibleHits.flatMap(({ keys }) => [...keys]));
  const termCoverage = ratio(covered.size, queryKeys.size);

  let phraseAdjacency = visibleHits.some(({ exactHanPhrase }) => exactHanPhrase) ? 1 : 0;
  if (phraseAdjacency === 0 && surfaceSequence.length === 1) {
    phraseAdjacency = visibleHits.some(({ textTokenSequences }) => (
      textTokenSequences.some((sequence) => sequence.includes(surfaceSequence[0]!))
    )) ? 1 : 0;
  } else if (phraseAdjacency === 0 && surfaceSequence.length > 1) {
    let adjacentPairs = 0;
    for (let index = 0; index + 1 < surfaceSequence.length; index += 1) {
      const left = surfaceSequence[index]!;
      const right = surfaceSequence[index + 1]!;
      if (visibleHits.some(({ textTokenSequences }) => textTokenSequences.some((sequence) => (
        sequence.some((key, keyIndex) => key === left && sequence[keyIndex + 1] === right)
      )))) adjacentPairs += 1;
    }
    phraseAdjacency = ratio(adjacentPairs, surfaceSequence.length - 1);
  }

  const matchedFieldQuality = visibleHits.reduce((best, { hit }) => {
    const quality = Array.isArray(hit.matchedFields)
      ? hit.matchedFields.reduce((fieldBest, field) => (
        isMatchedField(field) ? Math.max(fieldBest, FIELD_QUALITY[field]) : fieldBest
      ), 0)
      : 0;
    return Math.max(best, quality);
  }, 0);

  const fullCoverage = visibleHits.filter(({ keys }) => (
    normalized.termKeys.every((key) => keys.has(key))
  ));
  const chunkIds = new Set(fullCoverage.map(({ hit }) => hit.chunkId).filter(nonEmptyString));
  const itemIds = new Set(fullCoverage.map(({ hit }) => hit.knowledgeItemId).filter(nonEmptyString));
  const multiChunkConsistency = chunkIds.size < 2 ? 0 : itemIds.size < 2 ? 0.5 : 1;

  return {
    termCoverage,
    phraseAdjacency,
    matchedFieldQuality,
    multiChunkConsistency,
  };
}

function visibleEvidence(
  hit: SearchHit,
  normalizedQuery: string,
  queryKeys: ReadonlySet<string>,
): VisibleHitEvidence[] {
  if (!hit || typeof hit !== "object") return [];
  const texts = [hit.title, hit.excerpt].filter((value): value is string => typeof value === "string");
  const textTokenSequences = texts.map(surfaceTokenSequence);
  const keys = new Set(texts.flatMap((text) => tokenizeSearchText(text).tokens
    .map((token) => token.comparisonKey)
    .filter((key) => queryKeys.has(key))));
  const exactHanPhrase = isHanOnly(normalizedQuery) && texts.some((text) => (
    text.normalize("NFKC").includes(normalizedQuery)
  ));
  if (exactHanPhrase) {
    for (const key of queryKeys) keys.add(key);
  }
  return keys.size === 0 ? [] : [{ hit, keys, textTokenSequences, exactHanPhrase }];
}

function surfaceTokenSequence(value: string): string[] {
  const tokens = tokenizeSearchText(value).tokens;
  const seen = new Set<string>();
  return tokens.filter((candidate) => {
    const points = [...candidate.value];
    if (points.every((point) => HAN_POINT.test(point))) return points.length <= 2;
    return !tokens.some((other) => (
      other !== candidate
      && other.start <= candidate.start
      && other.end >= candidate.end
      && (other.start < candidate.start || other.end > candidate.end)
    ));
  }).sort((left, right) => left.start - right.start || right.end - left.end)
    .flatMap((token) => {
      const identity = `${token.start}:${token.end}:${token.comparisonKey}`;
      if (seen.has(identity)) return [];
      seen.add(identity);
      return [token.comparisonKey];
    });
}

function isHanOnly(value: string): boolean {
  const points = [...value];
  return points.length > 0 && points.every((point) => HAN_POINT.test(point));
}

function isMatchedField(value: unknown): value is SearchMatchedField {
  return value === "title" || value === "summary" || value === "tags"
    || value === "body" || value === "code";
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? clamp01(numerator / denominator) : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
