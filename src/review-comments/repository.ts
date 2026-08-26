import type { ReviewCommentRecord } from "./types";

export interface ReviewCommentCreate {
  id: string;
  submissionId: string;
  authorId: string;
  body: string;
  createdAt: string;
  supersedesCommentId?: string | null;
}

export interface ReviewCommentsRepositoryPort {
  findSubmissionOwner(submissionId: string): Promise<string | null>;
  list(submissionId: string): Promise<ReviewCommentRecord[]>;
  find(commentId: string): Promise<ReviewCommentRecord | null>;
  create(input: ReviewCommentCreate): Promise<ReviewCommentRecord>;
}

type ReviewCommentRow = {
  id: string;
  submission_id: string;
  author_id: string;
  owner_id: string;
  body: string;
  created_at: string;
  supersedes_comment_id: string | null;
};

export class ReviewCommentsRepository implements ReviewCommentsRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async findSubmissionOwner(submissionId: string): Promise<string | null> {
    const row = await this.db.prepare(
      "SELECT submitter_id FROM submissions WHERE id = ? LIMIT 1",
    ).bind(submissionId).first<{ submitter_id: string }>();
    return row?.submitter_id ?? null;
  }

  async list(submissionId: string): Promise<ReviewCommentRecord[]> {
    const rows = await this.db.prepare(
      `SELECT rc.id, rc.submission_id, rc.author_id, s.submitter_id AS owner_id,
              rc.body, rc.created_at, rc.supersedes_comment_id
       FROM review_comments rc
       JOIN submissions s ON s.id = rc.submission_id
       WHERE rc.submission_id = ?
       ORDER BY rc.created_at ASC, rc.id ASC
       LIMIT 100`,
    ).bind(submissionId).all<ReviewCommentRow>();
    return rows.results.map(mapRow);
  }

  async find(commentId: string): Promise<ReviewCommentRecord | null> {
    const row = await this.db.prepare(
      `SELECT rc.id, rc.submission_id, rc.author_id, s.submitter_id AS owner_id,
              rc.body, rc.created_at, rc.supersedes_comment_id
       FROM review_comments rc
       JOIN submissions s ON s.id = rc.submission_id
       WHERE rc.id = ? LIMIT 1`,
    ).bind(commentId).first<ReviewCommentRow>();
    return row ? mapRow(row) : null;
  }

  async create(input: ReviewCommentCreate): Promise<ReviewCommentRecord> {
    await this.db.prepare(
      `INSERT INTO review_comments
       (id, submission_id, author_id, body, created_at, supersedes_comment_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.id,
      input.submissionId,
      input.authorId,
      input.body,
      input.createdAt,
      input.supersedesCommentId ?? null,
    ).run();
    const created = await this.find(input.id);
    if (!created) throw new Error("Review comment disappeared after create");
    return created;
  }
}

function mapRow(row: ReviewCommentRow): ReviewCommentRecord {
  return {
    id: row.id,
    submissionId: row.submission_id,
    authorId: row.author_id,
    ownerId: row.owner_id,
    body: row.body,
    createdAt: row.created_at,
    ...(row.supersedes_comment_id === null ? {} : { supersedesCommentId: row.supersedes_comment_id }),
  };
}
