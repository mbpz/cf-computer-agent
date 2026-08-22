import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageRequest, type PageRequest } from "../pagination";
import type { KnowledgeVisibility, SearchStatus } from "../publication/types";
import { MAX_REVISION_CHUNKS } from "../sources/limits";
import {
  buildSearchMatchQuery,
  isCanonicalSearchTerm,
  searchComparisonKey,
  searchFtsEquivalenceKey,
} from "./lexical";
import { buildSearchPresentation, SEARCH_POLICY } from "./search-policy";
import type {
  CitationSource,
  KnowledgeListItem,
  KnowledgePage,
  LibraryFilters,
  LibraryScope,
  SearchHit,
  SearchPage,
} from "./types";

const CURSOR_KEY = /^[a-f0-9]{64}$/u;
const SEARCH_BM25_WEIGHTS_SQL = [
  0,
  SEARCH_POLICY.weights.title,
  SEARCH_POLICY.weights.summary,
  SEARCH_POLICY.weights.tags,
  SEARCH_POLICY.weights.body,
  SEARCH_POLICY.weights.code,
].map((weight) => weight.toFixed(1)).join(", ");
const visibleSearchStatusSql = `CASE
  WHEN current_index_job.state = 'failed_terminal' THEN 'failed'
  WHEN current_index_job.state = 'failed_retryable' THEN 'search_degraded'
  WHEN current_index_job.state IN ('pending', 'running') THEN 'pending'
  WHEN current_index_job.state = 'completed' AND k.search_status = 'indexed' THEN 'indexed'
  ELSE k.search_status
END`;

export interface RepositoryKnowledgePageRequest extends PageRequest, LibraryFilters {
  cursorKey: string;
}

export interface RepositorySearchRequest extends RepositoryKnowledgePageRequest {
  normalizedQuery: string;
  matchQuery: string;
  terms: string[];
  termKeys: string[];
  tagIds?: string[];
  tagMode?: "and" | "or";
  policyVersion: number;
}

export interface AuthorizedRevisionChunk {
  id: string;
  ordinal: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
}

export interface AuthorizedRevisionRecord {
  id: string;
  spaceId: string;
  collectionId: string | null;
  status: "active";
  searchStatus: SearchStatus;
  updatedAt: string;
  revisionId: string;
  sourceVersionId: string;
  title: string;
  tagIds: string[];
  visibility: KnowledgeVisibility;
  publishedBy: string;
  publishedAt: string;
  normalizedPath: string;
  contentSha256: string;
  isCurrent: boolean;
  chunks: AuthorizedRevisionChunk[];
}

export type AuthorizedCitationRecord = Omit<CitationSource, "citationId">;

export interface LibraryRepositoryPort {
  authorizeScope(scope: LibraryScope): Promise<boolean>;
  list(scope: LibraryScope, request: RepositoryKnowledgePageRequest): Promise<KnowledgePage>;
  findCurrent(scope: LibraryScope, knowledgeItemId: string): Promise<AuthorizedRevisionRecord | null>;
  findRevision(
    scope: LibraryScope,
    knowledgeItemId: string,
    revisionId: string,
  ): Promise<AuthorizedRevisionRecord | null>;
  search(scope: LibraryScope, request: RepositorySearchRequest): Promise<SearchPage>;
  findCitation(
    scope: LibraryScope,
    revisionId: string,
    chunkId: string,
  ): Promise<AuthorizedCitationRecord | null>;
}

type KnowledgeRow = {
  id: string;
  space_id: string;
  collection_id: string | null;
  revision_id: string;
  title: string;
  tags_json: string;
  visibility: KnowledgeVisibility;
  search_status: SearchStatus;
  published_at: string;
  updated_at: string;
};

type RevisionRow = KnowledgeRow & {
  source_version_id: string;
  normalized_path: string;
  content_sha256: string;
  published_by: string;
  current_revision_id: string;
  chunk_id: string | null;
  ordinal: number | null;
  heading_path: string | null;
  start_line: number | null;
  end_line: number | null;
};

type SearchRow = {
  knowledge_item_id: string;
  space_id: string;
  collection_id: string | null;
  revision_id: string;
  chunk_id: string;
  title: string;
  heading_path: string;
  start_line: number;
  end_line: number;
  body: string;
  published_at: string;
  score: number;
  match_title: number;
  match_summary: number;
  match_tags: number;
  match_body: number;
  match_code: number;
};

