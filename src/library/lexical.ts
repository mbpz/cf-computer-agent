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

  const terms = uniqueSearchTerms(normalizedQuery);
  if (terms.length === 0 || terms.length > MAX_QUERY_TERMS) throw invalidSearchQuery();
  return {
    normalizedQuery,
    terms,
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
    tokens.push({ value: foldUnicode61(run.join("")), start, end });
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
  return [...new Set(tokenizeSearchText(value).tokens.map((token) => token.value))];
}

export function isCanonicalSearchTerm(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.normalize("NFKC") === value
    && foldUnicode61(value) === value
    && [...value].every((point) => UNICODE61_BASE.test(point));
}

export function buildSearchMatchQuery(terms: string[]): string {
  return terms.map(quoteFtsTerm).join(" AND ");
}

function appendHanBigrams(run: string[], offset: number, tokens: SearchToken[]): void {
  let hanStart = -1;
  const flush = (end: number): void => {
    if (hanStart < 0) return;
    for (let index = hanStart; index + 1 < end; index += 1) {
      tokens.push({
        value: foldUnicode61(`${run[index]}${run[index + 1]}`),
        start: offset + index,
        end: offset + index + 2,
      });
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

function quoteFtsTerm(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
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
