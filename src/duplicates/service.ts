import type { DuplicateCandidatePage, DuplicateDecision } from "./types";
import { DuplicateCandidatesRepository, DuplicateRepositoryConflictError } from "./repository";
import { AppError } from "../http";
import type { NumberedPageRequest } from "../pagination";

export class DuplicateCandidatesService {
  constructor(
    private readonly repository: DuplicateCandidatesRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  listPending(request: NumberedPageRequest): Promise<DuplicateCandidatePage> {
    return this.repository.listPending(request);
  }

  async decide(reviewerId: string, submissionId: string, decision: unknown): Promise<Awaited<ReturnType<DuplicateCandidatesRepository["decide"]>>> {
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(reviewerId) || !/^[A-Za-z0-9_-]{1,128}$/u.test(submissionId)) {
      throw new AppError("DUPLICATE_REQUEST_INVALID", "Duplicate candidate request is invalid", 400);
    }
    if (decision !== "associate" && decision !== "keep_separate" && decision !== "reject") {
      throw new AppError("DUPLICATE_DECISION_INVALID", "Duplicate decision is invalid", 400);
    }
    const now = this.now().toISOString();
    try {
      return await this.repository.decide(submissionId, reviewerId, decision as DuplicateDecision, {
        id: `duplicate-decision-${submissionId}`, actorKind: "member", actorId: reviewerId,
        action: "submission.duplicate_decided", resourceType: "submission", resourceId: submissionId,
        metadata: { decision: decision as DuplicateDecision }, createdAt: now,
      }, now);
    } catch (error) {
      if (error instanceof DuplicateRepositoryConflictError) {
        throw new AppError(
          error.kind === "not_found" ? "DUPLICATE_NOT_FOUND" : "DUPLICATE_DECISION_CONFLICT",
          error.kind === "not_found" ? "Duplicate candidate not found" : "Duplicate candidate was already decided",
          error.kind === "not_found" ? 404 : 409,
        );
      }
      throw error;
    }
  }
}
