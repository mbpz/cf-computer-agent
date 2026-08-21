import { AppError } from "../http";

const MAX_QUERY_CODE_POINTS = 200;
const MAX_QUERY_BYTES = 512;
const MAX_QUERY_TERMS = 32;
const encoder = new TextEncoder();
const UNICODE61_BASE = /[\p{L}\p{N}\p{Co}]/u;
const COMBINING_MARK = /\p{M}/u;
const HAN = /\p{Script=Han}/u;

export interface SearchToken {
  value: string;
  key: string;
  start: number;
  end: number;
}

export interface TokenizedSearchText {
  normalizedText: string;
  tokens: SearchToken[];
}

export interface NormalizedSearchQuery {
  normalizedQuery: string;
  matchQuery: string;
  terms: string[];
  termKeys: string[];
}

export function normalizeSearchQuery(query: string): NormalizedSearchQuery {
  if (typeof query !== "string"
    || hasMalformedSurrogate(query)
    || /\p{Cc}/u.test(query)
    || [...query].length > MAX_QUERY_CODE_POINTS
    || encoder.encode(query).byteLength > MAX_QUERY_BYTES) {
    throw invalidSearchQuery();
  }
  const normalizedQuery = query.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (normalizedQuery.length === 0
    || [...normalizedQuery].length > MAX_QUERY_CODE_POINTS
    || encoder.encode(normalizedQuery).byteLength > MAX_QUERY_BYTES) {
    throw invalidSearchQuery();
  }

  const uniqueTokens = uniqueComparisonTokens(normalizedQuery);
  const terms = uniqueTokens.map((token) => token.value);
  const termKeys = uniqueTokens.map((token) => token.key);
  if (terms.length === 0
    || terms.length > MAX_QUERY_TERMS
    || terms.some((term) => !isBoundedSearchToken(term))
    || termKeys.some((key) => !isBoundedSearchToken(key))) {
    throw invalidSearchQuery();
  }
  return {
    normalizedQuery,
    terms,
    termKeys,
    matchQuery: buildSearchMatchQuery(terms),
  };
}

export function tokenizeSearchText(value: string): TokenizedSearchText {
  const normalizedText = value.normalize("NFKC");
  const points = [...normalizedText];
  const tokens: SearchToken[] = [];
  let start = -1;

  const flush = (end: number): void => {
    if (start < 0) return;
    const run = points.slice(start, end);
    tokens.push(makeToken(run.join(""), start, end));
    appendHanBigrams(run, start, tokens);
    start = -1;
  };

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    if (UNICODE61_BASE.test(point) || (start >= 0 && COMBINING_MARK.test(point))) {
      if (start < 0) start = index;
    } else {
      flush(index);
    }
  }
  flush(points.length);
  return { normalizedText, tokens };
}

export function uniqueSearchTerms(value: string): string[] {
  return uniqueComparisonTokens(value).map((token) => token.value);
}

export function isCanonicalSearchTerm(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.normalize("NFKC") === value
    && foldUnicode61(value) === value
    && [...value].every((point) => UNICODE61_BASE.test(point))
    && isBoundedSearchToken(value)
    && isBoundedSearchToken(searchComparisonKey(value));
}

export function buildSearchMatchQuery(terms: string[]): string {
  return terms.map(quoteFtsTerm).join(" AND ");
}

export function searchComparisonKey(value: string): string {
  const folded = foldUnicode61(value);
  return [...folded].map((point) => {
    const upper = point.toUpperCase();
    return [...upper].length === 1 ? upper : point;
  }).join("");
}

function appendHanBigrams(run: string[], offset: number, tokens: SearchToken[]): void {
  let hanStart = -1;
  const flush = (end: number): void => {
    if (hanStart < 0) return;
    for (let index = hanStart; index + 1 < end; index += 1) {
      tokens.push(makeToken(
        `${run[index]}${run[index + 1]}`,
        offset + index,
        offset + index + 2,
      ));
    }
    hanStart = -1;
  };
  for (let index = 0; index < run.length; index += 1) {
    if (HAN.test(run[index]!)) {
      if (hanStart < 0) hanStart = index;
    } else {
      flush(index);
    }
  }
  flush(run.length);
}

function foldUnicode61(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

function makeToken(value: string, start: number, end: number): SearchToken {
  const folded = foldUnicode61(value);
  return { value: folded, key: searchComparisonKey(folded), start, end };
}

function uniqueComparisonTokens(value: string): SearchToken[] {
  const seen = new Set<string>();
  return tokenizeSearchText(value).tokens.filter((token) => {
    if (seen.has(token.key)) return false;
    seen.add(token.key);
    return true;
  });
}

function quoteFtsTerm(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
}

function isBoundedSearchToken(value: string): boolean {
  return [...value].length <= MAX_QUERY_CODE_POINTS
    && encoder.encode(value).byteLength <= MAX_QUERY_BYTES;
}

function hasMalformedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
}

function invalidSearchQuery(): AppError {
  return new AppError("SEARCH_QUERY_INVALID", "Search query is invalid", 400);
}
