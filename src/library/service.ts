import { AppError } from "../http";
import type { PublishedContentReader } from "../knowledge/types";
import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageRequest } from "../pagination";
import type {
  AuthorizedRevisionRecord,
  LibraryRepositoryPort,
  RepositoryKnowledgePageRequest,
  RepositorySearchRequest,
} from "./repository";
import type {
  CitationSource,
  KnowledgeDetail,
  KnowledgePage,
  KnowledgePageRequest,
  LibraryFilters,
  LibraryScope,
  RevisionDetail,
  SearchPage,
  SearchRequest,
} from "./types";

const MAX_QUERY_CODE_POINTS = 200;
const MAX_QUERY_BYTES = 512;
const MAX_QUERY_TERMS = 32;
const MAX_LOOKUP_ID_CODE_POINTS = 128;
const MAX_LOOKUP_ID_BYTES = 512;
const FILTER_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/u;
const encoder = new TextEncoder();

export interface NormalizedSearchQuery {
  normalizedQuery: string;
  matchQuery: string;
  terms: string[];
}

export interface CitationLookup {
  revisionId: string;
  chunkId: string;
}

export class LibraryService {
  constructor(
    private readonly repository: LibraryRepositoryPort,
    private readonly content: PublishedContentReader,
  ) {}

  async list(scope: LibraryScope, request: KnowledgePageRequest = {}): Promise<KnowledgePage> {
    await this.authorize(scope);
    const filters = normalizeFilters(request);
    const page = parsePageRequest(request.limit, request.cursor);
    const normalized: RepositoryKnowledgePageRequest = {
      ...filters,
      ...page,
      cursorKey: await cursorKey("library-list", scope, { ...filters }),
    };
    return this.repository.list(scope, normalized);
  }

  async detail(scope: LibraryScope, knowledgeItemId: string): Promise<KnowledgeDetail> {
    await this.authorize(scope);
    assertLookupId(knowledgeItemId);
    const record = await this.repository.findCurrent(scope, knowledgeItemId);
    if (!record) throw knowledgeNotFound();
    const currentRevision = await this.readRevision(record);
    return {
      id: record.id,
      spaceId: record.spaceId,
      collectionId: record.collectionId,
      title: record.title,
      tagIds: [...record.tagIds],
      visibility: record.visibility,
      searchStatus: record.searchStatus,
      publishedAt: record.publishedAt,
      updatedAt: record.updatedAt,
      currentRevision,
    };
  }

  async revision(
    scope: LibraryScope,
    knowledgeItemId: string,
    revisionId: string,
  ): Promise<RevisionDetail> {
    await this.authorize(scope);
    assertLookupId(knowledgeItemId);
    assertLookupId(revisionId);
    const record = await this.repository.findRevision(scope, knowledgeItemId, revisionId);
    if (!record) throw knowledgeNotFound();
    return this.readRevision(record);
  }

  async search(scope: LibraryScope, request: SearchRequest): Promise<SearchPage> {
    await this.authorize(scope);
    const filters = normalizeFilters(request);
    const page = parsePageRequest(request.limit, request.cursor);
    const query = normalizeSearchQuery(request.query);
    const normalized: RepositorySearchRequest = {
      ...filters,
      ...page,
      ...query,
      cursorKey: await cursorKey("library-search", scope, {
        ...filters,
        query: query.normalizedQuery,
      }),
    };
    return this.repository.search(scope, normalized);
  }

  async readCitation(scope: LibraryScope, citationId: string): Promise<CitationSource> {
    await this.authorize(scope);
    const lookup = decodeCitationId(citationId);
    const citation = await this.repository.findCitation(
      scope,
      lookup.revisionId,
      lookup.chunkId,
    );
    if (!citation) throw knowledgeNotFound();
    return { ...citation, citationId };
  }

  private async authorize(scope: LibraryScope): Promise<void> {
    if (!isLibraryScope(scope) || !await this.repository.authorizeScope(scope)) {
      throw new AppError("FORBIDDEN", "Knowledge access is not permitted", 403);
    }
  }

  private async readRevision(record: AuthorizedRevisionRecord): Promise<RevisionDetail> {
    // The caller cannot supply either argument: both are loaded by an
    // authorization-scoped D1 query immediately before this read.
    const markdown = await this.content.read(record.normalizedPath, record.contentSha256);
    return {
      id: record.revisionId,
      knowledgeItemId: record.id,
      sourceVersionId: record.sourceVersionId,
      title: record.title,
      tagIds: [...record.tagIds],
      visibility: record.visibility,
      publishedBy: record.publishedBy,
      publishedAt: record.publishedAt,
      isCurrent: record.isCurrent,
      markdown,
      chunks: record.chunks.map((chunk) => ({
        ...chunk,
        headingPath: [...chunk.headingPath],
        citationId: encodeCitationId({ revisionId: record.revisionId, chunkId: chunk.id }),
      })),
    };
  }
}

