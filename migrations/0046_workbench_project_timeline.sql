-- P4-A: private project timeline items for meetings, decisions, action items and milestones.
-- Every row is member-owned and references the member-owned project.
CREATE TABLE project_timeline_items (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  client_key TEXT NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  kind TEXT NOT NULL CHECK(kind IN ('meeting', 'decision', 'action_item', 'milestone')),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  body TEXT NOT NULL DEFAULT '' CHECK(length(body) <= 200000),
  status TEXT NOT NULL CHECK(status IN ('open', 'done', 'archived')),
  starts_at INTEGER,
  due_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(project_id <> ''),
  CHECK(starts_at IS NULL OR due_at IS NULL OR due_at >= starts_at),
  CHECK(updated_at >= created_at),
  UNIQUE(member_id, client_key),
  FOREIGN KEY(project_id, member_id) REFERENCES projects(id, member_id) ON DELETE CASCADE
);

CREATE INDEX idx_project_timeline_member_project
  ON project_timeline_items(member_id, project_id, updated_at DESC, id DESC);

CREATE INDEX idx_project_timeline_member_due
  ON project_timeline_items(member_id, project_id, due_at, id);
