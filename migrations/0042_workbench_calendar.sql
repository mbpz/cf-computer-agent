-- P2-C2: member-private calendar events and focus blocks.
CREATE UNIQUE INDEX idx_projects_id_member ON projects(id, member_id);

CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  client_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('event', 'focus')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK(all_day IN (0, 1)),
  status TEXT NOT NULL CHECK(status IN ('scheduled', 'completed', 'canceled')),
  task_id TEXT,
  project_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(member_id, client_key),
  CHECK(ends_at > starts_at),
  FOREIGN KEY(task_id, member_id) REFERENCES tasks(id, member_id) ON DELETE SET NULL,
  FOREIGN KEY(project_id, member_id) REFERENCES projects(id, member_id) ON DELETE SET NULL
);
CREATE INDEX idx_calendar_events_member_range ON calendar_events(member_id, starts_at, ends_at, id);
CREATE INDEX idx_calendar_events_member_status ON calendar_events(member_id, status, starts_at, id);