type CitationRow = {
  knowledge_item_id: string;
  revision_id: string;
  chunk_id: string;
  title: string;
  heading_path: string;
  start_line: number;
  end_line: number;
  body: string;
  published_at: string;
};

interface ListCursor {
  updatedAt: string;
  id: string;
}

interface SearchCursor {
  score: number;
  publishedAt: string;
  knowledgeItemId: string;
  revisionId: string;
  chunkId: string;
}

export class LibraryRepository implements LibraryRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async authorizeScope(scope: LibraryScope): Promise<boolean> {
    const row = await this.db.prepare(
      "SELECT 1 AS authorized FROM members WHERE id = ? AND role = ? AND status = 'active' LIMIT 1",
    ).bind(scope.memberId, scope.role).first<{ authorized: number }>();
    return row?.authorized === 1;
  }

  async list(scope: LibraryScope, request: RepositoryKnowledgePageRequest): Promise<KnowledgePage> {
    assertRepositoryPageRequest(request);
    const cursor = request.cursor === undefined
      ? undefined
      : decodeListCursor(request.cursor, request.cursorKey);
    const filters = filterSql(request, "k", "r");
    const cursorSql = cursor === undefined ? "" : `
      AND (k.updated_at < ? OR (k.updated_at = ? AND k.id < ?))`;
    const cursorBindings = cursor === undefined ? [] : [cursor.updatedAt, cursor.updatedAt, cursor.id];
    const rows = await this.db.prepare(
      `WITH authorized_member AS (
         SELECT role FROM members WHERE id = ? AND role = ? AND status = 'active'
       )
       SELECT k.id, k.space_id, k.collection_id, r.id AS revision_id, r.title, r.tags_json,
         r.visibility, ${visibleSearchStatusSql} AS search_status, r.published_at, k.updated_at
       FROM authorized_member am
       JOIN knowledge_items k
       JOIN revisions r ON r.id = k.current_revision_id
       LEFT JOIN jobs current_index_job
         ON current_index_job.kind = 'index_revision' AND current_index_job.resource_id = k.current_revision_id
       JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
       WHERE k.status = 'active'
         AND (r.visibility = 'shared' OR am.role = 'admin')
         ${filters.sql}${cursorSql}
       ORDER BY k.updated_at DESC, k.id DESC
       LIMIT ?`,
    ).bind(
      scope.memberId,
      scope.role,
      ...filters.bindings,
      ...cursorBindings,
      request.limit + 1,
    ).all<KnowledgeRow>();
    const items = rows.results.slice(0, request.limit).map(mapKnowledge);
    const last = items.at(-1);
    return {
      items,
      ...(rows.results.length > request.limit && last ? {
        nextCursor: encodeOpaqueCursor({
          v: 1,
          updatedAt: last.updatedAt,
          id: last.id,
          key: request.cursorKey,
        }),
      } : {}),
    };
  }

  findCurrent(scope: LibraryScope, knowledgeItemId: string): Promise<AuthorizedRevisionRecord | null> {
    return this.findAuthorizedRevision(scope, knowledgeItemId, undefined);
  }

  findRevision(
    scope: LibraryScope,
    knowledgeItemId: string,
    revisionId: string,
  ): Promise<AuthorizedRevisionRecord | null> {
    return this.findAuthorizedRevision(scope, knowledgeItemId, revisionId);
  }

  async search(scope: LibraryScope, request: RepositorySearchRequest): Promise<SearchPage> {
    assertRepositorySearchRequest(request);
    const cursor = request.cursor === undefined
      ? undefined
      : decodeSearchCursor(request.cursor, request.cursorKey);
    const filters = searchFilterSql(request, "k", "r");
    const cursorSql = cursor === undefined ? "" : `
       WHERE score > ?
          OR (score = ? AND published_at < ?)
          OR (score = ? AND published_at = ? AND knowledge_item_id > ?)
          OR (score = ? AND published_at = ? AND knowledge_item_id = ? AND revision_id > ?)
          OR (score = ? AND published_at = ? AND knowledge_item_id = ? AND revision_id = ? AND chunk_id > ?)`;
    const cursorBindings = cursor === undefined ? [] : [
      cursor.score,
      cursor.score,
      cursor.publishedAt,
      cursor.score,
      cursor.publishedAt,
      cursor.knowledgeItemId,
      cursor.score,
      cursor.publishedAt,
      cursor.knowledgeItemId,
      cursor.revisionId,
      cursor.score,
      cursor.publishedAt,
      cursor.knowledgeItemId,
      cursor.revisionId,
      cursor.chunkId,
    ];
    const rows = await this.db.prepare(
      `WITH authorized_member AS (
         SELECT role FROM members WHERE id = ? AND role = ? AND status = 'active'
       ), ranked AS (
         SELECT k.id AS knowledge_item_id, k.space_id, k.collection_id,
           r.id AS revision_id, c.id AS chunk_id, r.title, c.heading_path,
           c.start_line, c.end_line, c.body, r.published_at,
           bm25(chunks_fts, ${SEARCH_BM25_WEIGHTS_SQL}) AS score,
           instr(highlight(chunks_fts, 1, char(1), char(2)), char(1)) > 0 AS match_title,
           instr(highlight(chunks_fts, 2, char(1), char(2)), char(1)) > 0 AS match_summary,
           instr(highlight(chunks_fts, 3, char(1), char(2)), char(1)) > 0 AS match_tags,
           instr(highlight(chunks_fts, 4, char(1), char(2)), char(1)) > 0 AS match_body,
           instr(highlight(chunks_fts, 5, char(1), char(2)), char(1)) > 0 AS match_code
         FROM chunks_fts
         JOIN chunks c ON c.rowid = chunks_fts.rowid AND c.id = chunks_fts.chunk_id
         JOIN revisions r ON r.id = c.revision_id
         JOIN knowledge_items k ON k.id = r.knowledge_item_id AND k.current_revision_id = r.id
         JOIN jobs current_index_job
           ON current_index_job.kind = 'index_revision'
             AND current_index_job.resource_id = r.id AND current_index_job.state = 'completed'
         JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
         CROSS JOIN authorized_member am
         WHERE chunks_fts MATCH ?
           AND k.status = 'active' AND k.search_status = 'indexed'
           AND (r.visibility = 'shared' OR am.role = 'admin')
           ${filters.sql}
       )
       SELECT * FROM ranked${cursorSql}
       ORDER BY score ASC, published_at DESC, knowledge_item_id ASC, revision_id ASC, chunk_id ASC
       LIMIT ?`,
    ).bind(
      scope.memberId,
      scope.role,
      request.matchQuery,
      ...filters.bindings,
      ...cursorBindings,
      request.limit + 1,
    ).all<SearchRow>();
    const items = rows.results.slice(0, request.limit).map((row) => mapSearchHit(row, request.termKeys));
    const last = rows.results.slice(0, request.limit).at(-1);
    const degraded = await this.hasDegraded(scope, request);
    return {
      items,
      degraded,
      ...(rows.results.length > request.limit && last ? {
        nextCursor: encodeOpaqueCursor({
          v: 2,
          score: last.score,
          publishedAt: last.published_at,
          knowledgeItemId: last.knowledge_item_id,
          revisionId: last.revision_id,
          chunkId: last.chunk_id,
          policyVersion: SEARCH_POLICY.version,
          key: request.cursorKey,
        }),
      } : {}),
    };
  }

  async findCitation(
    scope: LibraryScope,
    revisionId: string,
    chunkId: string,
  ): Promise<AuthorizedCitationRecord | null> {
    const row = await this.db.prepare(
      `WITH authorized_member AS (
         SELECT role FROM members WHERE id = ? AND role = ? AND status = 'active'
       )
       SELECT k.id AS knowledge_item_id, r.id AS revision_id, c.id AS chunk_id,
         r.title, c.heading_path, c.start_line, c.end_line, c.body, r.published_at
       FROM authorized_member am
       JOIN revisions r ON r.id = ?
       JOIN knowledge_items k ON k.id = r.knowledge_item_id
       JOIN revisions current_revision ON current_revision.id = k.current_revision_id
       JOIN chunks c ON c.revision_id = r.id AND c.id = ?
       JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
       WHERE k.status = 'active'
         AND (r.visibility = 'shared' OR am.role = 'admin')
       LIMIT 1`,
    ).bind(scope.memberId, scope.role, revisionId, chunkId).first<CitationRow>();
    return row ? {
      knowledgeItemId: row.knowledge_item_id,
      revisionId: row.revision_id,
      chunkId: row.chunk_id,
      title: row.title,
      headingPath: parseStringArray(row.heading_path),
      startLine: row.start_line,
      endLine: row.end_line,
      body: row.body,
      publishedAt: row.published_at,
    } : null;
  }

  private async findAuthorizedRevision(
    scope: LibraryScope,
    knowledgeItemId: string,
    revisionId: string | undefined,
  ): Promise<AuthorizedRevisionRecord | null> {
    const requestedRevision = revisionId === undefined
      ? "r.id = k.current_revision_id"
      : "r.id = ? AND r.knowledge_item_id = k.id";
    const revisionBinding = revisionId === undefined ? [] : [revisionId];
    const rows = await this.db.prepare(
      `WITH authorized_member AS (
         SELECT role FROM members WHERE id = ? AND role = ? AND status = 'active'
       )
       SELECT k.id, k.space_id, k.collection_id, k.status,
         ${visibleSearchStatusSql} AS search_status, k.updated_at,
         k.current_revision_id, r.id AS revision_id, r.source_version_id, r.normalized_path,
         r.content_sha256, r.title, r.tags_json, r.visibility, r.published_by, r.published_at,
         c.id AS chunk_id, c.ordinal, c.heading_path, c.start_line, c.end_line
       FROM authorized_member am
       JOIN knowledge_items k
       JOIN revisions current_revision ON current_revision.id = k.current_revision_id
       LEFT JOIN jobs current_index_job
         ON current_index_job.kind = 'index_revision' AND current_index_job.resource_id = k.current_revision_id
       JOIN revisions r ON ${requestedRevision}
       JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
       LEFT JOIN chunks c ON c.revision_id = r.id
       WHERE k.id = ? AND k.status = 'active'
         AND (r.visibility = 'shared' OR am.role = 'admin')
       ORDER BY c.ordinal ASC
       LIMIT ?`,
    ).bind(
      scope.memberId,
      scope.role,
      ...revisionBinding,
      knowledgeItemId,
      MAX_REVISION_CHUNKS + 1,
    ).all<RevisionRow>();
    if (rows.results.length === 0) return null;
    if (rows.results.length > MAX_REVISION_CHUNKS) throw invalidKnowledgeData();
    const first = rows.results[0]!;
    if (first.chunk_id === null) throw invalidKnowledgeData();
    return {
      id: first.id,
      spaceId: first.space_id,
      collectionId: first.collection_id,
      status: "active",
      searchStatus: first.search_status,
      updatedAt: first.updated_at,
      revisionId: first.revision_id,
      sourceVersionId: first.source_version_id,
      title: first.title,
      tagIds: parseStringArray(first.tags_json),
      visibility: first.visibility,
      publishedBy: first.published_by,
      publishedAt: first.published_at,
      normalizedPath: first.normalized_path,
      contentSha256: first.content_sha256,
      isCurrent: first.current_revision_id === first.revision_id,
      chunks: rows.results.flatMap((row) => row.chunk_id === null ? [] : [{
        id: row.chunk_id,
        ordinal: requireInteger(row.ordinal),
        headingPath: parseStringArray(requireString(row.heading_path)),
        startLine: requireInteger(row.start_line),
        endLine: requireInteger(row.end_line),
      }]),
    };
  }

  private async hasDegraded(
    scope: LibraryScope,
    filters: LibraryFilters & Partial<Pick<RepositorySearchRequest, "tagIds" | "tagMode">>,
  ): Promise<boolean> {
    const selected = searchFilterSql(filters, "k", "r");
    const row = await this.db.prepare(
      `WITH authorized_member AS (
         SELECT role FROM members WHERE id = ? AND role = ? AND status = 'active'
       )
       SELECT 1 AS degraded
       FROM authorized_member am
       JOIN knowledge_items k
       JOIN revisions r ON r.id = k.current_revision_id
       JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
       WHERE k.status = 'active' AND k.search_status = 'search_degraded'
         AND (r.visibility = 'shared' OR am.role = 'admin')
         ${selected.sql}
       LIMIT 1`,
    ).bind(scope.memberId, scope.role, ...selected.bindings).first<{ degraded: number }>();
    return row?.degraded === 1;
  }
}

