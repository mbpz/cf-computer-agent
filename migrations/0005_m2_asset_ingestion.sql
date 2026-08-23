CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES members(id),
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size > 0),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256) = 64),
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ready', 'quarantined', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id, idempotency_key)
);

CREATE INDEX assets_owner_page ON assets(owner_id, created_at DESC, id DESC);

CREATE TABLE parse_jobs (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL UNIQUE REFERENCES assets(id),
  status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'succeeded', 'failed_retryable', 'failed_terminal')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX parse_jobs_status_page ON parse_jobs(status, updated_at ASC, id ASC);
