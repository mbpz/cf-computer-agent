ALTER TABLE submissions RENAME TO submissions_legacy;

DROP INDEX submissions_owner_page;
DROP INDEX submissions_admin_page;

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  submitter_id TEXT NOT NULL REFERENCES members(id),
  requested_space_id TEXT NOT NULL REFERENCES spaces(id),
  requested_collection_id TEXT REFERENCES collections(id),
  kind TEXT NOT NULL CHECK(kind IN ('text', 'markdown', 'code', 'rich_text')),
  status TEXT NOT NULL CHECK(status IN ('draft', 'review_pending', 'published', 'rejected', 'revision_requested')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO submissions (
  id,
  submitter_id,
  requested_space_id,
  requested_collection_id,
  kind,
  status,
  title,
  content,
  created_at,
  updated_at
)
SELECT
  id,
  submitter_id,
  requested_space_id,
  requested_collection_id,
  kind,
  status,
  title,
  content,
  created_at,
  updated_at
FROM submissions_legacy;

CREATE INDEX submissions_owner_page
ON submissions(submitter_id, created_at DESC, id DESC);

CREATE INDEX submissions_admin_page
ON submissions(status, created_at DESC, id DESC);

CREATE UNIQUE INDEX submissions_idempotency
ON submissions(submitter_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

DROP TABLE submissions_legacy;

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES members(id),
  space_id TEXT NOT NULL REFERENCES spaces(id),
  collection_id TEXT REFERENCES collections(id),
  kind TEXT NOT NULL CHECK(kind IN ('text', 'markdown', 'code')),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE source_versions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
  ordinal INTEGER NOT NULL CHECK(ordinal > 0),
  content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(source_id, ordinal)
);

CREATE INDEX source_versions_content_sha256
ON source_versions(content_sha256, created_at, id);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(space_id, slug)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id),
  reviewer_id TEXT NOT NULL REFERENCES members(id),
  decision TEXT NOT NULL CHECK(decision IN ('published', 'rejected', 'revision_requested')),
  reason_code TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('shared', 'admin_only')),
  created_at TEXT NOT NULL
);

CREATE TABLE knowledge_items (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  collection_id TEXT REFERENCES collections(id),
  current_revision_id TEXT REFERENCES revisions(id),
  status TEXT NOT NULL CHECK(status IN ('active', 'trashed')),
  search_status TEXT NOT NULL CHECK(search_status IN ('pending', 'indexed', 'search_degraded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE revisions (
  id TEXT PRIMARY KEY,
  knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id),
  source_version_id TEXT NOT NULL UNIQUE REFERENCES source_versions(id),
  normalized_path TEXT NOT NULL UNIQUE,
  content_sha256 TEXT NOT NULL,
  title TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL CHECK(visibility IN ('shared', 'admin_only')),
  published_by TEXT NOT NULL REFERENCES members(id),
  published_at TEXT NOT NULL
);

CREATE TABLE revision_tags (
  revision_id TEXT NOT NULL REFERENCES revisions(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  PRIMARY KEY(revision_id, tag_id)
);

CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES revisions(id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  heading_path TEXT NOT NULL,
  start_line INTEGER NOT NULL CHECK(start_line > 0),
  end_line INTEGER NOT NULL CHECK(end_line >= start_line),
  body TEXT NOT NULL,
  search_title TEXT NOT NULL,
  search_tags TEXT NOT NULL,
  search_body TEXT NOT NULL,
  UNIQUE(revision_id, ordinal)
);

CREATE TABLE publication_intents (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id),
  revision_id TEXT NOT NULL UNIQUE,
  knowledge_item_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL REFERENCES members(id),
  title TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('shared', 'admin_only')),
  tags_json TEXT NOT NULL,
  normalized_path TEXT NOT NULL UNIQUE,
  content_sha256 TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending_content', 'content_written', 'completed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('index_revision')),
  resource_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending', 'running', 'completed', 'failed_retryable', 'failed_terminal')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  available_at TEXT NOT NULL,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(kind, resource_id)
);

CREATE INDEX knowledge_items_current_page
ON knowledge_items(status, updated_at DESC, id DESC);

CREATE INDEX sources_owner_page
ON sources(owner_id, updated_at DESC, id DESC);

CREATE INDEX chunks_revision
ON chunks(revision_id, ordinal);

CREATE INDEX publication_intents_pending
ON publication_intents(state, updated_at, submission_id);

CREATE VIRTUAL TABLE chunks_fts USING fts5(
  chunk_id UNINDEXED,
  title,
  tags,
  body,
  tokenize='unicode61 remove_diacritics 2'
);
