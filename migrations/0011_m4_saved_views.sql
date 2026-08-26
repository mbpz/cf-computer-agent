-- M4 saved search views are owner-scoped, versioned, and bounded.
CREATE TABLE saved_views (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  filters_json TEXT NOT NULL CHECK(json_valid(filters_json) AND length(filters_json) <= 4096),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(member_id, name)
);

CREATE INDEX saved_views_member_updated
  ON saved_views(member_id, updated_at DESC, id DESC);

