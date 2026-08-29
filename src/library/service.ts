import { AppError } from "../http";
import type { AuditRepository } from "../audit/repository";
import type { CreateAuditEvent } from "../audit/types";
import type { PublishedContentReader } from "../knowledge/types";
import { decodeOpaqueCursor, encodeOpaqueCursor, pageOffset, parsePageRequest } from "../pagination";
import { normalizeSearchQuery } from "./lexical";
import { SEARCH_POLICY } from "./search-policy";
import { buildRevisionDiff, type RevisionDiffResult } from "./revision-diff";
import { hasExplicitKnowledgeLink } from "./backlinks";
import type {
  AuthorizedRevisionRecord,
  RepositoryChunkPreviewRequest,
  LibraryRepositoryPort,
  RepositoryKnowledgePageRequest,
  RepositorySearchRequest,
} from "./repository";
import type {
  CitationSource,
  ChunkPreviewPage,
  ChunkPreviewRequest,
  ChunkStatusMutation,
  ChatScope,
  KnowledgeDetail,
  KnowledgePage,
  KnowledgePageRequest,
  LibraryFilters,
  LibraryScope,
  RevisionDetail,
  RevisionDownload,
  RelatedKnowledgePage,
  BacklinkPage,
  SearchPage,
  SearchRequest,
} from "./types";

export { normalizeSearchQuery } from "./lexical";
export type { NormalizedSearchQuery } from "./lexical";

const MAX_LOOKUP_ID_CODE_POINTS = 128;
const MAX_LOOKUP_ID_BYTES = 512;
const FILTER_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/u;
const encoder = new TextEncoder();

export interface CitationLookup {
  revisionId: string;
  chunkId: string;
}

type AuditWriter = Pick<AuditRepository, "writeAudit">;

export class LibraryService {
  constructor(
    private readonly repository: LibraryRepositoryPort,
    private readonly content: PublishedContentReader,
    private readonly audit?: AuditWriter,
  ) {}

