import { type FocusTransitionIntent } from "./focus-transition-intent";
import { type FocusCreateIntent, validFocusIntent } from "./focus-create-intent";
import { canonicalInstant } from "./calendar-query";
import { apiFetch, type Fetcher } from "./api";

export type FocusStatus = "active" | "paused" | "completed" | "abandoned";
export interface FocusSession { id: string; taskId: string; calendarEventId: string | null; clientKey: string; startTitle: string | null; durationMinutes: number | null; status: FocusStatus; startedAt: string; pausedAt: string | null; endedAt: string | null; elapsedMs: number; updatedAt: string; }

export async function loadCurrentFocus(requester: Fetcher = fetch, signal?: AbortSignal): Promise<FocusSession | null> {
  const value = await apiFetch<unknown>("/api/focus/current", { requester, signal });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("FOCUS_RESPONSE_INVALID");
  const session = (value as Record<string, unknown>).session;
  return session === null ? null : normalizeSession(session);
}

export async function loadFocusReceipt(intent: FocusCreateIntent, requester: Fetcher = fetch, signal?: AbortSignal): Promise<FocusSession> {
  const session = normalizeSession(await apiFetch<unknown>(`/api/focus/${encodeURIComponent(intent.id)}`, {requester, signal}));
  return matchFocusReceipt(session, intent);
}
export async function loadFocusTransitionReceipt(intent: FocusTransitionIntent, requester: Fetcher = fetch, signal?: AbortSignal): Promise<FocusSession> {
  const session = normalizeSession(await apiFetch<unknown>(`/api/focus/${encodeURIComponent(intent.id)}`, {requester, signal}));
  if (session.id !== intent.id || session.taskId !== intent.taskId || session.clientKey !== intent.clientKey || Date.parse(session.updatedAt) < Date.parse(intent.expectedUpdatedAt)) throw new Error("FOCUS_RESPONSE_INVALID");
  return session;
}
export async function startFocus(input: FocusCreateIntent, requester: Fetcher = fetch): Promise<FocusSession> {
  if (!validFocusIntent(input)) throw new Error("FOCUS_INTENT_INVALID");
  const result = await apiFetch<{ session: unknown }>("/api/focus", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  return matchFocusReceipt(normalizeSession(result.session), input);
}
function matchFocusReceipt(session: FocusSession, intent: FocusCreateIntent): FocusSession {
  if (session.id !== intent.id || session.clientKey !== intent.clientKey || session.taskId !== intent.taskId || session.startTitle !== intent.title || session.durationMinutes !== intent.durationMinutes) throw new Error("FOCUS_RESPONSE_INVALID");
  return session;
}

export async function transitionFocus(id: string, action: "pause" | "resume" | "complete" | "abandon", expectedUpdatedAt: string, requester: Fetcher = fetch): Promise<FocusSession> {
  if (!canonicalInstant(expectedUpdatedAt)) throw new Error("FOCUS_VERSION_INVALID");
  const session = normalizeSession(await apiFetch<unknown>(`/api/focus/${encodeURIComponent(id)}/${action}`, { requester, method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({expectedUpdatedAt}) }));
  const expectedStatus = {pause: "paused", resume: "active", complete: "completed", abandon: "abandoned"}[action];
  if (session.id !== id || session.status !== expectedStatus || Date.parse(session.updatedAt) <= Date.parse(expectedUpdatedAt)) throw new Error("FOCUS_RESPONSE_INVALID");
  return session;
}

function normalizeSession(value: unknown): FocusSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("FOCUS_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  if (!validId(record.id) || !validId(record.taskId) || !validId(record.clientKey) || typeof record.status !== "string" || !["active", "paused", "completed", "abandoned"].includes(record.status) || !canonicalInstant(record.updatedAt) || !canonicalInstant(record.startedAt) || typeof record.elapsedMs !== "number" || !Number.isSafeInteger(record.elapsedMs) || record.elapsedMs < 0 || (record.pausedAt != null && !canonicalInstant(record.pausedAt)) || (record.endedAt != null && !canonicalInstant(record.endedAt))) throw new Error("FOCUS_RESPONSE_INVALID");
  return { id: record.id, taskId: record.taskId, calendarEventId: typeof record.calendarEventId === "string" ? record.calendarEventId : null, clientKey: record.clientKey, startTitle: typeof record.startTitle === "string" ? record.startTitle : null, durationMinutes: typeof record.durationMinutes === "number" ? record.durationMinutes : null, status: record.status as FocusStatus, startedAt: record.startedAt, pausedAt: typeof record.pausedAt === "string" ? record.pausedAt : null, endedAt: typeof record.endedAt === "string" ? record.endedAt : null, elapsedMs: record.elapsedMs, updatedAt: record.updatedAt };
}

function validId(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value); }
