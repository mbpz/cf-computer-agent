import { apiFetch, type Fetcher } from "./api";
import type { TaskSummary, TaskItem } from "./tasks-data";
import type { InboxItem } from "./inbox-data";
import type { Project } from "./projects-data";

export interface WorkbenchReviewSnapshot { id: string; period: "daily" | "weekly"; periodKey: string; from: string; to: string; taskSummary: TaskSummary; completed: TaskItem[]; overdue: TaskItem[]; blocked: TaskItem[]; inbox: InboxItem[]; projects: Project[]; focusElapsedMs: number; }
export async function loadWorkbenchReview(period: "daily" | "weekly", requester: Fetcher = fetch): Promise<WorkbenchReviewSnapshot> {
  const value = await apiFetch<unknown>(`/api/workbench/review?period=${period}`, { requester });
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("REVIEW_RESPONSE_INVALID");
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || (record.period !== "daily" && record.period !== "weekly") || typeof record.periodKey !== "string" || !record.taskSummary || !Array.isArray(record.completed) || !Array.isArray(record.overdue) || !Array.isArray(record.blocked) || !Array.isArray(record.inbox) || !Array.isArray(record.projects) || typeof record.focusElapsedMs !== "number") throw new Error("REVIEW_RESPONSE_INVALID");
  return record as unknown as WorkbenchReviewSnapshot;
}
