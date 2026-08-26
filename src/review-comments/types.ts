export type ReviewCommentAuthorRole = "admin" | "owner";

export interface ReviewCommentViewer {
  memberId: string;
  role: "admin" | "contributor";
}

/** Public comment shape. Owner responses intentionally omit authorId. */
export interface ReviewComment {
  id: string;
  submissionId: string;
  authorRole: ReviewCommentAuthorRole;
  authorId?: string;
  body: string;
  createdAt: string;
  supersedesCommentId?: string | null;
}

export interface ReviewCommentRecord extends Omit<ReviewComment, "authorRole" | "authorId"> {
  authorId: string;
  ownerId: string;
}
