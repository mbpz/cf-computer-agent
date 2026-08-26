-- Review comments are append-only. Editing creates a new row that points to
-- the prior version; no reviewer or owner can overwrite history in place.
CREATE TABLE review_comments (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES members(id),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL,
  supersedes_comment_id TEXT REFERENCES review_comments(id)
);

CREATE INDEX review_comments_submission_created
ON review_comments(submission_id, created_at ASC, id ASC);

CREATE INDEX review_comments_author_created
ON review_comments(author_id, created_at DESC, id DESC);
