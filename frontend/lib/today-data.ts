import { apiFetch, type Fetcher } from "./api";
import type { CalendarEvent } from "./calendar-data";
import type { InboxItem } from "./inbox-data";
import type { Project } from "./projects-data";
import type { TaskItem, TaskPage, TaskSummary } from "./tasks-data";

export interface TodaySnapshot { date: string; tasks: TaskPage; taskSummary: TaskSummary; inbox: InboxItem[]; projects: Project[]; calendar: CalendarEvent[]; }

export async function loadToday(requester: Fetcher = fetch): Promise<TodaySnapshot> {
  const value = await apiFetch<unknown>("/api/today", { requester });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("TODAY_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.date !== "string" || !record.tasks || !record.taskSummary || !Array.isArray(record.inbox) || !Array.isArray(record.projects) || !record.calendar) throw new Error("TODAY_RESPONSE_INVALID");
  return { date: record.date, tasks: record.tasks as TaskPage, taskSummary: record.taskSummary as TaskSummary, inbox: record.inbox as InboxItem[], projects: record.projects as Project[], calendar: record.calendar as CalendarEvent[] };
}
