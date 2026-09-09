-- Private personal-work Goals. Every row is owned by one authenticated member.
-- Timestamps are epoch milliseconds; the repository maps them to ISO strings.
CREATE TABLE goals (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  client_key TEXT NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  description TEXT CHECK(description IS NULL OR length(description) <= 200000),
  status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'completed', 'archived')),
  progress INTEGER NOT NULL CHECK(progress >= 0 AND progress <= 100),
  target_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(updated_at >= created_at)
);

CREATE UNIQUE INDEX idx_goals_member_client_key
  ON goals(member_id, client_key);

CREATE INDEX idx_goals_member_status_updated
  ON goals(member_id, status, updated_at DESC, id DESC);

INSERT OR IGNORE INTO menus (
  id, parent_id, key, label_key, path, icon, group_name, position,
  required_bits, status, visible, is_system, created_at, updated_at
)
VALUES (
  'menu-goals', 'menu-workspace', 'goals', 'NAV_GOALS', '/goals', 'Target',
  'workspace', 7, '0x100000', 'active', 1, 1,
  '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
);