function searchFilterSql(
  filters: LibraryFilters & Partial<Pick<RepositorySearchRequest, "tagIds" | "tagMode">>,
  itemAlias: string,
  revisionAlias: string,
): { sql: string; bindings: Array<string | number> } {
  const base = filterSql(filters, itemAlias, revisionAlias);
  if (!filters.tagIds || !filters.tagMode || filters.tagIds.length === 0 || filters.spaceId === undefined) {
    return base;
  }
  const placeholders = filters.tagIds.map(() => "?").join(", ");
  const requestedRows = filters.tagIds.map((_, index) => (
    index === 0 ? "SELECT ? AS id" : "SELECT ?"
  )).join(" UNION ALL ");
  const validTags = `NOT EXISTS (
    SELECT 1 FROM (${requestedRows}) requested_tag
    LEFT JOIN tags active_tag
      ON active_tag.id = requested_tag.id
        AND active_tag.space_id = ? AND active_tag.status = 'active'
    WHERE active_tag.id IS NULL
  )`;
  const membership = filters.tagMode === "or" ? `EXISTS (
    SELECT 1 FROM revision_tags selected_tag
    WHERE selected_tag.revision_id = ${revisionAlias}.id
      AND selected_tag.tag_id IN (${placeholders})
  )` : `${revisionAlias}.id IN (
    SELECT selected_tag.revision_id FROM revision_tags selected_tag
    WHERE selected_tag.tag_id IN (${placeholders})
    GROUP BY selected_tag.revision_id
    HAVING count(DISTINCT selected_tag.tag_id) = ?
  )`;
  return {
    sql: `${base.sql} AND ${validTags} AND ${membership}`,
    bindings: [
      ...base.bindings,
      ...filters.tagIds,
      filters.spaceId,
      ...filters.tagIds,
      ...(filters.tagMode === "and" ? [filters.tagIds.length] : []),
    ],
  };
}

