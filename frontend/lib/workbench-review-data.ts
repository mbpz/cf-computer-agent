import { snapshotValidation } from "./snapshot-validation";
import { apiFetch, type Fetcher } from "./api";
import type { TaskSummary, TaskItem } from "./tasks-data";
import type { InboxItem } from "./inbox-data";
import type { Project } from "./projects-data";

export interface WorkbenchReviewSnapshot { id: string; period: "daily" | "weekly"; periodKey: string; from: string; to: string; taskSummary: TaskSummary; completed: TaskItem[]; overdue: TaskItem[]; blocked: TaskItem[]; inbox: InboxItem[]; projects: Project[]; focusElapsedMs: number; }
export async function loadWorkbenchReview(period: "daily" | "weekly", requester: Fetcher = fetch, signal?: AbortSignal): Promise<WorkbenchReviewSnapshot> {
  const value = await apiFetch<unknown>(`/api/workbench/review?period=${period}`, { requester, signal });
  const r = object(value);
  if (r.period !== period) invalid();
  const from = date(r.from), to = date(r.to), periodKey = text(r.periodKey, true);
  if (!from.endsWith("T00:00:00.000Z") || !to.endsWith("T00:00:00.000Z")
    || Date.parse(to) - Date.parse(from) !== (period === "daily" ? 1 : 7) * 86400000
    || (period === "daily" ? periodKey !== from.slice(0,10) : !/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/u.test(periodKey))) invalid();
  const summary = object(r.taskSummary);
  const taskSummary: TaskSummary = {todo: count(summary.todo), doing: count(summary.doing), blocked: count(summary.blocked), done: count(summary.done), canceled: count(summary.canceled), dueToday: count(summary.dueToday), overdue: count(summary.overdue)};
  count(taskSummary.todo + taskSummary.doing + taskSummary.blocked);
  const completed = rows(r.completed, 20, normalizeTask), overdue = rows(r.overdue, 20, normalizeTask), blocked = rows(r.blocked, 20, normalizeTask);
  if (completed.some(item => item.status !== "done" || item.completedAt === null)
    || blocked.some(item => item.status !== "blocked")
    || overdue.some(item => !["todo", "doing", "blocked"].includes(item.status) || item.dueAt === null || Date.parse(item.dueAt) >= Date.parse(to))) invalid();
  const inbox = rows(r.inbox, 20, normalizeInbox), projects = rows(r.projects, 20, normalizeProject);
  // Target IDs must be usable by each detail API; snapshot IDs may include colons.
  if ([...completed, ...overdue, ...blocked, ...inbox, ...projects].some(item => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(item.id))) invalid();
  return { id: id(r.id), period, periodKey, from, to, taskSummary, completed, overdue, blocked, inbox, projects, focusElapsedMs: count(r.focusElapsedMs) };
}
const {object, text, id, date, count, rows, normalizeTask, normalizeInbox, normalizeProject, invalid} = snapshotValidation("REVIEW_RESPONSE_INVALID");
