import type { TaskSummary } from "../tasks/types";
import type { Task } from "../tasks/types";
import type { Project } from "../projects/types";
import type { InboxItem } from "../inbox/types";

export type WorkbenchReviewPeriod = "daily" | "weekly";
export interface WorkbenchReviewSnapshot {
  id: string;
  period: WorkbenchReviewPeriod;
  periodKey: string;
  from: string;
  to: string;
  taskSummary: TaskSummary;
  completed: Task[];
  overdue: Task[];
  blocked: Task[];
  inbox: InboxItem[];
  projects: Project[];
  focusElapsedMs: number;
  createdAt: string;
  updatedAt: string;
}