function filterSql(filters: LibraryFilters, itemAlias: string, revisionAlias: string): {
  sql: string;
  bindings: string[];
} {
  const clauses: string[] = [];
  const bindings: string[] = [];
  if (filters.spaceId !== undefined) {
    clauses.push(`${itemAlias}.space_id = ?`);
    bindings.push(filters.spaceId);
  }
  if (filters.collectionId !== undefined) {
    clauses.push(`${itemAlias}.collection_id = ?`);
    bindings.push(filters.collectionId);
    clauses.push(`EXISTS (
      SELECT 1 FROM collections selected_collection
      WHERE selected_collection.id = ?
        AND selected_collection.space_id = ${itemAlias}.space_id
        AND selected_collection.status = 'active'
    )`);
    bindings.push(filters.collectionId);
  }
  if (filters.tagId !== undefined) {
    clauses.push(`EXISTS (
      SELECT 1 FROM revision_tags selected_tag
      WHERE selected_tag.revision_id = ${revisionAlias}.id AND selected_tag.tag_id = ?
    )`);
    bindings.push(filters.tagId);
  }
  return {
    sql: clauses.length === 0 ? "" : `AND ${clauses.join(" AND ")}`,
    bindings,
  };
}

function mapKnowledge(row: KnowledgeRow): KnowledgeListItem {
  return {
    id: row.id,
    spaceId: row.space_id,
    collectionId: row.collection_id,
    revisionId: row.revision_id,
    title: row.title,
    tagIds: parseStringArray(row.tags_json),
    visibility: row.visibility,
    searchStatus: row.search_status,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function mapSearchHit(row: SearchRow, termKeys: string[]): SearchHit {
  const presentation = buildSearchPresentation(row.body, termKeys, [
    ...(row.match_title === 1 ? ["title"] : []),
    ...(row.match_summary === 1 ? ["summary"] : []),
    ...(row.match_tags === 1 ? ["tags"] : []),
    ...(row.match_body === 1 ? ["body"] : []),
    ...(row.match_code === 1 ? ["code"] : []),
  ]);
  return {
    citationId: encodeCitationKey(row.revision_id, row.chunk_id),
    knowledgeItemId: row.knowledge_item_id,
    spaceId: row.space_id,
    collectionId: row.collection_id,
    revisionId: row.revision_id,
    chunkId: row.chunk_id,
    title: row.title,
    headingPath: parseStringArray(row.heading_path),
    startLine: row.start_line,
    endLine: row.end_line,
    ...presentation,
    score: row.score,
    publishedAt: row.published_at,
  };
}

function decodeListCursor(cursor: string, key: string): ListCursor {
  try {
    const decoded = decodeOpaqueCursor(cursor);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const record = decoded as Record<string, unknown>;
    if (Object.keys(record).length !== 4 || record.v !== 1 || record.key !== key
      || typeof record.updatedAt !== "string" || !isCanonicalTimestamp(record.updatedAt)
      || typeof record.id !== "string" || record.id.length === 0) throw new Error();
    return { updatedAt: record.updatedAt, id: record.id };
  } catch {
    throw invalidPageCursor();
  }
}

function decodeSearchCursor(cursor: string, key: string): SearchCursor {
  try {
    const decoded = decodeOpaqueCursor(cursor);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const record = decoded as Record<string, unknown>;
    if (Object.keys(record).length !== 8 || record.v !== 2 || record.policyVersion !== SEARCH_POLICY.version
      || record.key !== key
      || typeof record.score !== "number" || !Number.isFinite(record.score)
      || typeof record.publishedAt !== "string" || !isCanonicalTimestamp(record.publishedAt)
      || typeof record.knowledgeItemId !== "string" || record.knowledgeItemId.length === 0
      || typeof record.revisionId !== "string" || record.revisionId.length === 0
      || typeof record.chunkId !== "string" || record.chunkId.length === 0) throw new Error();
    return {
      score: record.score,
      publishedAt: record.publishedAt,
      knowledgeItemId: record.knowledgeItemId,
      revisionId: record.revisionId,
      chunkId: record.chunkId,
    };
  } catch {
    throw invalidPageCursor();
  }
}

function assertRepositorySearchRequest(request: RepositorySearchRequest): void {
  assertRepositoryPageRequest(request);
  if (request.policyVersion !== SEARCH_POLICY.version
    || !Array.isArray(request.terms)
    || !Array.isArray(request.termKeys)
    || request.terms.length < 1
    || request.terms.length > 32
    || request.termKeys.length !== request.terms.length
    || request.terms.some((term) => !isCanonicalSearchTerm(term))) {
    throw new AppError("SEARCH_QUERY_INVALID", "Search query is invalid", 400);
  }
  const ftsKeys = request.terms.map(searchFtsEquivalenceKey);
  if (new Set(ftsKeys).size !== request.terms.length
    || request.termKeys.some((key, index) => key !== searchComparisonKey(request.terms[index]!))
    || request.matchQuery !== buildSearchMatchQuery(request.terms)) {
    throw new AppError("SEARCH_QUERY_INVALID", "Search query is invalid", 400);
  }
  if ((request.tagIds === undefined) !== (request.tagMode === undefined)
    || (request.tagIds !== undefined && (
      request.spaceId === undefined
      || request.tagIds.length < 1
      || request.tagIds.length > SEARCH_POLICY.maxTags
      || request.tagIds.some((tagId) => !/^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/u.test(tagId))
      || new Set(request.tagIds).size !== request.tagIds.length
      || request.tagIds.some((tagId, index) => index > 0 && request.tagIds![index - 1]! >= tagId)
      || (request.tagMode !== "and" && request.tagMode !== "or")
    ))) {
    throw new AppError("LIBRARY_REQUEST_INVALID", "Library request is invalid", 400);
  }
}

function assertRepositoryPageRequest(request: RepositoryKnowledgePageRequest): void {
  parsePageRequest(request.limit, request.cursor);
  assertCursorKey(request.cursorKey);
}

function assertCursorKey(key: string): void {
  if (!CURSOR_KEY.test(key)) throw invalidPageCursor();
}

function encodeCitationKey(revisionId: string, chunkId: string): string {
  return encodeOpaqueCursor({ v: 1, revisionId, chunkId });
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error();
    return [...parsed];
  } catch {
    throw invalidKnowledgeData();
  }
}

function requireString(value: string | null): string {
  if (typeof value !== "string") throw invalidKnowledgeData();
  return value;
}

function requireInteger(value: number | null): number {
  if (!Number.isSafeInteger(value)) throw invalidKnowledgeData();
  return value as number;
}

function isCanonicalTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function invalidPageCursor(): AppError {
  return new AppError("PAGE_CURSOR_INVALID", "Page cursor is invalid", 400);
}

function invalidKnowledgeData(): AppError {
  return new AppError("KNOWLEDGE_DATA_INVALID", "Published knowledge data is invalid", 500);
}
