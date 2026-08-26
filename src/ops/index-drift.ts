import type { KnowledgeExportPackage } from "./export-package";
import { planDerivedIndexRebuild, type DerivedIndexRebuildPlan } from "./index-rebuild-plan";

export interface IndexObservation {
  currentRevisionByItem: Readonly<Record<string, string | null | undefined>>;
  ftsRevisionIds: readonly string[];
  vectorRevisionIds: readonly string[];
  vectorizeBound?: boolean;
}

export interface IndexDriftReport {
  status: "clean" | "drifted";
  current: { missing: string[]; mismatched: Array<{ knowledgeItemId: string; expectedRevisionId: string; observedRevisionId: string | null }> };
  fts: { missing: string[]; stale: string[] };
  vector: { status: "skipped_unbound" | "checked"; missing: string[]; stale: string[] };
}

export interface FullIndexRebuildPlan {
  writes: "none";
  revisionIds: string[];
  indexPlan: DerivedIndexRebuildPlan;
}

export function detectIndexDrift(pkg: KnowledgeExportPackage, observed: IndexObservation): IndexDriftReport {
  const expected = new Map(
    pkg.records.knowledgeItems
      .filter((item) => item.status === "active" && item.currentRevisionId !== null)
      .map((item) => [item.id, item.currentRevisionId as string]),
  );
  const missing: string[] = [];
  const mismatched: IndexDriftReport["current"]["mismatched"] = [];
  for (const [knowledgeItemId, revisionId] of expected) {
    const observedRevisionId = observed.currentRevisionByItem[knowledgeItemId] ?? null;
    if (observedRevisionId === null) missing.push(knowledgeItemId);
    else if (observedRevisionId !== revisionId) mismatched.push({ knowledgeItemId, expectedRevisionId: revisionId, observedRevisionId });
  }
  const expectedIds = new Set(expected.values());
  const ftsIds = new Set(observed.ftsRevisionIds);
  const ftsMissing = [...expectedIds].filter((id) => !ftsIds.has(id)).sort();
  const ftsStale = [...ftsIds].filter((id) => !expectedIds.has(id)).sort();
  const vectorIds = new Set(observed.vectorRevisionIds);
  const vector = observed.vectorizeBound
    ? { status: "checked" as const, missing: [...expectedIds].filter((id) => !vectorIds.has(id)).sort(), stale: [...vectorIds].filter((id) => !expectedIds.has(id)).sort() }
    : { status: "skipped_unbound" as const, missing: [], stale: [] };
  const drifted = missing.length > 0 || mismatched.length > 0 || ftsMissing.length > 0 || ftsStale.length > 0 || vector.missing.length > 0 || vector.stale.length > 0;
  return { status: drifted ? "drifted" : "clean", current: { missing, mismatched }, fts: { missing: ftsMissing, stale: ftsStale }, vector };
}

export function planFullIndexRebuild(pkg: KnowledgeExportPackage): FullIndexRebuildPlan {
  const revisionIds = pkg.records.knowledgeItems
    .filter((item) => item.status === "active" && item.currentRevisionId !== null)
    .map((item) => item.currentRevisionId as string)
    .sort();
  const revisionSet = new Set(revisionIds);
  const indexPlan = planDerivedIndexRebuild({ ...pkg, records: { ...pkg.records, revisions: pkg.records.revisions.filter((revision) => revisionSet.has(revision.id)) } });
  return { writes: "none", revisionIds, indexPlan };
}
