-- P2-C1: private task subtasks and task dependencies.
CREATE UNIQUE INDEX idx_tasks_id_member ON tasks(id, member_id);

CREATE TABLE task_subtasks (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('todo', 'doing', 'done', 'canceled')),
  position INTEGER NOT NULL CHECK(position >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(member_id, id),
  UNIQUE(task_id, position),
  FOREIGN KEY(task_id, member_id) REFERENCES tasks(id, member_id) ON DELETE CASCADE
);
CREATE INDEX idx_task_subtasks_member_task ON task_subtasks(member_id, task_id, position, id);

CREATE TABLE task_dependencies (
  member_id TEXT NOT NULL REFERENCES members(id),
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(task_id, depends_on_task_id),
  CHECK(task_id <> depends_on_task_id),
  FOREIGN KEY(task_id, member_id) REFERENCES tasks(id, member_id) ON DELETE CASCADE,
  FOREIGN KEY(depends_on_task_id, member_id) REFERENCES tasks(id, member_id) ON DELETE CASCADE
);
CREATE INDEX idx_task_dependencies_member_task ON task_dependencies(member_id, task_id, depends_on_task_id);
