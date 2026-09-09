-- P2-C6: deterministic private daily/weekly review snapshots.
CREATE TABLE workbench_review_snapshots (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK(period IN ('daily', 'weekly')),
  period_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(member_id, period, period_key)
);
CREATE INDEX idx_workbench_review_member_updated ON workbench_review_snapshots(member_id, updated_at DESC, id DESC);
