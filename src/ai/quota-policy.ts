export type AiQuotaPriority = "interactive" | "ingestion" | "research";
export type AiQuotaDecision = { decision: "allow" | "defer"; priority: AiQuotaPriority; used: number; limit: number; remaining: number; state: "normal" | "degraded" | "exhausted"; deferredUntil: string | null };

export function decideAiQuota(input: { used: number; limit: number; cost: number; priority: AiQuotaPriority; interactiveReserve?: number; now: string }): AiQuotaDecision {
  const used = integer(input.used, "AI_QUOTA_USED_INVALID");
  const limit = positiveInteger(input.limit, "AI_QUOTA_LIMIT_INVALID");
  const cost = positiveInteger(input.cost, "AI_QUOTA_COST_INVALID");
  const reserve = integer(input.interactiveReserve ?? Math.ceil(limit * 0.2), "AI_QUOTA_RESERVE_INVALID");
  if (reserve > limit) throw new Error("AI_QUOTA_RESERVE_INVALID");
  if (input.priority !== "interactive" && input.priority !== "ingestion" && input.priority !== "research") throw new Error("AI_QUOTA_PRIORITY_INVALID");
  const remaining = Math.max(0, limit - used);
  const available = input.priority === "interactive" ? remaining : Math.max(0, remaining - reserve);
  const state = used >= limit ? "exhausted" : used >= Math.ceil(limit * 0.8) ? "degraded" : "normal";
  if (used + cost <= limit && cost <= available) return { decision: "allow", priority: input.priority, used, limit, remaining, state, deferredUntil: null };
  return { decision: "defer", priority: input.priority, used, limit, remaining, state, deferredUntil: nextUtcDay(input.now) };
}

export function nextUtcDay(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error("AI_QUOTA_TIME_INVALID");
  const next = new Date(time);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

function integer(value: number, code: string): number { if (!Number.isSafeInteger(value) || value < 0) throw new Error(code); return value; }
function positiveInteger(value: number, code: string): number { if (!Number.isSafeInteger(value) || value < 1) throw new Error(code); return value; }
