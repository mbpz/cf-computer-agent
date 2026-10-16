-- R4-010: task deletion keeps its existing hard-delete semantics for the live row
-- (children keep cascading, and every existing task reader stays authoritative),
-- and records one minimal, member-scoped tombstone per deleted task. The tombstone
-- is the delete receipt: a retried DELETE converges on the recorded outcome instead
-- of a second 404, and no task payload is retained, so a receipt can neither
-- resurrect nor disclose a deleted task. `deleted_at` bounds how long the receipt
-- stays replayable; final cleanup of expired receipts belongs to the approved
-- lifecycle cleanup, not to this migration.
CREATE TABLE task_tombstones (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (member_id, task_id)
);
