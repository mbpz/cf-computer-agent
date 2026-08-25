import type { KnowledgeVisibility, SearchStatus } from "../publication/types";
import type { SourceLocation } from "../sources/chunker";
import type { CodeSourceMetadata, ParserSchemaVersion } from "../sources/types";

export type SearchMatchedField = "title" | "summary" | "tags" | "body" | "code";

export interface SearchHighlightRange {
  start: number;
  end: number;
}

export type ChatScope =
  | { kind: "all" }
  | { kind: "space"; spaceId: string }
  | { kind: "collection"; collectionId: string }
  | { kind: "items"; knowledgeItemIds: string[] };

export interface LibraryScope {
  memberId: string;
  role: "admin" | "contributor";
}

export interface LibraryFilters {
  spaceId?: string;
  collectionId?: string;
  tagId?: string;
}

export interface KnowledgePageRequest extends LibraryFilters {
  limit?: number;
  cursor?: string;
}

export interface SearchRequest extends KnowledgePageRequest {
  query: string;
  tagIds?: string[];
  tagMode?: "and" | "or";
}

export interface KnowledgeListItem {
  id: string;
  spaceId: string;
  collectionId: string | null;
  revisionId: string;
  title: string;
  tagIds: string[];
  visibility: KnowledgeVisibility;
  searchStatus: SearchStatus;
  publishedAt: string;
  updatedAt: string;
}

export interface KnowledgePage {
  items: KnowledgeListItem[];
  nextCursor?: string;
}

export interface RevisionChunkLocation {
  id: string;
  parentChunkId?: string;
  citationId: string;
  ordinal: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
  location?: SourceLocation;
}

export interface RevisionDetail {
  id: string;
  knowledgeItemId: string;
  sourceVersionId: string;
  reviewerId: string;
  sourceVersionOrdinal: number | null;
  parserSchemaVersion: ParserSchemaVersion | null;
  codeMetadata: CodeSourceMetadata | null;
  indexStatus: SearchStatus;
  title: string;
  tagIds: string[];
  visibility: KnowledgeVisibility;
  publishedBy: string;
  publishedAt: string;
  isCurrent: boolean;
  markdown: string;
  chunks: RevisionChunkLocation[];
}

export interface KnowledgeDetail extends Omit<KnowledgeListItem, "revisionId"> {
  currentRevision: RevisionDetail;
}

export interface RevisionDownload {
  markdown: string;
  filename: string;
}

export interface SearchHit {
  citationId: string;
  knowledgeItemId: string;
  spaceId: string;
  collectionId: string | null;
  revisionId: string;
  chunkId: string;
  parentChunkId?: string;
  title: string;
  headingPath: string[];
  startLine: number;
  endLine: number;
  location?: SourceLocation;
  excerpt: string;
  matchedFields: SearchMatchedField[];
  highlights: SearchHighlightRange[];
  score: number;
  publishedAt: string;
}

export interface SearchPage {
  items: SearchHit[];
  nextCursor?: string;
  degraded: boolean;
}

export interface CitationSource {
  citationId: string;
  knowledgeItemId: string;
  revisionId: string;
  chunkId: string;
  parent?: {
    chunkId: string;
    headingPath: string[];
    startLine: number;
    endLine: number;
    body: string;
  };
  title: string;
  headingPath: string[];
  startLine: number;
  endLine: number;
  location?: SourceLocation;
  body: string;
  publishedAt: string;
}
