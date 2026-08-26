export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const KNOWLEDGE_EXPORT_FORMAT = "memory-garden.knowledge-export" as const;
export const KNOWLEDGE_EXPORT_VERSION = 1 as const;

export interface ExportMember {
  id: string;
  identitySubject: string;
  email: string;
  role: "admin" | "contributor";
  status: "active" | "disabled";
  createdAt: string;
  updatedAt: string;
}

export interface ExportOriginal {
  id: string;
  objectKey: string | null;
  originalName: string;
  contentType: string;
  byteSize: number;
  contentSha256: string;
  status: "ready" | "quarantined" | "failed";
  /** Optional inline bytes for an offline export; never fetched by this builder. */
  bytesBase64?: string;
}

export interface ExportChunk {
  id: string;
  revisionId: string;
  citationId?: string;
  ordinal: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
  body: string;
  location?: JsonValue;
}

export interface ExportRevision {
  id: string;
  knowledgeItemId: string;
  sourceVersionId: string;
  normalizedPath: string;
  contentSha256: string;
  title: string;
  tags: string[];
  visibility: "shared" | "admin_only";
  publishedBy: string;
  publishedAt: string;
  markdown: string;
  chunks: ExportChunk[];
}

export interface ExportKnowledgeItem {
  id: string;
  spaceId: string;
  collectionId: string | null;
  currentRevisionId: string | null;
  status: "active" | "trashed";
  searchStatus: "pending" | "indexed" | "search_degraded";
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeExportInput {
  exportId: string;
  generatedAt: string;
  schemaFingerprint: string;
  members: ExportMember[];
  spaces: JsonValue[];
  collections: JsonValue[];
  submissions: JsonValue[];
  reviews: JsonValue[];
  sources: JsonValue[];
  sourceVersions: JsonValue[];
  knowledgeItems: ExportKnowledgeItem[];
  revisions: ExportRevision[];
  researchRuns: JsonValue[];
  researchReports: JsonValue[];
  privateNotes: JsonValue[];
  assets: ExportOriginal[];
}

export interface ExportCitationLocation {
  citationId: string;
  revisionId: string;
  chunkId: string;
  ordinal: number;
  startLine: number;
  endLine: number;
  location?: JsonValue;
}

export interface KnowledgeExportPackage {
  manifest: {
    format: typeof KNOWLEDGE_EXPORT_FORMAT;
    version: typeof KNOWLEDGE_EXPORT_VERSION;
    exportId: string;
    generatedAt: string;
    schemaFingerprint: string;
    authoritative: readonly ["members", "spaces", "collections", "submissions", "reviews", "sources", "sourceVersions", "knowledgeItems", "revisions", "researchRuns", "researchReports", "privateNotes", "assets"];
    derivedExcluded: readonly ["chunks_fts", "vectorize", "jobs"];
    counts: Record<string, number>;
    originals: { mode: "inline" | "metadata-only"; count: number; inlineCount: number };
    citationCount: number;
    integritySha256: string;
  };
  records: {
    members: ExportMember[];
    spaces: JsonValue[];
    collections: JsonValue[];
    submissions: JsonValue[];
    reviews: JsonValue[];
    sources: JsonValue[];
    sourceVersions: JsonValue[];
    knowledgeItems: ExportKnowledgeItem[];
    revisions: ExportRevision[];
    researchRuns: JsonValue[];
    researchReports: JsonValue[];
    privateNotes: JsonValue[];
    assets: ExportOriginal[];
  };
  citations: ExportCitationLocation[];
}

export async function buildKnowledgeExport(input: KnowledgeExportInput): Promise<KnowledgeExportPackage> {
  validateInput(input);
  const records = {
    members: sortById(input.members),
    spaces: sortJsonRecords(input.spaces),
    collections: sortJsonRecords(input.collections),
    submissions: sortJsonRecords(input.submissions),
    reviews: sortJsonRecords(input.reviews),
    sources: sortJsonRecords(input.sources),
    sourceVersions: sortJsonRecords(input.sourceVersions),
    knowledgeItems: sortById(input.knowledgeItems),
    revisions: sortById(input.revisions).map((revision) => ({ ...revision, chunks: [...revision.chunks].sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id)) })),
    researchRuns: sortJsonRecords(input.researchRuns),
    researchReports: sortJsonRecords(input.researchReports),
    privateNotes: sortJsonRecords(input.privateNotes),
    assets: sortById(input.assets).map((asset) => ({ ...asset })),
  };
  const citations = records.revisions.flatMap((revision) => revision.chunks.map((chunk) => ({
    citationId: chunk.citationId ?? `${revision.id}:${chunk.id}`,
    revisionId: revision.id,
    chunkId: chunk.id,
    ordinal: chunk.ordinal,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    ...(chunk.location === undefined ? {} : { location: chunk.location }),
  }))).sort((a, b) => a.citationId.localeCompare(b.citationId));
  const inlineCount = records.assets.filter((asset) => asset.bytesBase64 !== undefined).length;
  const manifestBase = {
    format: KNOWLEDGE_EXPORT_FORMAT,
    version: KNOWLEDGE_EXPORT_VERSION,
    exportId: input.exportId,
    generatedAt: input.generatedAt,
    schemaFingerprint: input.schemaFingerprint,
    authoritative: ["members", "spaces", "collections", "submissions", "reviews", "sources", "sourceVersions", "knowledgeItems", "revisions", "researchRuns", "researchReports", "privateNotes", "assets"] as const,
    derivedExcluded: ["chunks_fts", "vectorize", "jobs"] as const,
    counts: Object.fromEntries(Object.entries(records).map(([key, value]) => [key, value.length])),
    originals: { mode: inlineCount > 0 ? "inline" as const : "metadata-only" as const, count: records.assets.length, inlineCount },
    citationCount: citations.length,
  };
  const integritySha256 = await sha256Hex(stableJson({ records, citations, manifest: manifestBase }));
  return { manifest: { ...manifestBase, integritySha256 }, records, citations };
}

