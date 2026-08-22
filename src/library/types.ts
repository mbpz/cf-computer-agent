import type { KnowledgeVisibility, SearchStatus } from "../publication/types";
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
  citationId: string;
  ordinal: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
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

export interface SearchHit {
  citationId: string;
  knowledgeItemId: string;
  spaceId: string;
  collectionId: string | null;
  revisionId: string;
  chunkId: string;
  title: string;
  headingPath: string[];
  startLine: number;
  endLine: number;
  excerpt: string;
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
  title: string;
  headingPath: string[];
  startLine: number;
  endLine: number;
  body: string;
  publishedAt: string;
}
