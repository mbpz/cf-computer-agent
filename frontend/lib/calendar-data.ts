import { normalizeNumberedPage, writePageSearch, type FrontendNumberedPage } from "./numbered-page";
import { canonicalInstant, validCalendarRange, type CalendarQuery } from "./calendar-query";
import { apiFetch, type Fetcher } from "./api";

export type CalendarEventKind = "event" | "focus";
export type CalendarEventStatus = "scheduled" | "completed" | "canceled";
export interface CalendarEvent { id: string; clientKey: string; kind: CalendarEventKind; title: string; description: string; startsAt: string; endsAt: string; timezone: string; allDay: boolean; status: CalendarEventStatus; taskId: string | null; projectId: string | null; }
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
    const item = normalizeEvent(value), record = value as Record<string, unknown>;
    if (!item || !item.id.trim() || !item.clientKey.trim() || !canonicalInstant(item.startsAt) || !canonicalInstant(item.endsAt)
      || Date.parse(item.endsAt) <= Date.parse(item.startsAt) || Date.parse(item.startsAt) >= Date.parse(input.to) || Date.parse(item.endsAt) <= Date.parse(input.from)
      || typeof record.description !== "string" || typeof record.timezone !== "string" || typeof record.allDay !== "boolean"
      || ["taskId", "projectId"].some(key => record[key] !== null && (typeof record[key] !== "string" || !record[key].trim()))
      || (input.status && item.status !== input.status)) throw new Error("CALENDAR_RESPONSE_INVALID");
    try { new Intl.DateTimeFormat("en", { timeZone: item.timezone }); } catch { throw new Error("CALENDAR_RESPONSE_INVALID"); }
    return item;
  });
  if (page.pagination.page !== input.page || page.pagination.pageSize !== input.pageSize || new Set(page.items.map(item => item.id)).size !== page.items.length) throw new Error("CALENDAR_RESPONSE_INVALID");
  return page;
}

export async function createCalendarEvent(input: { title: string; description?: string; kind?: CalendarEventKind; startsAt: string; endsAt: string; timezone?: string; allDay?: boolean }, requester: Fetcher = fetch): Promise<{ event: CalendarEvent; created: boolean }> {
  return apiFetch<{ event: CalendarEvent; created: boolean }>("/api/calendar/events", { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), clientKey: crypto.randomUUID(), kind: "event", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", allDay: false, ...input }) });
}

export async function cancelCalendarEvent(id: string, requester: Fetcher = fetch): Promise<CalendarEvent> {
  return apiFetch<CalendarEvent>(`/api/calendar/events/${encodeURIComponent(id)}`, { requester, method: "DELETE" });
}

function normalizeEvent(value: unknown): CalendarEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.clientKey !== "string" || typeof record.title !== "string" || typeof record.startsAt !== "string" || typeof record.endsAt !== "string") return null;
  if (record.kind !== "event" && record.kind !== "focus") return null;
  if (record.status !== "scheduled" && record.status !== "completed" && record.status !== "canceled") return null;
  return { id: record.id, clientKey: record.clientKey, kind: record.kind, title: record.title, description: typeof record.description === "string" ? record.description : "", startsAt: record.startsAt, endsAt: record.endsAt, timezone: typeof record.timezone === "string" ? record.timezone : "UTC", allDay: record.allDay === true, status: record.status, taskId: typeof record.taskId === "string" ? record.taskId : null, projectId: typeof record.projectId === "string" ? record.projectId : null };
}
