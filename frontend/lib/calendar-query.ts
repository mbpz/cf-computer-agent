import { parsePageSearch, writePageSearch, type FrontendPageRequest } from "./numbered-page";
import type { CalendarEventStatus } from "./calendar-data";
export interface CalendarRange { from: string; to: string; }
export interface CalendarQuery extends FrontendPageRequest, CalendarRange { status?: CalendarEventStatus; }
export function validCalendarRange(range: CalendarRange): boolean {
  const from = Date.parse(range.from), to = Date.parse(range.to);
  return canonicalInstant(range.from) && canonicalInstant(range.to) && to > from && to - from <= 31 * 86400000;
}
export function canonicalInstant(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
export function defaultCalendarRange(now = new Date()): CalendarRange {
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const to = new Date(from); to.setDate(to.getDate() + 14);
  return { from: from.toISOString(), to: to.toISOString() };
}
export function parseCalendarSearch(search: string, fallback: CalendarRange): CalendarQuery {
  const params = new URLSearchParams(search);
  const range = { from: params.get("from") ?? "", to: params.get("to") ?? "" };
  const valid = params.getAll("from").length === 1 && params.getAll("to").length === 1 && validCalendarRange(range);
  const status = params.get("status");
  return { ...parsePageSearch(search), ...(valid ? range : fallback), ...(!valid && (params.has("from") || params.has("to")) ? { page: 1 } : {}),
    ...(params.getAll("status").length === 1 && ["scheduled", "completed", "canceled"].includes(status ?? "") ? { status: status as CalendarEventStatus } : {}) };
}
export function writeCalendarSearch(search: string, query: CalendarQuery): string {
  if (!validCalendarRange(query)) throw new Error("CALENDAR_RANGE_INVALID");
  const params = new URLSearchParams(writePageSearch(search, query));
  for (const key of ["from", "to", "status", "limit", "cursor"]) params.delete(key);
  params.set("from", query.from); params.set("to", query.to);
  if (query.status) params.set("status", query.status);
  return `?${params}`;
}
export function localCalendarTime(instant: string): string {
  const date = new Date(instant), pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function localCalendarInstant(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && localCalendarTime(date.toISOString()) === value ? date.toISOString() : null;
}
