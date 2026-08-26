import { buildIndexDocument, type IndexTag } from "../indexing/document";
import type { ChunkDraft } from "../sources/chunker";
import type { ExportChunk, ExportRevision, KnowledgeExportPackage } from "./export-package";

export interface RebuildIssue { code: string; message: string; revisionId?: string; }

export interface RebuildDocument {
  revisionId: string;
  title: string;
  summary: string;
  tags: string;
  body: string;
  code: string;
}

export interface DerivedIndexRebuildPlan {
  ok: boolean;
  writes: "none";
  errors: RebuildIssue[];
  warnings: RebuildIssue[];
  authoritativeRevisionCount: number;
  fts: { documents: RebuildDocument[]; chunkCount: number };
  vectorize: { status: "skipped_unbound"; vectors: 0 };
}

export function planDerivedIndexRebuild(pkg: KnowledgeExportPackage): DerivedIndexRebuildPlan {
  const errors: RebuildIssue[] = [];
  const warnings: RebuildIssue[] = [];
  const items = new Set((pkg?.records?.knowledgeItems ?? []).map((item) => item.id));
  const documents: RebuildDocument[] = [];
  let chunkCount = 0;
  for (const revision of pkg?.records?.revisions ?? []) {
    if (!items.has(revision.knowledgeItemId)) {
      errors.push({ code: "REVISION_ORPHANED", message: `Revision ${revision.id} has no knowledge item`, revisionId: revision.id });
      continue;
    }
    const chunks = revision.chunks.map((chunk) => toChunkDraft(chunk));
    if (chunks.some((chunk, index) => chunk.ordinal !== index)) warnings.push({ code: "CHUNK_ORDINAL_GAP", message: `Revision ${revision.id} has a non-contiguous chunk ordinal`, revisionId: revision.id });
    chunkCount += chunks.length;
    const tags: IndexTag[] = revision.tags.map((tag) => ({ id: tag, slug: tag, name: tag }));
    documents.push(buildIndexDocument({ id: revision.id, title: revision.title }, chunks, tags));
  }
  return {
    ok: errors.length === 0,
    writes: "none",
    errors,
    warnings,
    authoritativeRevisionCount: pkg?.records?.revisions?.length ?? 0,
    fts: { documents, chunkCount },
    vectorize: { status: "skipped_unbound", vectors: 0 },
  };
}

function toChunkDraft(chunk: ExportChunk): Pick<ChunkDraft, "ordinal" | "indexField" | "headingPath" | "startLine" | "endLine" | "body" | "searchBody"> & { id: string } {
  return {
    id: chunk.id,
    ordinal: chunk.ordinal,
    headingPath: chunk.headingPath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    body: chunk.body,
    indexField: chunk.indexField ?? "body",
    searchBody: chunk.searchBody ?? chunk.body,
  };
}
