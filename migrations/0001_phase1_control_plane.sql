PRAGMA foreign_keys = ON;

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  access_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'contributor')),
  status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE spaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK(kind IN ('shared', 'legacy')),
  status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
  position INTEGER NOT NULL,
  read_only INTEGER NOT NULL CHECK(read_only IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL REFERENCES spaces(id),
  parent_id TEXT REFERENCES collections(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  submitter_id TEXT NOT NULL REFERENCES members(id),
  requested_space_id TEXT NOT NULL REFERENCES spaces(id),
  requested_collection_id TEXT REFERENCES collections(id),
  kind TEXT NOT NULL CHECK(kind IN ('text', 'markdown', 'code', 'rich_text')),
  status TEXT NOT NULL CHECK(status IN ('draft', 'review_pending', 'rejected')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('member', 'automation', 'system')),
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX one_active_admin ON members(role)
WHERE role='admin' AND status='active';

CREATE INDEX submissions_owner_page
ON submissions(submitter_id, created_at DESC, id DESC);

CREATE INDEX submissions_admin_page
ON submissions(status, created_at DESC, id DESC);

CREATE INDEX audit_page ON audit_events(created_at DESC, id DESC);

INSERT OR IGNORE INTO spaces (
  id, slug, name, description, kind, status, position, read_only, created_at, updated_at
) VALUES
  ('default', 'default', 'Default', '', 'shared', 'active', 0, 0, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('legacy-personal', 'legacy-personal', 'Legacy Personal', '', 'legacy', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');
