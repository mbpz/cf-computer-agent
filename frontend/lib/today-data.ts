import { snapshotValidation } from "./snapshot-validation";
import { apiFetch, type Fetcher } from "./api";
import { normalizeCalendarEvent, type CalendarEvent } from "./calendar-data";
import { canonicalInstant } from "./calendar-query";
import { normalizeNumberedPage } from "./numbered-page";
import type { InboxItem } from "./inbox-data";
import type { Project } from "./projects-data";
import type { TaskPage, TaskSummary } from "./tasks-data";

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


const {normalizeTask, normalizeInbox, normalizeProject, rows, unique, object, count} = snapshotValidation("TODAY_RESPONSE_INVALID");
function invalid(): never { throw new Error("TODAY_RESPONSE_INVALID"); }
