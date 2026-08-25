import { AppError } from "../http";
import { decodeOpaqueCursor, encodeOpaqueCursor, parsePageRequest, type PageRequest } from "../pagination";
import type { KnowledgeVisibility, SearchStatus } from "../publication/types";
import { MAX_REVISION_CHUNKS } from "../sources/limits";
import { parseSourceLocationJson, type SourceLocation } from "../sources/chunker";
import type { CodeSourceMetadata, ParserSchemaVersion } from "../sources/types";
import {
  buildSearchMatchQuery,
  isCanonicalSearchTerm,
  searchComparisonKey,
  searchFtsEquivalenceKey,
} from "./lexical";
import { buildSearchPresentation, SEARCH_POLICY } from "./search-policy";
import type {
  CitationSource,
  ChatScope,
  KnowledgeListItem,
  KnowledgePage,
  LibraryFilters,
  LibraryScope,
  SearchHit,
  SearchPage,
} from "./types";

const CURSOR_KEY = /^[a-f0-9]{64}$/u;
const FILTER_RESOURCE_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/u;
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
  chatScope?: AuthorizedChatScope;
}

export type AuthorizedChatScope =
  | { kind: "all" }
  | { kind: "space"; spaceId: string }
  | { kind: "collection"; spaceId: string; collectionId: string }
  | { kind: "items"; knowledgeItemIds: string[] };

export interface AuthorizedRevisionChunk {
  id: string;
  ordinal: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
  location?: SourceLocation;
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
  reviewerId?: string;
  sourceVersionOrdinal?: number | null;
  parserSchemaVersion?: ParserSchemaVersion | null;
  codeMetadata?: CodeSourceMetadata | null;
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
  authorizeChatScope(
    scope: LibraryScope,
    chatScope: ChatScope,
  ): Promise<AuthorizedChatScope | null>;
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
  reviewer_id: string;
  source_version_ordinal: number | null;
  parser_schema_version: string | null;
  code_language: string | null;
  file_label: string | null;
  line_baseline: number | null;
  normalized_path: string;
  content_sha256: string;
  published_by: string;
  current_revision_id: string;
  chunk_id: string | null;
  ordinal: number | null;
  heading_path: string | null;
  start_line: number | null;
  end_line: number | null;
  location_json: string | null;
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
  location_json: string;
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
  location_json: string;
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

interface StableSearchCursor {
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

