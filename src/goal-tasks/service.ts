import { AppError } from "../http";
import { normalizeNumberedPageRequest, type NumberedPageRequest } from "../pagination";
import { nextPlanningVersion, planningConflict, requirePlanningVersion } from "../planning-version";
import type { GoalsService } from "../goals/service";
import type { GoalTasksRepository } from "./repository";
export class GoalTasksService {
  constructor(private readonly repository: GoalTasksRepository, private readonly goals: GoalsService, private readonly now: () => number = Date.now) {}
  async list(memberId: string, goalId: string, request: Partial<NumberedPageRequest> = {}) {
    await this.goals.get(memberId, goalId);
    const result = await this.repository.list(memberId, goalId, normalizeNumberedPageRequest(request, "GOAL_PAGE_INVALID"));
    if (!result) throw new AppError("GOAL_NOT_FOUND", "Goal not found", 404);
    return result;
  }
  async change(memberId: string, goalId: string, taskId: unknown, linked: boolean, expectedUpdatedAt: unknown) {
    const goal = await this.goals.get(memberId, goalId);
    if (typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(taskId)) throw new AppError("GOAL_INVALID", "Invalid task ID", 400);
    if (!await this.repository.ownsTask(memberId, taskId)) throw new AppError("TASK_NOT_FOUND", "Task not found", 404);
    const expected = requirePlanningVersion(expectedUpdatedAt, goal.updatedAt, "GOAL");
    const next = nextPlanningVersion(expected, this.now());
    const changed = await this.repository.change(memberId, goalId, taskId, linked, expected, next);
    if (changed === null) {
      await this.goals.get(memberId, goalId);
      if (!await this.repository.ownsTask(memberId, taskId)) throw new AppError("TASK_NOT_FOUND", "Task not found", 404);
      throw planningConflict("GOAL");
    }
    return { goalId, taskId, linked, changed, updatedAt: new Date(next).toISOString() };
  }
}
