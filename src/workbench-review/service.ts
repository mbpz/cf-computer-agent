import { reviewRange } from "../../shared/workbench-review-period";
export { reviewRange } from "../../shared/workbench-review-period";
import { AppError } from "../http";
import type { WorkbenchReviewRepositoryPort } from "./repository";
import type { WorkbenchReviewSnapshot } from "./types";
import type { WorkScope } from "../maintenance/lifecycle";
import { runWork } from "../maintenance/work";

export class WorkbenchReviewService {
  constructor(private readonly repository: WorkbenchReviewRepositoryPort, private readonly now: () => Date = () => new Date(), private readonly workScope?: WorkScope) {}
  async get(memberId: string, period: unknown): Promise<WorkbenchReviewSnapshot> {
    if (period !== "daily" && period !== "weekly") throw new AppError("WORKBENCH_REVIEW_PERIOD_INVALID", "Review period is invalid", 400);
    const now = this.now();
    const range = reviewRange(period, now);
    // Aggregate and persist in one statement; never reuse a stale period cache.
    return runWork(this.workScope, () => this.repository.refresh(memberId, period, range, now));
  }
}