  async list(scope: LibraryScope, request: KnowledgePageRequest = {}): Promise<KnowledgePage> {
    await this.authorize(scope);
    const filters = normalizeFilters(request);
    const page = numberedRequest(request);
    const normalized: RepositoryKnowledgePageRequest = {
      ...filters,
      ...page,
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

  async diff(
    scope: LibraryScope,
    knowledgeItemId: string,
    fromRevisionId: string,
    toRevisionId: string,
  ): Promise<RevisionDiffResult> {
    await this.authorize(scope);
    assertLookupId(knowledgeItemId);
    assertLookupId(fromRevisionId);
    assertLookupId(toRevisionId);
    const [fromRecord, toRecord] = await Promise.all([
      this.repository.findRevision(scope, knowledgeItemId, fromRevisionId),
      this.repository.findRevision(scope, knowledgeItemId, toRevisionId),
    ]);
    if (!fromRecord || !toRecord) throw knowledgeNotFound();
    const [from, to] = await Promise.all([this.readRevision(fromRecord), this.readRevision(toRecord)]);
    return buildRevisionDiff(
      {
        id: from.id,
        title: from.title,
        tags: from.tagIds,
        visibility: from.visibility,
        parserSchemaVersion: from.parserSchemaVersion,
        codeMetadata: from.codeMetadata,
        markdown: from.markdown,
      },
      {
        id: to.id,
        title: to.title,
        tags: to.tagIds,
        visibility: to.visibility,
        parserSchemaVersion: to.parserSchemaVersion,
        codeMetadata: to.codeMetadata,
        markdown: to.markdown,
      },
    );
  }

  async related(scope: LibraryScope, knowledgeItemId: string): Promise<RelatedKnowledgePage> {
    await this.authorize(scope);
    assertLookupId(knowledgeItemId);
    const record = await this.repository.findCurrent(scope, knowledgeItemId);
    if (!record) throw knowledgeNotFound();
    const revision = await this.readRevision(record);
    const titleTerms = record.title.trim().split(/\s+/u).slice(0, 2).join(" ");
    const contentTerms = revision.markdown.replace(/[^\p{L}\p{N}_-]+/gu, " ").trim().split(/\s+/u).slice(0, 2).join(" ");
    const seed = (titleTerms || contentTerms).trim();
    if (!seed) return { items: [] };
    const results = await this.search(scope, { query: seed, page: 1, pageSize: 20 });
    const seen = new Set<string>([knowledgeItemId]);
    return {
      items: results.items.flatMap((hit) => {
        if (seen.has(hit.knowledgeItemId)) return [];
        seen.add(hit.knowledgeItemId);
        return [{
          id: hit.knowledgeItemId,
          title: hit.title,
          publishedAt: hit.publishedAt,
          reasonFields: [...hit.matchedFields],
        }];
      }).slice(0, 5),
    };
  }

  async backlinks(scope: LibraryScope, knowledgeItemId: string): Promise<BacklinkPage> {
    await this.authorize(scope);
    assertLookupId(knowledgeItemId);
    const target = await this.repository.findCurrent(scope, knowledgeItemId);
    if (!target) throw knowledgeNotFound();
    const candidates = await this.repository.listBacklinkCandidates(scope, knowledgeItemId);
    const seen = new Set<string>();
    const items = candidates.flatMap((candidate) => {
      if (seen.has(candidate.knowledgeItemId) || !hasExplicitKnowledgeLink(candidate.body, knowledgeItemId)) return [];
      seen.add(candidate.knowledgeItemId);
      return [{
        id: candidate.knowledgeItemId,
        revisionId: candidate.revisionId,
        chunkId: candidate.chunkId,
        title: candidate.title,
        publishedAt: candidate.publishedAt,
        startLine: candidate.startLine,
        endLine: candidate.endLine,
      }];
    }).slice(0, 50);
    return { items };
  }

  async previewChunks(
    scope: LibraryScope,
    knowledgeItemId: string,
    revisionId: string,
    request: ChunkPreviewRequest = {},
  ): Promise<ChunkPreviewPage> {
    if (scope.role !== "admin") {
      throw new AppError("FORBIDDEN", "Administrator access required", 403);
    }
    await this.authorize(scope);
    assertLookupId(knowledgeItemId);
    assertLookupId(revisionId);
    const page = parsePageRequest(request.limit, request.cursor);
    const repositoryRequest: RepositoryChunkPreviewRequest = {
      ...page,
      cursorKey: await cursorKey("library-chunk-preview", scope, { knowledgeItemId, revisionId }),
    };
    return this.repository.listRevisionChunks(scope, knowledgeItemId, revisionId, repositoryRequest);
  }

  async setChunkStatus(
    scope: LibraryScope,
    knowledgeItemId: string,
    revisionId: string,
    chunkId: string,
    status: "active" | "disabled",
  ): Promise<ChunkStatusMutation> {
    if (scope.role !== "admin") {
      throw new AppError("FORBIDDEN", "Administrator access required", 403);
    }
    await this.authorize(scope);
    assertLookupId(knowledgeItemId);
    assertLookupId(revisionId);
    assertLookupId(chunkId);
    if (status !== "active" && status !== "disabled") {
      throw new AppError("CHUNK_STATUS_INVALID", "Chunk status is invalid", 400);
    }
    const result = await this.repository.setChunkStatus(scope, knowledgeItemId, revisionId, chunkId, status);
    if (!result) throw knowledgeNotFound();
    return result;
  }

  async download(
    scope: LibraryScope,
    knowledgeItemId: string,
    revisionId: string,
  ): Promise<RevisionDownload> {
    await this.authorize(scope);
    assertLookupId(knowledgeItemId);
    assertLookupId(revisionId);
    const record = await this.repository.findRevision(scope, knowledgeItemId, revisionId);
    if (!record) throw knowledgeNotFound();
    const markdown = await this.content.read(record.normalizedPath, record.contentSha256);
    if (this.audit) {
      const audit: CreateAuditEvent = {
        id: `download-${crypto.randomUUID()}`,
        actorKind: "member",
        actorId: scope.memberId,
        action: "knowledge.downloaded",
        resourceType: "knowledge",
        resourceId: record.id,
        metadata: { revisionId: record.revisionId },
        createdAt: new Date().toISOString(),
      };
      await this.audit.writeAudit(audit);
    }
    return {
      markdown,
      filename: attachmentFilename(record.codeMetadata?.fileLabel || record.title),
    };
  }

  async search(
    scope: LibraryScope,
    request: SearchRequest,
    chatScope?: ChatScope,
  ): Promise<SearchPage> {
    await this.authorize(scope);
    const requestedChatScope = chatScope === undefined ? undefined : normalizeChatScope(chatScope);
    if (requestedChatScope !== undefined && hasMixedSearchScope(request)) {
      throw invalidChatScope();
    }
    const authorizedChatScope = requestedChatScope === undefined
      ? undefined
      : await this.repository.authorizeChatScope(scope, requestedChatScope);
    if (authorizedChatScope === null) {
      throw new AppError(
        "KNOWLEDGE_CHAT_SCOPE_NOT_FOUND",
        "Knowledge chat scope was not found",
        404,
      );
    }
    const filters = normalizeFilters(request);
    const tagFilter = normalizeSearchTags(request);
    const page = numberedRequest(request);
    const query = normalizeSearchQuery(request.query);
    const normalized: RepositorySearchRequest = {
      ...filters,
      ...page,
      ...query,
      ...tagFilter,
      ...(authorizedChatScope === undefined ? {} : { chatScope: authorizedChatScope }),
      policyVersion: SEARCH_POLICY.version,
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
      reviewerId: record.reviewerId || record.publishedBy,
      sourceVersionOrdinal: record.sourceVersionOrdinal ?? null,
      parserSchemaVersion: record.parserSchemaVersion ?? null,
      codeMetadata: record.codeMetadata ? { ...record.codeMetadata } : null,
      indexStatus: record.searchStatus,
      title: record.title,
      tagIds: [...record.tagIds],
      visibility: record.visibility,
      publishedBy: record.publishedBy,
      publishedAt: record.publishedAt,
      isCurrent: record.isCurrent,
      previousRevisionId: record.previousRevisionId ?? null,
      markdown,
      chunks: record.chunks.map((chunk) => ({
        ...chunk,
        headingPath: [...chunk.headingPath],
        citationId: encodeCitationId({ revisionId: record.revisionId, chunkId: chunk.id }),
      })),
    };
  }
}

function numberedRequest(request: { page?: number; pageSize?: number }): { page: number; pageSize: 20 | 50 | 100 } {
  const page = request.page ?? 1;
  const pageSize = request.pageSize ?? 20;
  const normalized = { page, pageSize } as { page: number; pageSize: 20 | 50 | 100 };
  pageOffset(normalized);
  if (pageSize !== 20 && pageSize !== 50 && pageSize !== 100) throw new AppError("PAGE_INVALID", "Page parameters are invalid", 400);
  return normalized;
}

function normalizeChatScope(value: ChatScope): ChatScope {
  if (!isPlainRecord(value) || typeof value.kind !== "string") throw invalidChatScope();
  if (value.kind === "all") {
    if (!hasExactKeys(value, ["kind"])) throw invalidChatScope();
    return { kind: "all" };
  }
  if (value.kind === "space") {
    if (!hasExactKeys(value, ["kind", "spaceId"]) || !FILTER_ID.test(value.spaceId)) {
      throw invalidChatScope();
    }
    return { kind: "space", spaceId: value.spaceId };
  }
  if (value.kind === "collection") {
    if (!hasExactKeys(value, ["collectionId", "kind"]) || !FILTER_ID.test(value.collectionId)) {
      throw invalidChatScope();
    }
    return { kind: "collection", collectionId: value.collectionId };
  }
  if (value.kind === "items") {
    if (!hasExactKeys(value, ["kind", "knowledgeItemIds"])
      || !Array.isArray(value.knowledgeItemIds)
      || value.knowledgeItemIds.length < 1
      || value.knowledgeItemIds.length > 8
      || value.knowledgeItemIds.some((id) => typeof id !== "string" || !FILTER_ID.test(id))
      || new Set(value.knowledgeItemIds).size !== value.knowledgeItemIds.length) {
      throw invalidChatScope();
    }
    return { kind: "items", knowledgeItemIds: [...value.knowledgeItemIds] };
  }
  throw invalidChatScope();
}

function hasMixedSearchScope(request: SearchRequest): boolean {
  return request.spaceId !== undefined
    || request.collectionId !== undefined
    || request.tagId !== undefined
    || request.tagIds !== undefined
    || request.tagMode !== undefined;
}

function invalidChatScope(): AppError {
  return new AppError(
    "KNOWLEDGE_CHAT_SCOPE_INVALID",
    "Knowledge chat scope is invalid",
    400,
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function attachmentFilename(value: string): string {
  const bounded = [...value].slice(0, 96).join("")
    .replace(/[\p{Cc}\\/]/gu, " ")
    .replace(/[^A-Za-z0-9._ -]/gu, "_")
    .replace(/\s+/gu, " ")
    .replace(/^[ .]+|[ .]+$/gu, "")
    .replace(/\.md$/iu, "")
    .replace(/[ .]+$/gu, "");
  return `${bounded || "revision"}.md`;
}

function normalizeSearchTags(request: SearchRequest): Pick<RepositorySearchRequest, "tagIds" | "tagMode"> {
  const { tagIds, tagMode } = request;
  if (tagIds === undefined && tagMode === undefined) return {};
  if (!Array.isArray(tagIds) || tagIds.length < 1 || tagIds.length > SEARCH_POLICY.maxTags
    || (tagMode !== "and" && tagMode !== "or")
    || request.tagId !== undefined
    || request.spaceId === undefined
    || tagIds.some((tagId) => typeof tagId !== "string" || !FILTER_ID.test(tagId))) {
    throw new AppError("LIBRARY_REQUEST_INVALID", "Library request is invalid", 400);
  }
  return { tagIds: [...new Set(tagIds)].sort(), tagMode };
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
  for (const key of ["spaceId", "collectionId", "tagId", "authorId"] as const) {
    const value = request[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !FILTER_ID.test(value)) {
      throw new AppError("LIBRARY_REQUEST_INVALID", "Library request is invalid", 400);
    }
    filters[key] = value;
  }
  if (request.kind !== undefined) {
    if (request.kind !== "text" && request.kind !== "markdown" && request.kind !== "code") {
      throw new AppError("LIBRARY_REQUEST_INVALID", "Library request is invalid", 400);
    }
    filters.kind = request.kind;
  }
  for (const key of ["publishedFrom", "publishedTo"] as const) {
    const value = request[key];
    if (value === undefined) continue;
    if (!isCanonicalTimestamp(value)) throw new AppError("LIBRARY_REQUEST_INVALID", "Library request is invalid", 400);
    filters[key] = value;
  }
  if (filters.publishedFrom !== undefined && filters.publishedTo !== undefined
    && filters.publishedFrom > filters.publishedTo) {
    throw new AppError("LIBRARY_REQUEST_INVALID", "Library request is invalid", 400);
  }
  if ((filters.collectionId !== undefined || filters.tagId !== undefined)
    && filters.spaceId === undefined) {
    throw new AppError("LIBRARY_REQUEST_INVALID", "Collection and tag filters require a Space", 400);
  }
  return filters;
}

function isCanonicalTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

async function cursorKey(
  kind: "library-list" | "library-search" | "library-chunk-preview",
  scope: LibraryScope,
  value: Record<string, unknown>,
): Promise<string> {
  const bytes = encoder.encode(JSON.stringify({ v: 1, kind, memberId: scope.memberId, role: scope.role, ...value }));
  const digest = await crypto.subtle.digest("SHA-256", ownedArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

function invalidCitation(): AppError {
  return new AppError("CITATION_INVALID", "Citation identifier is invalid", 400);
}
