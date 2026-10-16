import { apiFetch, type Fetcher } from "./api";

export interface AdminDashboardTrendPoint {
  day: string;
  submissions: number;
  publications: number;
}

export interface AdminDashboardActivityEvent {
  id: string;
  actorKind: "member" | "automation" | "system";
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
}

export interface AdminDashboardSummary {
  trend: AdminDashboardTrendPoint[];
  activity: AdminDashboardActivityEvent[];
}

const utcDay = /^\d{4}-\d{2}-\d{2}$/u;

export interface LoadAdminDashboardSummaryInput {
  requester?: Fetcher;
  signal?: AbortSignal;
}

/** Reads the dashboard's trend and activity snapshot. A malformed payload throws
 * instead of becoming an empty series, because an empty series renders as a real
 * zero total. */
export async function loadAdminDashboardSummary({ requester = fetch, signal }: LoadAdminDashboardSummaryInput = {}): Promise<AdminDashboardSummary> {
  return normalizeSummary(await apiFetch("/api/admin/summary", { requester, signal }));
}

function normalizeSummary(value: unknown): AdminDashboardSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.trend) || !Array.isArray(record.activity)) throw invalidResponse();
  return { trend: record.trend.map(normalizeTrendPoint), activity: record.activity.map(normalizeActivityEvent) };
}

function normalizeTrendPoint(value: unknown): AdminDashboardTrendPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
  const record = value as Record<string, unknown>;
  if (typeof record.day !== "string" || !utcDay.test(record.day)) throw invalidResponse();
  return { day: record.day, submissions: count(record.submissions), publications: count(record.publications) };
}

function normalizeActivityEvent(value: unknown): AdminDashboardActivityEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
  const { id, actorKind, actorId, action, resourceType, resourceId, createdAt } = value as Record<string, unknown>;
  if (typeof id !== "string" || !id) throw invalidResponse();
  if (actorKind !== "member" && actorKind !== "automation" && actorKind !== "system") throw invalidResponse();
  if (actorId !== null && (typeof actorId !== "string" || !actorId)) throw invalidResponse();
  if (typeof action !== "string" || !action) throw invalidResponse();
  if (typeof resourceType !== "string" || !resourceType) throw invalidResponse();
  if (resourceId !== null && (typeof resourceId !== "string" || !resourceId)) throw invalidResponse();
  if (typeof createdAt !== "string" || !createdAt) throw invalidResponse();
  return {
    id,
    actorKind,
    actorId,
    action,
    resourceType,
    resourceId,
    createdAt,
  };
}

function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalidResponse();
  return value;
}

function invalidResponse(): Error {
  return new Error("ADMIN_SUMMARY_RESPONSE_INVALID");
}
