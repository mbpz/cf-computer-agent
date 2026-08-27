-- Workbench tasks: per-member private todo entities with optional knowledge links.
-- Timestamps are epoch milliseconds; the repository maps them to ISO strings.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('todo', 'doing', 'blocked', 'done', 'canceled')),
  progress INTEGER NOT NULL CHECK(progress >= 0 AND progress <= 100),
  priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
  due_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_tasks_member_status_due ON tasks(member_id, status, due_at);

CREATE TABLE task_tags (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (task_id, tag)
);
CREATE INDEX idx_task_tags_member ON task_tags(member_id, tag);

CREATE TABLE task_links (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id),
  created_at INTEGER NOT NULL,
  UNIQUE (task_id, knowledge_item_id)
);
CREATE INDEX idx_task_links_member ON task_links(member_id, task_id);

INSERT OR IGNORE INTO menus (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
VALUES ('menu-tasks', 'menu-workspace', 'tasks', 'NAV_TASKS', '/tasks', 'CheckSquare', 'workspace', 6, '0x100000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');
