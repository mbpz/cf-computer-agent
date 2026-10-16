import type { Page, PageRequest } from "../pagination";

export interface RecentVisitScope {
  memberId: string;
  role: "admin" | "contributor";
}

export interface RecentVisit {
  knowledgeItemId: string;
  spaceId: string;
  collectionId: string | null;
  revisionId: string;
  title: string;
  visibility: "shared" | "admin_only";
  publishedAt: string;
  lastVisitedAt: string;
  visitCount: number;
}

export type RecentVisitPage = Page<RecentVisit>;

export interface RecentVisitsRepositoryPort {
  /** `visitIdentity` is explicit: a replay of the same reading must not increment twice. */
  record(scope: RecentVisitScope, knowledgeItemId: string, visitedAt: string, visitIdentity: string): Promise<void>;
  list(scope: RecentVisitScope, request: PageRequest): Promise<RecentVisitPage>;
}

