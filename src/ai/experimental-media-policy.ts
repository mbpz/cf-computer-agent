export type ExperimentalMediaKind = "audio" | "video" | "slides";
export type ExperimentalMediaDecision =
  | { decision: "allow"; kind: ExperimentalMediaKind; quotaScope: "experimental-media"; used: number; limit: number; remaining: number }
  | { decision: "block"; kind: ExperimentalMediaKind; reason: "disabled" | "quality_gate" | "quota"; quotaScope: "experimental-media"; used: number; limit: number; remaining: number; deferredUntil: string | null };

/**
 * Safety gate for non-1.0 media experiments. This is deliberately a policy
 * primitive only: no route calls it until an explicit product rollout enables
 * the experiment. Its quota is isolated from the normal AI quota ledger.
 */
export function decideExperimentalMedia(input: {
  kind: ExperimentalMediaKind;
  enabled?: boolean;
  qualityScore: number;
  used: number;
  limit: number;
  cost: number;
  now: string;
}): ExperimentalMediaDecision {
  const kind = input.kind;
  if (kind !== "audio" && kind !== "video" && kind !== "slides") throw new Error("MEDIA_KIND_INVALID");
  const used = nonNegativeInteger(input.used, "MEDIA_QUOTA_USED_INVALID");
  const limit = positiveInteger(input.limit, "MEDIA_QUOTA_LIMIT_INVALID");
  const cost = positiveInteger(input.cost, "MEDIA_QUOTA_COST_INVALID");
  if (!Number.isFinite(input.qualityScore) || input.qualityScore < 0 || input.qualityScore > 1) throw new Error("MEDIA_QUALITY_INVALID");
  const remaining = Math.max(0, limit - used);
  const blocked = (reason: "disabled" | "quality_gate" | "quota", deferredUntil: string | null = null): ExperimentalMediaDecision => ({
    decision: "block", kind, reason, quotaScope: "experimental-media", used, limit, remaining, deferredUntil,
  });
  if (input.enabled !== true) return blocked("disabled");
  if (input.qualityScore !== 1) return blocked("quality_gate");
  if (used + cost > limit) return blocked("quota", nextUtcDay(input.now));
  return { decision: "allow", kind, quotaScope: "experimental-media", used, limit, remaining: remaining - cost };
}

function nonNegativeInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}

function positiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(code);
  return value;
}

function nextUtcDay(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("MEDIA_QUOTA_TIME_INVALID");
  const next = new Date(time);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}
