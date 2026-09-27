import { apiFetch, type Fetcher } from "./api";
import { normalizeNumberedPage, writePageSearch, type FrontendNumberedPage, type FrontendPageRequest } from "./numbered-page";
import { canonicalPlanningVersion } from "./planning-write-recovery";
export interface GoalTask { id: string; title: string; linked: boolean; }
export interface GoalTaskPage extends FrontendNumberedPage<GoalTask> { goalId: string; expectedUpdatedAt: string; summary: { taskCount: number; completedTaskCount: number }; }
export async function loadGoalTasks(goalId: string, request: FrontendPageRequest, requester: Fetcher = fetch, signal?: AbortSignal): Promise<GoalTaskPage> {
  writePageSearch("", request);
  const value = await apiFetch<unknown>(`/api/goals/${encodeURIComponent(goalId)}/tasks?${new URLSearchParams({ page: String(request.page), pageSize: String(request.pageSize) })}`, { requester, signal });
  const record = value as Partial<GoalTaskPage> | null;
  if (!record || record.goalId !== goalId || !canonicalPlanningVersion(record.expectedUpdatedAt)) throw new Error("GOAL_TASKS_INVALID");
  const page = normalizeNumberedPage(value, (item): GoalTask => {
    const row = item as Partial<GoalTask> | null;
    if (!row || typeof row.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(row.id) || typeof row.title !== "string" || !row.title.trim() || typeof row.linked !== "boolean") throw new Error("GOAL_TASKS_INVALID");
    return { id: row.id, title: row.title, linked: row.linked };
  });
  const summary = record.summary;
  if (page.pagination.page !== request.page || page.pagination.pageSize !== request.pageSize || new Set(page.items.map(item => item.id)).size !== page.items.length || !summary || !Number.isSafeInteger(summary.taskCount) || !Number.isSafeInteger(summary.completedTaskCount) || summary.taskCount < 0 || summary.completedTaskCount < 0 || summary.completedTaskCount > summary.taskCount || summary.taskCount > page.pagination.total || page.items.filter(item => item.linked).length > summary.taskCount) throw new Error("GOAL_TASKS_INVALID");
  return { ...page, goalId, expectedUpdatedAt: record.expectedUpdatedAt, summary: { taskCount: summary.taskCount, completedTaskCount: summary.completedTaskCount } };
}
export async function setGoalTask(goalId: string, taskId: string, linked: boolean, expectedUpdatedAt: string, requester: Fetcher = fetch): Promise<string> {
  if (!canonicalPlanningVersion(expectedUpdatedAt)) throw new Error("GOAL_TASK_VERSION_INVALID");
  const value = linked
    ? await apiFetch<unknown>(`/api/goals/${encodeURIComponent(goalId)}/tasks`, { requester, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ taskId, expectedUpdatedAt }) })
    : await apiFetch<unknown>(`/api/goals/${encodeURIComponent(goalId)}/tasks/${encodeURIComponent(taskId)}`, { requester, method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt }) });
  const receipt = value as { goalId?: unknown; taskId?: unknown; linked?: unknown; changed?: unknown; updatedAt?: unknown } | null;
  if (!receipt || receipt.goalId !== goalId || receipt.taskId !== taskId || receipt.linked !== linked || typeof receipt.changed !== "boolean" || !canonicalPlanningVersion(receipt.updatedAt) || Date.parse(receipt.updatedAt) <= Date.parse(expectedUpdatedAt)) throw new Error("GOAL_TASK_RECEIPT_INVALID");
  return receipt.updatedAt;
}
