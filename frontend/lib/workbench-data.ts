import type { RecentKnowledgeItem } from "./knowledge-data";
import type { WorkspaceActivityItem } from "./activity-data";
import type { TaskItem, TaskSummary } from "./tasks-data";

export interface WorkbenchSummary {
  taskCount: number;
  overdueTaskCount: number;
  recentKnowledge: readonly { id: string; title: string; summary: string }[];
  recentActivity: readonly { id: string; label: string; href: string | null; createdAt: string }[];
  quickActions: readonly { id: string; href: string; labelKey: string }[];
}

export interface WorkbenchSummaryInput {
  taskSummary?: TaskSummary;
  tasks?: readonly TaskItem[];
  knowledge?: readonly RecentKnowledgeItem[];
  activity?: readonly WorkspaceActivityItem[];
  now?: number;
}

const OPEN_TASK_STATUSES = new Set(["todo", "doing", "blocked"]);

export function buildWorkbenchSummary(input: WorkbenchSummaryInput): WorkbenchSummary {
  const tasks = input.tasks ?? [];
  const taskCount = input.taskSummary
    ? input.taskSummary.todo + input.taskSummary.doing + input.taskSummary.blocked + input.taskSummary.done + input.taskSummary.canceled
    : tasks.length;
  const overdueTaskCount = input.taskSummary?.overdue ?? countOverdueTasks(tasks, input.now ?? Date.now());
  const recentKnowledge = (input.knowledge ?? []).map((item) => ({
    id: item.id,
    title: item.title || "",
    summary: item.lastVisitedAt || "",
  }));
  const recentActivity = (input.activity ?? []).map((item) => ({
    id: item.id,
    label: item.action,
    href: activityHref(item),
    createdAt: item.createdAt,
  }));
  return {
    taskCount,
    overdueTaskCount,
    recentKnowledge,
    recentActivity,
    quickActions: [
      { id: "create-knowledge", href: "/submit", labelKey: "WORKBENCH_QUICK_SUBMIT" },
      { id: "open-tasks", href: "/tasks", labelKey: "WORKBENCH_QUICK_TASKS" },
      { id: "ask-ai", href: "/agent", labelKey: "WORKBENCH_QUICK_AI" },
      { id: "search-knowledge", href: "/search", labelKey: "WORKBENCH_QUICK_SEARCH" },
    ],
  };
}

function countOverdueTasks(tasks: readonly TaskItem[], now: number): number {
  return tasks.filter((task) => OPEN_TASK_STATUSES.has(task.status) && task.dueAt !== null && Date.parse(task.dueAt) < now).length;
}

function activityHref(item: WorkspaceActivityItem): string | null {
  if (item.resourceType === "knowledge") return `/knowledge/${encodeURIComponent(item.resourceId)}`;
  if (item.resourceType === "submission") return "/my-submissions";
  return null;
}
