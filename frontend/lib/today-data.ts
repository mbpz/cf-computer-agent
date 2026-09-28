import { apiFetch, type Fetcher } from "./api";
import { normalizeCalendarEvent, type CalendarEvent } from "./calendar-data";
import { canonicalInstant } from "./calendar-query";
import { normalizeNumberedPage } from "./numbered-page";
import type { InboxItem } from "./inbox-data";
import type { Project } from "./projects-data";
import type { TaskItem, TaskPage, TaskSummary } from "./tasks-data";

export interface TodaySnapshot { date: string; tasks: TaskPage; taskSummary: TaskSummary; inbox: InboxItem[]; projects: Project[]; calendar: CalendarEvent[]; }

export async function loadToday(requester: Fetcher = fetch, signal?: AbortSignal): Promise<TodaySnapshot> {
  // An unsuccessful constituent read invalidates the whole snapshot. Never invent zeros.
  const value = await apiFetch<unknown>("/api/today", { requester, signal });
  return normalizeToday(value);
}

function normalizeToday(value: unknown): TodaySnapshot {
  const record = object(value), date = record.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || !canonicalInstant(`${date}T00:00:00.000Z`)) invalid();
  const from = Date.parse(`${date}T00:00:00.000Z`), to = from + 86400000;
  const tasks = normalizeNumberedPage(record.tasks, normalizeTask);
  if (tasks.pagination.page !== 1 || tasks.pagination.pageSize !== 20) invalid();
  unique(tasks.items);
  if (tasks.items.some(task => task.dueAt === null || Date.parse(task.dueAt) < from || Date.parse(task.dueAt) >= to || !["todo", "doing", "blocked"].includes(task.status))) invalid();
  const summary = object(record.taskSummary);
  const taskSummary: TaskSummary = {todo: count(summary.todo), doing: count(summary.doing), blocked: count(summary.blocked), done: count(summary.done), canceled: count(summary.canceled), dueToday: count(summary.dueToday), overdue: count(summary.overdue)};
  count(taskSummary.todo + taskSummary.doing + taskSummary.blocked);
  const calendar = rows(record.calendar, 20, item => {
    const event = normalizeCalendarEvent(item);
    if (!event || Date.parse(event.startsAt) >= to || Date.parse(event.endsAt) <= from) invalid();
    return event;
  });
  return { date, tasks, taskSummary, calendar, inbox: rows(record.inbox, 10, normalizeInbox), projects: rows(record.projects, 10, normalizeProject) };
}

function normalizeTask(value: unknown): TaskItem {
  const r = object(value);
  if (typeof r.status !== "string" || !["todo", "doing", "blocked", "done", "canceled"].includes(r.status) || typeof r.priority !== "string" || !["low", "medium", "high"].includes(r.priority)) invalid();
  return { id: id(r.id), title: text(r.title, true), notes: text(r.notes), status: r.status as TaskItem["status"], priority: r.priority as TaskItem["priority"], progress: progress(r.progress), dueAt: optionalDate(r.dueAt), completedAt: optionalDate(r.completedAt), createdAt: date(r.createdAt), updatedAt: date(r.updatedAt) };
}
function normalizeInbox(value: unknown): InboxItem {
  const r = object(value);
  if (r.kind !== "text" && r.kind !== "link" && r.kind !== "file_ref") invalid();
  if (r.status !== "inbox") invalid();
  return { id: id(r.id), clientKey: id(r.clientKey), kind: r.kind, content: text(r.content, true), sourceUrl: r.sourceUrl === null ? null : text(r.sourceUrl), status: "inbox", promotedTaskId: optionalId(r.promotedTaskId), promotedSubmissionId: optionalId(r.promotedSubmissionId), createdAt: date(r.createdAt), updatedAt: date(r.updatedAt) };
}
function normalizeProject(value: unknown): Project {
  const r = object(value);
  if (r.status !== "active") invalid();
  return { id: id(r.id), clientKey: id(r.clientKey), title: text(r.title, true), description: r.description === null ? null : text(r.description), status: "active", progress: progress(r.progress), targetAt: optionalDate(r.targetAt), createdAt: date(r.createdAt), updatedAt: date(r.updatedAt) };
}
function rows<T extends {id: string}>(value: unknown, limit: number, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(value) || value.length > limit) invalid();
  const result = value.map(parse); unique(result); return result;
}
function unique(rows: {id: string}[]) { if (new Set(rows.map(row => row.id)).size !== rows.length) invalid(); }
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) invalid(); return value as Record<string, unknown>; }
function text(value: unknown, nonempty = false): string { if (typeof value !== "string" || (nonempty && !value.trim())) invalid(); return value; }
function id(value: unknown): string { const result = text(value, true); if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(result)) invalid(); return result; }
function optionalId(value: unknown): string | null { return value === null ? null : id(value); }
function date(value: unknown): string { if (!canonicalInstant(value)) invalid(); return value; }
function optionalDate(value: unknown): string | null { return value === null ? null : date(value); }
function count(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(); return value; }
function progress(value: unknown): number { const result = count(value); if (result > 100) invalid(); return result; }
function invalid(): never { throw new Error("TODAY_RESPONSE_INVALID"); }
