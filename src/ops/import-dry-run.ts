import { computeKnowledgeExportIntegrity, type KnowledgeExportPackage } from "./export-package";

const FORMAT = "memory-garden.knowledge-export";
const VERSION = 1;
const CATEGORIES = ["members", "spaces", "collections", "submissions", "reviews", "sources", "sourceVersions", "knowledgeItems", "revisions", "researchRuns", "researchReports", "privateNotes", "assets"] as const;
type Category = typeof CATEGORIES[number];

export interface ImportDryRunOptions {
  expectedSchemaFingerprint: string;
  actor: { memberId: string; role: "admin" | "contributor" };
  capacities?: Partial<Record<Category, number>> & { assetBytes?: number };
  existingIds?: Partial<Record<Category, readonly string[]>>;
}

export interface ImportIssue { code: string; message: string; category?: Category; }

export interface ImportDryRunReport {
  ok: boolean;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  plan: { totalRecords: number; counts: Record<string, number>; assetBytes: number; writes: "none" };
}

export async function runImportDryRun(pkg: KnowledgeExportPackage, options: ImportDryRunOptions): Promise<ImportDryRunReport> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const records = pkg?.records as Partial<Record<Category, unknown>> | undefined;
  const counts: Record<string, number> = {};
  let totalRecords = 0;
  let assetBytes = 0;

  if (options.actor.role !== "admin") errors.push({ code: "IMPORT_FORBIDDEN", message: "Only an active administrator may restore an export" });
  if (!pkg || pkg.manifest?.format !== FORMAT || pkg.manifest?.version !== VERSION) errors.push({ code: "EXPORT_FORMAT_INVALID", message: "Export format or version is unsupported" });
  if (pkg?.manifest?.schemaFingerprint !== options.expectedSchemaFingerprint) errors.push({ code: "SCHEMA_MISMATCH", message: "Export schema fingerprint does not match this environment" });

  for (const category of CATEGORIES) {
    const values = records?.[category];
    if (!Array.isArray(values)) {
      errors.push({ code: "EXPORT_RECORDS_INVALID", message: `Export records for ${category} are invalid`, category });
      continue;
    }
    counts[category] = values.length;
    totalRecords += values.length;
    if (pkg.manifest?.counts?.[category] !== values.length) errors.push({ code: "EXPORT_COUNTS_MISMATCH", message: `Export count for ${category} is inconsistent`, category });
    const capacity = options.capacities?.[category];
    if (capacity !== undefined && values.length > capacity) errors.push({ code: "CAPACITY_EXCEEDED", message: `Import capacity for ${category} is insufficient`, category });
    const existing = new Set(options.existingIds?.[category] ?? []);
    for (const value of values) {
      if (!value || typeof value !== "object" || typeof (value as { id?: unknown }).id !== "string") {
        errors.push({ code: "EXPORT_RECORD_INVALID", message: `Export record in ${category} has no safe ID`, category });
      } else if (existing.has((value as { id: string }).id)) {
        errors.push({ code: "ID_CONFLICT", message: `Import would overwrite existing ${category} identity`, category });
      }
    }
  }

  if (Array.isArray(records?.assets)) assetBytes = records.assets.reduce((sum, value) => sum + (value && typeof value === "object" && typeof (value as { byteSize?: unknown }).byteSize === "number" ? (value as { byteSize: number }).byteSize : 0), 0);
  if (options.capacities?.assetBytes !== undefined && assetBytes > options.capacities.assetBytes) errors.push({ code: "CAPACITY_EXCEEDED", message: "Import byte capacity for originals is insufficient", category: "assets" });

  try {
    const expected = await computeKnowledgeExportIntegrity(pkg);
    if (expected !== pkg?.manifest?.integritySha256) errors.push({ code: "INTEGRITY_MISMATCH", message: "Export integrity digest does not match its records" });
  } catch {
    errors.push({ code: "INTEGRITY_INVALID", message: "Export integrity cannot be verified" });
  }

  return { ok: errors.length === 0, errors, warnings, plan: { totalRecords, counts, assetBytes, writes: "none" } };
}
