import { computeKnowledgeExportIntegrity, type KnowledgeExportPackage } from "./export-package";

const CATEGORIES = ["members", "spaces", "collections", "submissions", "reviews", "sources", "sourceVersions", "knowledgeItems", "revisions", "researchRuns", "researchReports", "privateNotes", "assets"] as const;
type Category = typeof CATEGORIES[number];

export interface RestorePlanOptions {
  expectedSchemaFingerprint: string;
  memberMap: Readonly<Record<string, string>>;
  targetMemberIds?: readonly string[];
}

export interface RestoreIssue { code: string; message: string; category?: Category; }

export interface RestoreOperation { kind: Category; count: number; dependsOn: Category[]; }

export interface RestorePlan {
  ok: boolean;
  writes: "none";
  errors: RestoreIssue[];
  warnings: RestoreIssue[];
  identityMappings: Array<{ sourceMemberId: string; targetMemberId: string }>;
  citationCount: number;
  operations: RestoreOperation[];
}

export async function planKnowledgeRestore(pkg: KnowledgeExportPackage, options: RestorePlanOptions): Promise<RestorePlan> {
  const errors: RestoreIssue[] = [];
  const warnings: RestoreIssue[] = [];
  if (pkg?.manifest?.schemaFingerprint !== options.expectedSchemaFingerprint) errors.push({ code: "SCHEMA_MISMATCH", message: "Export schema fingerprint does not match the target environment" });
  try {
    if (await computeKnowledgeExportIntegrity(pkg) !== pkg?.manifest?.integritySha256) errors.push({ code: "INTEGRITY_MISMATCH", message: "Export integrity digest does not match its records" });
  } catch {
    errors.push({ code: "INTEGRITY_INVALID", message: "Export integrity cannot be verified" });
  }

  const members = pkg?.records?.members ?? [];
  const mappings = members.map((member) => ({ sourceMemberId: member.id, targetMemberId: options.memberMap[member.id] })).filter((mapping): mapping is { sourceMemberId: string; targetMemberId: string } => typeof mapping.targetMemberId === "string");
  for (const member of members) if (typeof options.memberMap[member.id] !== "string" || !options.memberMap[member.id]) errors.push({ code: "IDENTITY_UNMAPPED", message: `Member ${member.id} has no target identity`, category: "members" });
  if (new Set(mappings.map((mapping) => mapping.targetMemberId)).size !== mappings.length) errors.push({ code: "IDENTITY_CONFLICT", message: "Multiple source identities map to one target identity", category: "members" });
  const existingTargets = new Set(options.targetMemberIds ?? []);
  if (mappings.some((mapping) => existingTargets.has(mapping.targetMemberId))) errors.push({ code: "IDENTITY_CONFLICT", message: "A mapped target identity already exists", category: "members" });

  const mappedMembers = new Set(members.map((member) => member.id));
  for (const revision of pkg?.records?.revisions ?? []) {
    if (!mappedMembers.has(revision.publishedBy) || typeof options.memberMap[revision.publishedBy] !== "string") errors.push({ code: "IDENTITY_UNMAPPED", message: `Revision ${revision.id} publisher has no target identity`, category: "revisions" });
  }
  const expectedCitations = new Set((pkg?.records?.revisions ?? []).flatMap((revision) => revision.chunks.map((chunk) => `${chunk.citationId ?? `${revision.id}:${chunk.id}`}|${revision.id}|${chunk.id}|${chunk.startLine}|${chunk.endLine}`)));
  const actualCitations = new Set((pkg?.citations ?? []).map((citation) => `${citation.citationId}|${citation.revisionId}|${citation.chunkId}|${citation.startLine}|${citation.endLine}`));
  if (expectedCitations.size !== actualCitations.size || [...expectedCitations].some((citation) => !actualCitations.has(citation))) errors.push({ code: "CITATION_MISMATCH", message: "Citation mapping does not cover every exported chunk" });

  const operations: RestoreOperation[] = CATEGORIES.map((kind) => ({ kind, count: pkg?.records?.[kind]?.length ?? 0, dependsOn: dependencies(kind) }));
  return { ok: errors.length === 0, writes: "none", errors, warnings, identityMappings: mappings, citationCount: actualCitations.size, operations };
}

function dependencies(kind: Category): Category[] {
  switch (kind) {
    case "sources": return ["members"];
    case "sourceVersions": return ["sources"];
    case "knowledgeItems": return ["spaces", "collections"];
    case "revisions": return ["knowledgeItems", "sourceVersions", "members"];
    case "submissions": return ["members", "spaces", "collections"];
    case "reviews": return ["submissions", "members"];
    case "researchRuns": return ["members", "spaces", "collections"];
    case "researchReports": return ["researchRuns", "members"];
    case "privateNotes": return ["members"];
    case "assets": return ["members"];
    default: return [];
  }
}
