-- Private personal-work Projects. Project and relation rows are owned by one member.
-- Timestamps are epoch milliseconds; repositories map them to ISO strings.
CREATE TABLE projects (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  client_key TEXT NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  description TEXT CHECK(description IS NULL OR length(description) <= 200000),
  status TEXT NOT NULL CHECK(status IN ('planned', 'active', 'paused', 'completed', 'archived')),
  progress INTEGER NOT NULL CHECK(progress >= 0 AND progress <= 100),
  target_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(updated_at >= created_at)
);

CREATE UNIQUE INDEX idx_projects_member_client_key
  ON projects(member_id, client_key);

CREATE INDEX idx_projects_member_status_updated
  ON projects(member_id, status, updated_at DESC, id DESC);

CREATE TABLE project_goals (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, goal_id)
);

CREATE INDEX idx_project_goals_member_project
  ON project_goals(member_id, project_id, created_at DESC, goal_id DESC);

CREATE TABLE project_tasks (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, task_id)
);

CREATE INDEX idx_project_tasks_member_project
  ON project_tasks(member_id, project_id, created_at DESC, task_id DESC);

INSERT OR IGNORE INTO menus (
  id, parent_id, key, label_key, path, icon, group_name, position,
  required_bits, status, visible, is_system, created_at, updated_at
)
VALUES (
  'menu-projects', 'menu-workspace', 'projects', 'NAV_PROJECTS', '/projects', 'FolderSimple',
  'workspace', 8, '0x100000', 'active', 1, 1,
  '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
);