  async authorizeChatScope(
    scope: LibraryScope,
    chatScope: ChatScope,
  ): Promise<AuthorizedChatScope | null> {
    if (chatScope.kind === "all") {
      return await this.authorizeScope(scope) ? { kind: "all" } : null;
    }
    if (chatScope.kind === "space") {
      const row = await this.db.prepare(
        `SELECT s.id AS space_id
         FROM members m
         JOIN spaces s ON s.id = ? AND s.status = 'active' AND s.kind != 'legacy'
         WHERE m.id = ? AND m.role = ? AND m.status = 'active'
         LIMIT 1`,
      ).bind(chatScope.spaceId, scope.memberId, scope.role).first<{ space_id: string }>();
      return row ? { kind: "space", spaceId: row.space_id } : null;
    }
    if (chatScope.kind === "collection") {
      const row = await this.db.prepare(
        `SELECT c.id AS collection_id, c.space_id
         FROM members m
         JOIN collections c ON c.id = ? AND c.status = 'active'
         JOIN spaces s ON s.id = c.space_id AND s.status = 'active' AND s.kind != 'legacy'
         WHERE m.id = ? AND m.role = ? AND m.status = 'active'
         LIMIT 1`,
      ).bind(chatScope.collectionId, scope.memberId, scope.role).first<{
        collection_id: string;
        space_id: string;
      }>();
      return row ? {
        kind: "collection",
        spaceId: row.space_id,
        collectionId: row.collection_id,
      } : null;
    }

    const requested = [...chatScope.knowledgeItemIds].sort();
    const placeholders = requested.map(() => "?").join(", ");
    const rows = await this.db.prepare(
      `WITH authorized_member AS (
         SELECT role FROM members WHERE id = ? AND role = ? AND status = 'active'
       )
       SELECT k.id
       FROM authorized_member am
       JOIN knowledge_items k
       JOIN revisions r ON r.id = k.current_revision_id
       JOIN jobs current_index_job
         ON current_index_job.kind = 'index_revision'
           AND current_index_job.resource_id = r.id AND current_index_job.state = 'completed'
       JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
       LEFT JOIN collections active_collection
         ON active_collection.id = k.collection_id
           AND active_collection.space_id = k.space_id AND active_collection.status = 'active'
       WHERE k.id IN (${placeholders})
         AND k.status = 'active' AND k.search_status = 'indexed'
         AND (k.collection_id IS NULL OR active_collection.id IS NOT NULL)
         AND (r.visibility = 'shared' OR am.role = 'admin')
       ORDER BY k.id ASC
       LIMIT 9`,
    ).bind(scope.memberId, scope.role, ...requested).all<{ id: string }>();
    const authorized = rows.results.map(({ id }) => id);
    return authorized.length === requested.length
      && authorized.every((id, index) => id === requested[index])
      ? { kind: "items", knowledgeItemIds: authorized }
      : null;
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
      : decodeSearchCursor(request.cursor, request.cursorKey, request.chatScope !== undefined);
    const filters = searchFilterSql(request, "k", "r");
    const chatScope = chatScopeFilterSql(request.chatScope, "k");
    const searchCorpus = scope.role === "admin" ? "chunks_fts" : "chunks_fts_shared";
    const stableCursor = cursor !== undefined && !isRankedSearchCursor(cursor) ? cursor : undefined;
    const rankedCursor = cursor !== undefined && isRankedSearchCursor(cursor) ? cursor : undefined;
    const anchorCte = stableCursor === undefined ? "" : `, cursor_anchor AS (
         SELECT score, published_at, knowledge_item_id, revision_id, chunk_id
         FROM ranked
         WHERE knowledge_item_id = ? AND revision_id = ? AND chunk_id = ?
         LIMIT 1
       )`;
    const cursorSql = cursor === undefined ? "" : stableCursor !== undefined ? `
       CROSS JOIN cursor_anchor anchor
       WHERE ranked.score > anchor.score
          OR (ranked.score = anchor.score AND ranked.published_at < anchor.published_at)
          OR (ranked.score = anchor.score AND ranked.published_at = anchor.published_at
            AND ranked.knowledge_item_id > anchor.knowledge_item_id)
          OR (ranked.score = anchor.score AND ranked.published_at = anchor.published_at
            AND ranked.knowledge_item_id = anchor.knowledge_item_id
            AND ranked.revision_id > anchor.revision_id)
          OR (ranked.score = anchor.score AND ranked.published_at = anchor.published_at
            AND ranked.knowledge_item_id = anchor.knowledge_item_id
            AND ranked.revision_id = anchor.revision_id AND ranked.chunk_id > anchor.chunk_id)` : `
       WHERE score > ?
          OR (score = ? AND published_at < ?)
          OR (score = ? AND published_at = ? AND knowledge_item_id > ?)
          OR (score = ? AND published_at = ? AND knowledge_item_id = ? AND revision_id > ?)
          OR (score = ? AND published_at = ? AND knowledge_item_id = ? AND revision_id = ? AND chunk_id > ?)`;
    const cursorBindings = stableCursor !== undefined
      ? [stableCursor.knowledgeItemId, stableCursor.revisionId, stableCursor.chunkId]
      : rankedCursor === undefined ? [] : [
        rankedCursor.score,
        rankedCursor.score,
        rankedCursor.publishedAt,
        rankedCursor.score,
        rankedCursor.publishedAt,
        rankedCursor.knowledgeItemId,
        rankedCursor.score,
        rankedCursor.publishedAt,
        rankedCursor.knowledgeItemId,
        rankedCursor.revisionId,
        rankedCursor.score,
        rankedCursor.publishedAt,
        rankedCursor.knowledgeItemId,
        rankedCursor.revisionId,
        rankedCursor.chunkId,
      ];
    const rows = await this.db.prepare(
      `WITH authorized_member AS (
         SELECT role FROM members WHERE id = ? AND role = ? AND status = 'active'
       ), ranked AS (
         SELECT k.id AS knowledge_item_id, k.space_id, k.collection_id,
           r.id AS revision_id, c.id AS chunk_id, r.title, c.heading_path,
           c.start_line, c.end_line, c.location_json, c.body, r.published_at,
           bm25(${searchCorpus}, ${SEARCH_BM25_WEIGHTS_SQL}) AS score,
           instr(highlight(${searchCorpus}, 1, char(1), char(2)), char(1)) > 0 AS match_title,
           instr(highlight(${searchCorpus}, 2, char(1), char(2)), char(1)) > 0 AS match_summary,
           instr(highlight(${searchCorpus}, 3, char(1), char(2)), char(1)) > 0 AS match_tags,
           instr(highlight(${searchCorpus}, 4, char(1), char(2)), char(1)) > 0 AS match_body,
           instr(highlight(${searchCorpus}, 5, char(1), char(2)), char(1)) > 0 AS match_code
         FROM ${searchCorpus}
         JOIN chunks c ON c.rowid = ${searchCorpus}.rowid AND c.id = ${searchCorpus}.chunk_id
         JOIN revisions r ON r.id = c.revision_id
         JOIN knowledge_items k ON k.id = r.knowledge_item_id AND k.current_revision_id = r.id
         JOIN jobs current_index_job
           ON current_index_job.kind = 'index_revision'
             AND current_index_job.resource_id = r.id AND current_index_job.state = 'completed'
         JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
         LEFT JOIN collections active_collection
           ON active_collection.id = k.collection_id
             AND active_collection.space_id = k.space_id AND active_collection.status = 'active'
         CROSS JOIN authorized_member am
         WHERE ${searchCorpus} MATCH ?
           AND k.status = 'active' AND k.search_status = 'indexed'
           AND (k.collection_id IS NULL OR active_collection.id IS NOT NULL)
           AND (r.visibility = 'shared' OR am.role = 'admin')
           ${filters.sql}${chatScope.sql}
       )${anchorCte}
       SELECT ranked.* FROM ranked${cursorSql}
       ORDER BY ranked.score ASC, ranked.published_at DESC, ranked.knowledge_item_id ASC,
         ranked.revision_id ASC, ranked.chunk_id ASC
       LIMIT ?`,
    ).bind(
      scope.memberId,
      scope.role,
      request.matchQuery,
      ...filters.bindings,
      ...chatScope.bindings,
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
        nextCursor: request.chatScope === undefined
          ? encodeOpaqueCursor({
            v: 2,
            score: last.score,
            publishedAt: last.published_at,
            knowledgeItemId: last.knowledge_item_id,
            revisionId: last.revision_id,
            chunkId: last.chunk_id,
            policyVersion: SEARCH_POLICY.version,
            key: request.cursorKey,
          })
          : encodeOpaqueCursor({
            v: 3,
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
         r.title, c.heading_path, c.start_line, c.end_line, c.location_json, c.body, r.published_at
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
      ...(parseSourceLocationJson(row.location_json) ? { location: parseSourceLocationJson(row.location_json) } : {}),
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
       ), authorized_revision AS (
         SELECT k.id, k.space_id, k.collection_id, k.status,
           ${visibleSearchStatusSql} AS search_status, k.updated_at,
           k.current_revision_id, r.id AS revision_id, r.source_version_id, r.normalized_path,
           r.content_sha256, r.title, r.tags_json, r.visibility, r.published_by, r.published_at
         FROM authorized_member am
         JOIN knowledge_items k
         JOIN revisions current_revision ON current_revision.id = k.current_revision_id
         LEFT JOIN jobs current_index_job
           ON current_index_job.kind = 'index_revision' AND current_index_job.resource_id = k.current_revision_id
         JOIN revisions r ON ${requestedRevision}
         JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
         WHERE k.id = ? AND k.status = 'active'
           AND (r.visibility = 'shared' OR am.role = 'admin')
       )
       SELECT ar.*, sv.ordinal AS source_version_ordinal, sv.parser_schema_version,
         sv.code_language, sv.file_label, sv.line_baseline,
         coalesce(review.reviewer_id, ar.published_by) AS reviewer_id,
           c.id AS chunk_id, c.ordinal, c.heading_path, c.start_line, c.end_line, c.location_json
       FROM authorized_revision ar
       JOIN source_versions sv ON sv.id = ar.source_version_id
       LEFT JOIN reviews review
         ON review.submission_id = sv.submission_id AND review.decision = 'published'
       LEFT JOIN chunks c ON c.revision_id = ar.revision_id
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
      reviewerId: first.reviewer_id,
      sourceVersionOrdinal: positiveIntegerOrNull(first.source_version_ordinal),
      parserSchemaVersion: parserSchemaVersionOrNull(first.parser_schema_version),
      codeMetadata: codeMetadataOrNull(first),
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
        ...(parseSourceLocationJson(row.location_json) ? { location: parseSourceLocationJson(row.location_json) } : {}),
      }]),
    };
  }

  private async hasDegraded(
    scope: LibraryScope,
    filters: LibraryFilters & Partial<Pick<RepositorySearchRequest, "tagIds" | "tagMode" | "chatScope">>,
  ): Promise<boolean> {
    const selected = searchFilterSql(filters, "k", "r");
    const chatScope = chatScopeFilterSql(filters.chatScope, "k");
    const row = await this.db.prepare(
      `WITH authorized_member AS (
         SELECT role FROM members WHERE id = ? AND role = ? AND status = 'active'
       )
       SELECT 1 AS degraded
       FROM authorized_member am
       JOIN knowledge_items k
       JOIN revisions r ON r.id = k.current_revision_id
       JOIN spaces s ON s.id = k.space_id AND s.status = 'active' AND s.kind != 'legacy'
       LEFT JOIN collections active_collection
         ON active_collection.id = k.collection_id
           AND active_collection.space_id = k.space_id AND active_collection.status = 'active'
       WHERE k.status = 'active' AND k.search_status = 'search_degraded'
         AND (k.collection_id IS NULL OR active_collection.id IS NOT NULL)
         AND (r.visibility = 'shared' OR am.role = 'admin')
         ${selected.sql}${chatScope.sql}
       LIMIT 1`,
    ).bind(
      scope.memberId,
      scope.role,
      ...selected.bindings,
      ...chatScope.bindings,
    ).first<{ degraded: number }>();
    return row?.degraded === 1;
  }
}

