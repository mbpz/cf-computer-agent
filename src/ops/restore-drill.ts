import type { KnowledgeExportPackage } from "./export-package";
import { runImportDryRun, type ImportDryRunOptions, type ImportIssue } from "./import-dry-run";
import { planKnowledgeRestore, type RestorePlanOptions, type RestoreIssue } from "./restore-plan";
import { planDerivedIndexRebuild, type RebuildIssue } from "./index-rebuild-plan";

export interface RestoreDrillOptions extends Pick<ImportDryRunOptions, "expectedSchemaFingerprint" | "actor">, Pick<RestorePlanOptions, "memberMap"> {
  drillId: string;
  startedAt: string;
  completedAt: string;
}

export interface RestoreDrillStage { name: "import-dry-run" | "restore-plan" | "derived-index-plan"; status: "passed" | "failed"; errorCount: number; }
export interface RestoreDrillReport {
  drillId: string;
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  status: "passed" | "failed";
  writes: "none";
  stages: RestoreDrillStage[];
  differences: Array<{ code: string; message: string }>;
  failureHandling: readonly ["stop-before-write", "retain-export", "repair-and-rerun"];
}

export async function runRestoreDrill(pkg: KnowledgeExportPackage, options: RestoreDrillOptions): Promise<RestoreDrillReport> {
  const started = Date.parse(options.startedAt);
  const completed = Date.parse(options.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) throw new TypeError("Restore drill timestamps are invalid");
  const importReport = await runImportDryRun(pkg, options);
  const restorePlan = await planKnowledgeRestore(pkg, { expectedSchemaFingerprint: options.expectedSchemaFingerprint, memberMap: options.memberMap });
  const indexPlan = planDerivedIndexRebuild(pkg);
  const stages: RestoreDrillStage[] = [
    { name: "import-dry-run", status: importReport.ok ? "passed" : "failed", errorCount: importReport.errors.length },
    { name: "restore-plan", status: restorePlan.ok ? "passed" : "failed", errorCount: restorePlan.errors.length },
    { name: "derived-index-plan", status: indexPlan.ok ? "passed" : "failed", errorCount: indexPlan.errors.length },
  ];
  const differences = uniqueIssues([...importReport.errors, ...restorePlan.errors, ...indexPlan.errors]);
  return {
    drillId: options.drillId,
    startedAt: options.startedAt,
    completedAt: options.completedAt,
    elapsedMs: completed - started,
    status: stages.every((stage) => stage.status === "passed") ? "passed" : "failed",
    writes: "none",
    stages,
    differences,
    failureHandling: ["stop-before-write", "retain-export", "repair-and-rerun"],
  };
}

function uniqueIssues(issues: Array<ImportIssue | RestoreIssue | RebuildIssue>): Array<{ code: string; message: string }> {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({ code, message }) => ({ code, message }));
}