export async function computeKnowledgeExportIntegrity(pkg: KnowledgeExportPackage): Promise<string> {
  const { integritySha256: _ignored, ...manifest } = pkg.manifest;
  return sha256Hex(stableJson({ records: pkg.records, citations: pkg.citations, manifest }));
}

function validateInput(input: KnowledgeExportInput): void {
  if (!isSafeId(input.exportId) || !isIso(input.generatedAt) || !isSafeText(input.schemaFingerprint)) throw new TypeError("Export header is invalid");
  for (const collection of [input.members, input.spaces, input.collections, input.submissions, input.reviews, input.sources, input.sourceVersions, input.knowledgeItems, input.revisions, input.researchRuns, input.researchReports, input.privateNotes, input.assets]) {
    if (!Array.isArray(collection)) throw new TypeError("Export collection is invalid");
  }
  assertUniqueIds(input.members, "members");
  assertUniqueIds(input.knowledgeItems, "knowledgeItems");
  assertUniqueIds(input.revisions, "revisions");
  assertUniqueIds(input.assets, "assets");
  const itemIds = new Set(input.knowledgeItems.map((item) => item.id));
  for (const revision of input.revisions) {
    if (!itemIds.has(revision.knowledgeItemId) || !isSafeId(revision.sourceVersionId) || !revision.markdown.length) throw new TypeError("Revision export is invalid");
    const chunkIds = new Set<string>();
    for (const chunk of revision.chunks) {
      if (chunk.revisionId !== revision.id || chunkIds.has(chunk.id) || !isSafeId(chunk.id)
        || !Number.isSafeInteger(chunk.ordinal) || chunk.ordinal < 0
        || !Number.isSafeInteger(chunk.startLine) || chunk.startLine < 1
        || !Number.isSafeInteger(chunk.endLine) || chunk.endLine < chunk.startLine) throw new TypeError("Chunk export is invalid");
      chunkIds.add(chunk.id);
    }
  }
  for (const asset of input.assets) {
    if (!isSafeId(asset.id) || !Number.isSafeInteger(asset.byteSize) || asset.byteSize <= 0
      || !/^[a-f0-9]{64}$/u.test(asset.contentSha256)
      || (asset.bytesBase64 !== undefined && !/^[A-Za-z0-9+/]*={0,2}$/u.test(asset.bytesBase64))) throw new TypeError("Original export is invalid");
  }
}

function assertUniqueIds(values: readonly { id: string }[], label: string): void {
  const ids = values.map((value) => value.id);
  if (ids.some((id) => !isSafeId(id)) || new Set(ids).size !== ids.length) throw new TypeError(`${label} contain duplicate or invalid IDs`);
}

function sortById<T extends { id: string }>(values: readonly T[]): T[] { return [...values].sort((a, b) => a.id.localeCompare(b.id)); }
function sortJsonRecords(values: readonly JsonValue[]): JsonValue[] { return [...values].sort((a, b) => stableJson(a).localeCompare(stableJson(b))); }
function isSafeId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(value); }
function isSafeText(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f-\u009f]/u.test(value); }
function isIso(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.length <= 64; }

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