function positiveIntegerOrNull(value: number | null): number | null {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value : null;
}

function parserSchemaVersionOrNull(value: string | null): ParserSchemaVersion | null {
  return value === "m1-v1" || value === "m1-v2" ? value : null;
}

function codeMetadataOrNull(row: Pick<RevisionRow, "code_language" | "file_label" | "line_baseline">): CodeSourceMetadata | null {
  return typeof row.code_language === "string" && typeof row.file_label === "string"
    && Number.isSafeInteger(row.line_baseline) && (row.line_baseline ?? 0) > 0
    ? { language: row.code_language, fileLabel: row.file_label, lineBaseline: row.line_baseline! }
    : null;
}

function chatScopeFilterSql(
  chatScope: AuthorizedChatScope | undefined,
  itemAlias: string,
): { sql: string; bindings: string[] } {
  if (chatScope === undefined || chatScope.kind === "all") return { sql: "", bindings: [] };
  if (chatScope.kind === "space") {
    return { sql: ` AND ${itemAlias}.space_id = ?`, bindings: [chatScope.spaceId] };
  }
  if (chatScope.kind === "collection") {
    return {
      sql: ` AND ${itemAlias}.space_id = ? AND ${itemAlias}.collection_id = ?`,
      bindings: [chatScope.spaceId, chatScope.collectionId],
    };
  }
  return {
    sql: ` AND ${itemAlias}.id IN (${chatScope.knowledgeItemIds.map(() => "?").join(", ")})`,
    bindings: [...chatScope.knowledgeItemIds],
  };
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
  )` : filters.tagIds.map(() => `EXISTS (
    SELECT 1 FROM revision_tags selected_tag
    WHERE selected_tag.revision_id = ${revisionAlias}.id AND selected_tag.tag_id = ?
  )`).join(" AND ");
  return {
    sql: `${base.sql} AND ${validTags} AND ${membership}`,
    bindings: [
      ...base.bindings,
      ...filters.tagIds,
      filters.spaceId,
      ...filters.tagIds,
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
      JOIN tags active_tag
        ON active_tag.id = selected_tag.tag_id
          AND active_tag.space_id = ${itemAlias}.space_id
          AND active_tag.status = 'active'
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
    ...(parseSourceLocationJson(row.location_json) ? { location: parseSourceLocationJson(row.location_json) } : {}),
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
      || typeof record.id !== "string" || !FILTER_RESOURCE_ID.test(record.id)) throw new Error();
    return { updatedAt: record.updatedAt, id: record.id };
  } catch {
    throw invalidPageCursor();
  }
}

function decodeSearchCursor(
  cursor: string,
  key: string,
  stable: boolean,
): SearchCursor | StableSearchCursor {
  try {
    const decoded = decodeOpaqueCursor(cursor);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error();
    const record = decoded as Record<string, unknown>;
    if (stable) {
      if (Object.keys(record).length !== 6 || record.v !== 3
        || record.policyVersion !== SEARCH_POLICY.version || record.key !== key
        || typeof record.knowledgeItemId !== "string" || !FILTER_RESOURCE_ID.test(record.knowledgeItemId)
        || typeof record.revisionId !== "string" || !FILTER_RESOURCE_ID.test(record.revisionId)
        || typeof record.chunkId !== "string" || !FILTER_RESOURCE_ID.test(record.chunkId)) throw new Error();
      return {
        knowledgeItemId: record.knowledgeItemId,
        revisionId: record.revisionId,
        chunkId: record.chunkId,
      };
    }
    if (Object.keys(record).length !== 8 || record.v !== 2 || record.policyVersion !== SEARCH_POLICY.version
      || record.key !== key
      || typeof record.score !== "number" || !Number.isFinite(record.score)
      || typeof record.publishedAt !== "string" || !isCanonicalTimestamp(record.publishedAt)
      || typeof record.knowledgeItemId !== "string" || !FILTER_RESOURCE_ID.test(record.knowledgeItemId)
      || typeof record.revisionId !== "string" || !FILTER_RESOURCE_ID.test(record.revisionId)
      || typeof record.chunkId !== "string" || !FILTER_RESOURCE_ID.test(record.chunkId)) throw new Error();
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

function isRankedSearchCursor(
  cursor: SearchCursor | StableSearchCursor,
): cursor is SearchCursor {
  return "score" in cursor && typeof cursor.score === "number";
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
  if (request.chatScope !== undefined && !isAuthorizedChatScope(request.chatScope)) {
    throw new AppError("KNOWLEDGE_CHAT_SCOPE_INVALID", "Knowledge chat scope is invalid", 400);
  }
}

function isAuthorizedChatScope(value: AuthorizedChatScope): boolean {
  if (!value || typeof value !== "object") return false;
  if (value.kind === "all") return Object.keys(value).length === 1;
  if (value.kind === "space") {
    return Object.keys(value).length === 2 && FILTER_RESOURCE_ID.test(value.spaceId);
  }
  if (value.kind === "collection") {
    return Object.keys(value).length === 3
      && FILTER_RESOURCE_ID.test(value.spaceId)
      && FILTER_RESOURCE_ID.test(value.collectionId);
  }
  return value.kind === "items"
    && Object.keys(value).length === 2
    && Array.isArray(value.knowledgeItemIds)
    && value.knowledgeItemIds.length >= 1
    && value.knowledgeItemIds.length <= 8
    && value.knowledgeItemIds.every((id) => FILTER_RESOURCE_ID.test(id))
    && new Set(value.knowledgeItemIds).size === value.knowledgeItemIds.length
    && value.knowledgeItemIds.every((id, index) => index === 0 || value.knowledgeItemIds[index - 1]! < id);
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
