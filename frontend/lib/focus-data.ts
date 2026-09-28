import { canonicalInstant } from "./calendar-query";
import { apiFetch, type Fetcher } from "./api";

export type FocusStatus = "active" | "paused" | "completed" | "abandoned";
export interface FocusSession { id: string; taskId: string; calendarEventId: string | null; clientKey: string; status: FocusStatus; startedAt: string; pausedAt: string | null; endedAt: string | null; elapsedMs: number; }

export async function loadCurrentFocus(requester: Fetcher = fetch, signal?: AbortSignal): Promise<FocusSession | null> {
  const value = await apiFetch<unknown>("/api/focus/current", { requester, signal });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("FOCUS_RESPONSE_INVALID");
  const session = (value as Record<string, unknown>).session;
  return session === null ? null : normalizeSession(session);
}

export async function startFocus(input: { taskId: string; title?: string; durationMinutes?: number }, requester: Fetcher = fetch): Promise<FocusSession> {
  const result = await apiFetch<{ session: unknown }>("/api/focus", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), clientKey: crypto.randomUUID(), ...input }) });
  return normalizeSession(result.session);
}

export async function transitionFocus(id: string, action: "pause" | "resume" | "complete" | "abandon", requester: Fetcher = fetch): Promise<FocusSession> {
  const session = normalizeSession(await apiFetch<unknown>(`/api/focus/${encodeURIComponent(id)}/${action}`, { requester, method: "POST" }));
  if (session.id !== id) throw new Error("FOCUS_RESPONSE_INVALID");
  return session;
}

function normalizeSession(value: unknown): FocusSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("FOCUS_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  if (!validId(record.id) || !validId(record.taskId) || !validId(record.clientKey) || typeof record.status !== "string" || !["active", "paused", "completed", "abandoned"].includes(record.status) || !canonicalInstant(record.startedAt) || typeof record.elapsedMs !== "number" || !Number.isSafeInteger(record.elapsedMs) || record.elapsedMs < 0 || (record.pausedAt != null && !canonicalInstant(record.pausedAt)) || (record.endedAt != null && !canonicalInstant(record.endedAt))) throw new Error("FOCUS_RESPONSE_INVALID");
  return { id: record.id, taskId: record.taskId, calendarEventId: typeof record.calendarEventId === "string" ? record.calendarEventId : null, clientKey: record.clientKey, status: record.status as FocusStatus, startedAt: record.startedAt, pausedAt: typeof record.pausedAt === "string" ? record.pausedAt : null, endedAt: typeof record.endedAt === "string" ? record.endedAt : null, elapsedMs: record.elapsedMs };
}

function validId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value); }
