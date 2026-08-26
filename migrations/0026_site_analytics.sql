CREATE TABLE site_visit_events (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  visit_bucket TEXT NOT NULL,
  path TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  member_id TEXT REFERENCES members(id),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX site_visit_dedupe
ON site_visit_events(day, visit_bucket, path, visitor_hash);

CREATE INDEX site_visit_day_page
ON site_visit_events(day, created_at DESC, id DESC);
