-- Direct private goal/task edges. Project membership never implies this relation.
CREATE UNIQUE INDEX idx_goals_member_id_unique ON goals(member_id, id);
CREATE UNIQUE INDEX idx_tasks_member_id_unique ON tasks(member_id, id);
CREATE TABLE goal_tasks (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  goal_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, goal_id, task_id),
  FOREIGN KEY (member_id, goal_id) REFERENCES goals(member_id, id) ON DELETE CASCADE,
  FOREIGN KEY (member_id, task_id) REFERENCES tasks(member_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_goal_tasks_member_task ON goal_tasks(member_id, task_id);
