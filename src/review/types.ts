export type ReviewPeriod = "daily" | "weekly";
export type ReviewReason = "new" | "to_read";

export interface ReviewScope {
  memberId: string;
  role: "admin" | "contributor";
}

export interface ReviewItem {
  knowledgeItemId: string;
  revisionId: string;
  title: string;
  publishedAt: string;
  lastVisitedAt: string | null;
  reason: ReviewReason;
  favorite: boolean;
}

export interface ReviewResult {
  period: ReviewPeriod;
  from: string;
  to: string;
  items: ReviewItem[];
}

export interface ReviewRepositoryPort {
  list(scope: ReviewScope, period: ReviewPeriod, now: Date): Promise<ReviewResult>;
}
