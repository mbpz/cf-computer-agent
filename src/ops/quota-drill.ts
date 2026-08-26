export const QUOTA_COMPONENTS = ["d1", "r2", "do", "ai", "vectorize", "queue"] as const;
export type QuotaComponent = typeof QUOTA_COMPONENTS[number];
export type QuotaState = "available" | "near_limit" | "exhausted" | "unbound" | "failed";

export interface QuotaObservation { component: QuotaComponent; state: QuotaState; }
export interface QuotaDrillResult { component: QuotaComponent; observed: QuotaState; action: "none" | "warn" | "block_writes" | "metadata_only" | "retryable_error" | "defer_ai" | "fts_only" | "d1_recovery_scan"; }
export interface QuotaFailureDrill { ok: true; results: QuotaDrillResult[]; writes: "none"; }

export function buildQuotaFailureDrill(observations: readonly QuotaObservation[]): QuotaFailureDrill {
  const expected = new Set<QuotaComponent>(QUOTA_COMPONENTS);
  if (observations.length !== QUOTA_COMPONENTS.length || new Set(observations.map((observation) => observation.component)).size !== QUOTA_COMPONENTS.length || observations.some((observation) => !expected.has(observation.component))) throw new TypeError("Quota component coverage is invalid");
  const results = observations.slice().sort((left, right) => QUOTA_COMPONENTS.indexOf(left.component) - QUOTA_COMPONENTS.indexOf(right.component)).map((observation) => ({ component: observation.component, observed: observation.state, action: actionFor(observation.component, observation.state) }));
  return { ok: true, results, writes: "none" };
}

function actionFor(component: QuotaComponent, state: QuotaState): QuotaDrillResult["action"] {
  if (state === "available") return "none";
  if (state === "near_limit") return component === "ai" ? "defer_ai" : "warn";
  if (component === "d1") return "block_writes";
  if (component === "r2") return "metadata_only";
  if (component === "do") return "retryable_error";
  if (component === "ai") return "defer_ai";
  if (component === "vectorize") return "fts_only";
  return "d1_recovery_scan";
}
