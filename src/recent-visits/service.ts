import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { RecentVisitPage, RecentVisitScope, RecentVisitsRepositoryPort } from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export class RecentVisitsService {
  constructor(
    private readonly repository: RecentVisitsRepositoryPort,
    private readonly now: () => Date = () => new Date(),
    private readonly id: () => string = () => crypto.randomUUID(),
  ) {}

  /**
   * Records one reading. `visitIdentity` is the explicit identity of that
   * reading: a transport retry reuses it and does not increment twice, while a
   * genuine second visit supplies a fresh identity. A caller that omits it is
   * treated as a distinct visit, so unkeyed reads keep their previous meaning.
   */
  async record(scope: RecentVisitScope, knowledgeItemId: string, visitIdentity?: string): Promise<void> {
    assertId(knowledgeItemId);
    if (visitIdentity !== undefined && !ID_PATTERN.test(visitIdentity)) {
      throw new AppError("RECENT_VISIT_IDENTITY_INVALID", "Visit identity is invalid", 400);
    }
    await this.repository.record(scope, knowledgeItemId, this.now().toISOString(), visitIdentity ?? this.id());
  }

  async list(scope: RecentVisitScope, request?: PageRequest): Promise<RecentVisitPage> {
    return this.repository.list(scope, parsePageRequest(request?.limit, request?.cursor));
  }
}

function assertId(value: string): void {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new AppError("RECENT_VISIT_INVALID", "Knowledge identifier is invalid", 400);
}
