import { validCalendarIntent, type CalendarCreateIntent } from "./calendar-create-intent";
import { normalizeNumberedPage, writePageSearch, type FrontendNumberedPage } from "./numbered-page";
import { canonicalInstant, validCalendarRange, type CalendarQuery } from "./calendar-query";
import { apiFetch, type Fetcher } from "./api";

export type CalendarEventKind = "event" | "focus";
export type CalendarEventStatus = "scheduled" | "completed" | "canceled";
export interface CalendarEvent { updatedAt: string; id: string; clientKey: string; kind: CalendarEventKind; title: string; description: string; startsAt: string; endsAt: string; timezone: string; allDay: boolean; status: CalendarEventStatus; taskId: string | null; projectId: string | null; }
export interface CalendarPage { items: CalendarEvent[]; nextCursor?: string; }

export async function loadCalendar(input: { from: Date; to: Date; limit?: number; cursor?: string; status?: CalendarEventStatus }, requester: Fetcher = fetch): Promise<CalendarPage> {
  const params = new URLSearchParams({ from: input.from.toISOString(), to: input.to.toISOString() });
  params.set("limit", String(input.limit ?? 50));
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.status) params.set("status", input.status);
  const value = await apiFetch<unknown>(`/api/calendar/events?${params.toString()}`, { requester });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CALENDAR_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items.map(normalizeEvent).filter((item): item is CalendarEvent => item !== null) : [];
  if (!Array.isArray(record.items) || items.length !== record.items.length) throw new Error("CALENDAR_RESPONSE_INVALID");
  return { items, ...(typeof record.nextCursor === "string" ? { nextCursor: record.nextCursor } : {}) };
}

export async function loadCalendarNumbered(input: CalendarQuery, requester: Fetcher = fetch, signal?: AbortSignal): Promise<FrontendNumberedPage<CalendarEvent>> {
  writePageSearch("", input);
  if (!validCalendarRange(input) || (input.status !== undefined && !["scheduled", "completed", "canceled"].includes(input.status))) throw new Error("CALENDAR_QUERY_INVALID");
  const params = new URLSearchParams({ from: input.from, to: input.to, page: String(input.page), pageSize: String(input.pageSize) });
  if (input.status) params.set("status", input.status);
  const raw = await apiFetch<unknown>(`/api/calendar/events?${params}`, { requester, signal });
  const page = normalizeNumberedPage(raw, value => {
    const item = normalizeEvent(value);
    if (!item || Date.parse(item.startsAt) >= Date.parse(input.to) || Date.parse(item.endsAt) <= Date.parse(input.from)
      || (input.status && item.status !== input.status)) throw new Error("CALENDAR_RESPONSE_INVALID");
    return item;
  });
  if (page.pagination.page !== input.page || page.pagination.pageSize !== input.pageSize || new Set(page.items.map(item => item.id)).size !== page.items.length) throw new Error("CALENDAR_RESPONSE_INVALID");
  return page;
}

export async function loadCalendarEvent(id: string, requester: Fetcher = fetch, signal?: AbortSignal): Promise<CalendarEvent> {
  const item = normalizeEvent(await apiFetch<unknown>(`/api/calendar/events/${encodeURIComponent(id)}`, { requester, signal }));
  if (!item || item.id !== id) throw new Error("CALENDAR_RESPONSE_INVALID");
  return item;
}
export async function readCreatedCalendar(intent: CalendarCreateIntent, requester: Fetcher = fetch, signal?: AbortSignal): Promise<CalendarEvent> {
  const event = await loadCalendarEvent(intent.id, requester, signal);
  if (event.clientKey !== intent.clientKey) throw new Error("CALENDAR_RECEIPT_MISMATCH");
  return event;
}
export async function createCalendarEvent(input: CalendarCreateIntent, requester: Fetcher = fetch): Promise<{ event: CalendarEvent; created: boolean }> {
  if (!validCalendarIntent(input)) throw new Error("CALENDAR_INTENT_INVALID");
  const raw = await apiFetch<unknown>("/api/calendar/events", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const result = raw as { event?: unknown; created?: unknown } | null;
  const event = normalizeEvent(result?.event);
  if (!event || typeof result?.created !== "boolean" || event.id !== input.id || event.clientKey !== input.clientKey) throw new Error("CALENDAR_RECEIPT_MISMATCH");
  return { event, created: result.created };
}
export async function cancelCalendarEvent(id: string, expectedUpdatedAt: string, requester: Fetcher = fetch): Promise<CalendarEvent> {
  if (!canonicalInstant(expectedUpdatedAt)) throw new Error("CALENDAR_VERSION_INVALID");
  const event = normalizeEvent(await apiFetch<unknown>(`/api/calendar/events/${encodeURIComponent(id)}`, { requester, method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt }) }));
  if (!event || event.id !== id || event.status !== "canceled" || Date.parse(event.updatedAt) <= Date.parse(expectedUpdatedAt)) throw new Error("CALENDAR_RESPONSE_INVALID");
  return event;
}

function normalizeEvent(value: unknown): CalendarEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.clientKey !== "string" || typeof record.title !== "string" || typeof record.startsAt !== "string" || typeof record.endsAt !== "string") return null;
  if (record.kind !== "event" && record.kind !== "focus") return null;
  if (record.status !== "scheduled" && record.status !== "completed" && record.status !== "canceled") return null;
  if (!canonicalInstant(record.updatedAt) || !canonicalInstant(record.startsAt) || !canonicalInstant(record.endsAt)
    || Date.parse(record.endsAt) <= Date.parse(record.startsAt) || !record.id.trim() || !record.clientKey.trim() || !record.title.trim()
    || typeof record.description !== "string" || typeof record.timezone !== "string" || typeof record.allDay !== "boolean"
    || [record.taskId, record.projectId].some(id => id !== null && (typeof id !== "string" || !id.trim()))) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: record.timezone }); } catch { return null; }
  return { updatedAt: record.updatedAt, id: record.id, clientKey: record.clientKey, kind: record.kind, title: record.title, description: typeof record.description === "string" ? record.description : "", startsAt: record.startsAt, endsAt: record.endsAt, timezone: typeof record.timezone === "string" ? record.timezone : "UTC", allDay: record.allDay === true, status: record.status, taskId: typeof record.taskId === "string" ? record.taskId : null, projectId: typeof record.projectId === "string" ? record.projectId : null };
}
