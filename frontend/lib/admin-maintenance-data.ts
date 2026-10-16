import { ApiRequestError, apiFetch, type Fetcher } from "./api";

/**
 * The instance's maintenance state, exactly as the coordinator reports it.
 * `DRAINED` only means this coordinator has zero registered active permits; it is
 * never presented as a global freeze. When the instance has no maintenance
 * control configured at all, every read answers `MAINTENANCE_CONTROL_UNAVAILABLE`
 * and that is shown as such instead of an invented state.
 */
export type MaintenancePhase = "OPEN" | "DRAINING" | "DRAINED";
export type MaintenanceAlert = "NONE" | "WARNING" | "CRITICAL" | "EXHAUSTED";

export interface MaintenanceSnapshot {
  readonly phase: MaintenancePhase;
  readonly epoch: number;
  readonly window: string | null;
  readonly active: number;
}

export interface MaintenanceCapacity extends MaintenanceSnapshot {
  readonly records: number;
  readonly tombstones: number;
  readonly capacityLimit: number;
  readonly capacityRemaining: number;
  readonly alert: MaintenanceAlert;
  readonly requiresManualReview: boolean;
}

/** The one server answer that means "maintenance control is not enabled here". */
export function maintenanceControlDisabled(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === "MAINTENANCE_CONTROL_UNAVAILABLE";
}

function invalid(): Error {
  return new Error("MAINTENANCE_RESPONSE_INVALID");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}

function isPhase(value: unknown): value is MaintenancePhase {
  return value === "OPEN" || value === "DRAINING" || value === "DRAINED";
}

function isAlert(value: unknown): value is MaintenanceAlert {
  return value === "NONE" || value === "WARNING" || value === "CRITICAL" || value === "EXHAUSTED";
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function windowValue(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(value)) throw invalid();
  return value;
}

export function maintenanceSnapshot(value: unknown): MaintenanceSnapshot {
  const body = record(value);
  const epoch = count(body.epoch);
  const active = count(body.active);
  if (!isPhase(body.phase) || epoch === null || active === null) throw invalid();
  return Object.freeze({ phase: body.phase, epoch, window: windowValue(body.window), active });
}

export function maintenanceCapacity(value: unknown): MaintenanceCapacity {
  const snapshot = maintenanceSnapshot(value);
  const body = record(value);
  const fields = {
    records: count(body.records),
    tombstones: count(body.tombstones),
    capacityLimit: count(body.capacityLimit),
    capacityRemaining: count(body.capacityRemaining),
  };
  if (fields.records === null || fields.tombstones === null || fields.capacityLimit === null || fields.capacityRemaining === null) throw invalid();
  if (!isAlert(body.alert) || typeof body.requiresManualReview !== "boolean") throw invalid();
  return Object.freeze({
    ...snapshot,
    records: fields.records,
    tombstones: fields.tombstones,
    capacityLimit: fields.capacityLimit,
    capacityRemaining: fields.capacityRemaining,
    alert: body.alert,
    requiresManualReview: body.requiresManualReview,
  });
}

export async function loadMaintenanceStatus(requester: Fetcher = fetch, signal?: AbortSignal): Promise<MaintenanceSnapshot> {
  return maintenanceSnapshot(await apiFetch<unknown>("/api/admin/maintenance/status", { requester, signal }));
}

export async function loadMaintenanceCapacity(requester: Fetcher = fetch, signal?: AbortSignal): Promise<MaintenanceCapacity> {
  return maintenanceCapacity(await apiFetch<unknown>("/api/admin/maintenance/capacity", { requester, signal }));
}
