import { AppError } from "./http";

type PlanningKind = "GOAL" | "PROJECT" | "PROJECT_TIMELINE";

export function requirePlanningVersion(value: unknown, current: string, kind: PlanningKind): number {
  const epoch = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(epoch) || epoch < 0 || new Date(epoch).toISOString() !== value) {
    throw new AppError(`${kind}_VERSION_INVALID`, "A canonical expectedUpdatedAt version is required", 400);
  }
  if (value !== current) throw planningConflict(kind);
  return epoch;
}

export function nextPlanningVersion(expected: number, now: number): number {
  const next = Math.max(expected + 1, now);
  if (!Number.isSafeInteger(next) || !Number.isFinite(new Date(next).getTime())) {
    throw new AppError("PLANNING_VERSION_INVALID", "Cannot advance the planning version", 500);
  }
  return next;
}

export function planningConflict(kind: PlanningKind): AppError {
  return new AppError(`${kind}_VERSION_CONFLICT`, "The record changed; reload before editing", 409, false);
}
