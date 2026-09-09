-- P2-C5: member-private focus sessions with resumable elapsed time.
-- A focus session is the state authority; its optional calendar_event_id points
-- at the unified Calendar focus block created by the service layer.
CREATE TABLE focus_sessions (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  calendar_event_id TEXT,
  client_key TEXT NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'completed', 'abandoned')),
  started_at INTEGER NOT NULL,
  paused_at INTEGER,
  ended_at INTEGER,
  elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK(elapsed_ms >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(ended_at IS NULL OR ended_at >= started_at),
  FOREIGN KEY(task_id, member_id) REFERENCES tasks(id, member_id) ON DELETE CASCADE,
  UNIQUE(member_id, client_key)
);

CREATE UNIQUE INDEX idx_focus_sessions_member_open
  ON focus_sessions(member_id)
  WHERE status IN ('active', 'paused');
CREATE INDEX idx_focus_sessions_member_updated
  ON focus_sessions(member_id, updated_at DESC, id DESC);
