import { AppError } from "../http";
import { parsePageRequest, type PageRequest } from "../pagination";
import type { RecentVisitPage, RecentVisitScope, RecentVisitsRepositoryPort } from "./types";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export class RecentVisitsService {
  constructor(private readonly repository: RecentVisitsRepositoryPort, private readonly now: () => Date = () => new Date()) {}

  async record(scope: RecentVisitScope, knowledgeItemId: string): Promise<void> {
    assertId(knowledgeItemId);
    await this.repository.record(scope, knowledgeItemId, this.now().toISOString());
  }

  async list(scope: RecentVisitScope, request?: PageRequest): Promise<RecentVisitPage> {
    return this.repository.list(scope, parsePageRequest(request?.limit, request?.cursor));
  }
}

function assertId(value: string): void {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new AppError("RECENT_VISIT_INVALID", "Knowledge identifier is invalid", 400);
}

