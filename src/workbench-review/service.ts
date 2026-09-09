import { AppError } from "../http";
import type { InboxService } from "../inbox/service";
import type { ProjectsService } from "../projects/service";
import type { TasksService } from "../tasks/service";
import type { FocusService } from "../focus/service";
import type { WorkbenchReviewRepositoryPort } from "./repository";
import type { WorkbenchReviewPeriod, WorkbenchReviewSnapshot } from "./types";

export class WorkbenchReviewService {
  constructor(private readonly repository: WorkbenchReviewRepositoryPort, private readonly services: { tasks: TasksService; inbox: InboxService; projects: ProjectsService; focus: FocusService }, private readonly now: () => Date = () => new Date()) {}
  async get(memberId: string, period: unknown): Promise<WorkbenchReviewSnapshot> {
    if (period !== "daily" && period !== "weekly") throw new AppError("WORKBENCH_REVIEW_PERIOD_INVALID", "Review period is invalid", 400);
    const value = period as WorkbenchReviewPeriod;
    const range = reviewRange(value, this.now());
    const existing = await this.repository.find(memberId, value, range.periodKey);
    if (existing) return existing;
    const [summary, completed, overdue, blocked, inbox, projects, focus] = await Promise.all([
      this.services.tasks.summary(memberId),
      this.services.tasks.list(memberId, { status: "done" }, { page: 1, pageSize: 20 }),
      this.services.tasks.list(memberId, { due: "overdue" }, { page: 1, pageSize: 20 }),
      this.services.tasks.list(memberId, { status: "blocked" }, { page: 1, pageSize: 20 }),
      this.services.inbox.list(memberId, { status: "inbox" }, { limit: 20 }),
      this.services.projects.list(memberId, { status: "active" }, { limit: 20 }),
      this.services.focus.current(memberId),
    ]);
    const now = this.now().toISOString();
    return this.repository.upsert(memberId, { id: `review:${memberId}:${value}:${range.periodKey}`, period: value, periodKey: range.periodKey, from: range.from, to: range.to, taskSummary: summary, completed: completed.items, overdue: overdue.items, blocked: blocked.items, inbox: inbox.items, projects: projects.items, focusElapsedMs: focus?.elapsedMs ?? 0, createdAt: now, updatedAt: now });
  }
}

function reviewRange(period: WorkbenchReviewPeriod, now: Date): { periodKey: string; from: string; to: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const from = new Date(end.getTime() - (period === "daily" ? 86_400_000 : 7 * 86_400_000));
  const key = period === "daily" ? now.toISOString().slice(0, 10) : `${now.getUTCFullYear()}-W${String(weekNumber(now)).padStart(2, "0")}`;
  return { periodKey: key, from: from.toISOString(), to: end.toISOString() };
}
function weekNumber(date: Date): number { const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1)); return Math.ceil((((date.getTime() - first.getTime()) / 86_400_000) + first.getUTCDay() + 1) / 7); }
