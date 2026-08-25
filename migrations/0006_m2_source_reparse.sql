-- M2 reparses are durable candidates first. They never mutate a published
-- Revision or source_versions row; an administrator must explicitly promote a
-- candidate through a later publication operation.
CREATE TABLE source_reparse_jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  base_source_version_id TEXT NOT NULL REFERENCES source_versions(id),
  submission_id TEXT NOT NULL REFERENCES submissions(id),
  requested_by TEXT NOT NULL REFERENCES members(id),
  parser_version TEXT NOT NULL,
  parser_schema_version TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL CHECK(length(source_fingerprint) = 64),
  status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'indexed', 'failed_retryable', 'failed_terminal')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  candidate_content TEXT,
  candidate_content_sha256 TEXT CHECK(candidate_content_sha256 IS NULL OR length(candidate_content_sha256) = 64),
  candidate_source_identity_sha256 TEXT CHECK(candidate_source_identity_sha256 IS NULL OR length(candidate_source_identity_sha256) = 64),
  candidate_code_metadata TEXT,
  candidate_ordinal INTEGER CHECK(candidate_ordinal IS NULL OR candidate_ordinal > 0),
  candidate_line_count INTEGER CHECK(candidate_line_count IS NULL OR candidate_line_count > 0),
  candidate_created_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_id, source_fingerprint, parser_version, parser_schema_version)
);

CREATE INDEX source_reparse_jobs_status_page
ON source_reparse_jobs(status, updated_at ASC, id ASC);

CREATE INDEX source_reparse_jobs_source_page
ON source_reparse_jobs(source_id, created_at DESC, id DESC);
