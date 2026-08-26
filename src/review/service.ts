import { AppError } from "../http";
import type { ReviewRepositoryPort, ReviewResult, ReviewScope } from "./types";

export class ReviewService {
  constructor(
    private readonly repository: ReviewRepositoryPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(scope: ReviewScope, period: unknown = "daily"): Promise<ReviewResult> {
    if (!scope || typeof scope.memberId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(scope.memberId)
      || (scope.role !== "admin" && scope.role !== "contributor")) {
      throw new AppError("KNOWLEDGE_REVIEW_INVALID", "Review scope is invalid", 400);
    }
    if (period !== "daily" && period !== "weekly") {
      throw new AppError("KNOWLEDGE_REVIEW_PERIOD_INVALID", "Review period is invalid", 400);
    }
    return this.repository.list(scope, period, this.now());
  }
}