export function normalizeSearchQuery(query: string): NormalizedSearchQuery {
  if (typeof query !== "string" || hasMalformedSurrogate(query) || hasControlCharacter(query)) {
    throw invalidSearchQuery();
  }
  const normalizedQuery = query.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (normalizedQuery.length === 0
    || [...normalizedQuery].length > MAX_QUERY_CODE_POINTS
    || encoder.encode(normalizedQuery).byteLength > MAX_QUERY_BYTES) {
    throw invalidSearchQuery();
  }

  const lower = normalizedQuery.toLowerCase();
  const lexical = lower.match(/[\p{L}\p{N}_]+/gu) ?? [];
  const terms = unique([...lexical, ...hanBigrams(lower)]);
  if (terms.length === 0 || terms.length > MAX_QUERY_TERMS) throw invalidSearchQuery();
  return {
    normalizedQuery,
    terms,
    matchQuery: terms.map(quoteFtsTerm).join(" AND "),
  };
}

export function encodeCitationId(lookup: CitationLookup): string {
  if (!isLookupId(lookup.revisionId) || !isLookupId(lookup.chunkId)) throw invalidCitation();
  return encodeOpaqueCursor({ v: 1, revisionId: lookup.revisionId, chunkId: lookup.chunkId });
}

export function decodeCitationId(citationId: string): CitationLookup {
  try {
    const decoded = decodeOpaqueCursor(citationId);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const entries = Object.keys(decoded);
    const { v, revisionId, chunkId } = decoded as Record<string, unknown>;
    if (entries.length !== 3 || !entries.includes("v") || !entries.includes("revisionId")
      || !entries.includes("chunkId") || v !== 1 || !isLookupId(revisionId) || !isLookupId(chunkId)) {
      throw new Error();
    }
    return { revisionId, chunkId };
  } catch {
    throw invalidCitation();
  }
}

function normalizeFilters(request: KnowledgePageRequest): LibraryFilters {
  const filters: LibraryFilters = {};
  for (const key of ["spaceId", "collectionId", "tagId"] as const) {
    const value = request[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !FILTER_ID.test(value)) {
      throw new AppError("LIBRARY_REQUEST_INVALID", "Library request is invalid", 400);
    }
    filters[key] = value;
  }
  if ((filters.collectionId !== undefined || filters.tagId !== undefined)
    && filters.spaceId === undefined) {
    throw new AppError("LIBRARY_REQUEST_INVALID", "Collection and tag filters require a Space", 400);
  }
  return filters;
}

async function cursorKey(
  kind: "library-list" | "library-search",
  scope: LibraryScope,
  value: Record<string, unknown>,
): Promise<string> {
  const bytes = encoder.encode(JSON.stringify({ v: 1, kind, memberId: scope.memberId, role: scope.role, ...value }));
  const digest = await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function quoteFtsTerm(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
}

function hanBigrams(value: string): string[] {
  const bigrams: string[] = [];
  let run: string[] = [];
  const flush = (): void => {
    for (let index = 0; index + 1 < run.length; index += 1) {
      bigrams.push(`${run[index]}${run[index + 1]}`);
    }
    run = [];
  };
  for (const character of [...value]) {
    if (/\p{Script=Han}/u.test(character)) run.push(character);
    else flush();
  }
  flush();
  return bigrams;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isLibraryScope(value: LibraryScope): boolean {
  return Boolean(value && typeof value === "object"
    && isLookupId(value.memberId)
    && (value.role === "admin" || value.role === "contributor"));
}

function assertLookupId(value: string): void {
  if (!isLookupId(value)) throw knowledgeNotFound();
}

function isLookupId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
    && !hasMalformedSurrogate(value)
    && !hasControlCharacter(value)
    && [...value].length <= MAX_LOOKUP_ID_CODE_POINTS
    && encoder.encode(value).byteLength <= MAX_LOOKUP_ID_BYTES;
}

function hasControlCharacter(value: string): boolean {
  return /\p{Cc}/u.test(value);
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

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function knowledgeNotFound(): AppError {
  return new AppError("KNOWLEDGE_NOT_FOUND", "Knowledge was not found", 404);
}

function invalidSearchQuery(): AppError {
  return new AppError("SEARCH_QUERY_INVALID", "Search query is invalid", 400);
}

function invalidCitation(): AppError {
  return new AppError("CITATION_INVALID", "Citation identifier is invalid", 400);
}
