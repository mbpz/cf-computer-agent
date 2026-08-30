-- Recipient-owned Workbench notifications. Rows are append-only except for
-- the recipient-scoped read_at transition performed by the repository.
CREATE TABLE notifications (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
  recipient_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE
    CHECK(length(recipient_member_id) BETWEEN 1 AND 128),
  event_type TEXT NOT NULL
    CHECK(length(event_type) BETWEEN 1 AND 64)
    CHECK(event_type IN (
      'task.status_changed',
      'task.assignment_changed',
      'discussion.mention',
      'discussion.reply',
      'task.due',
      'task.overdue'
    )),
  actor_member_id TEXT REFERENCES members(id) ON DELETE SET NULL
    CHECK(actor_member_id IS NULL OR length(actor_member_id) BETWEEN 1 AND 128),
  target_kind TEXT NOT NULL
    CHECK(length(target_kind) BETWEEN 1 AND 32)
    CHECK(target_kind IN ('task', 'discussion_thread', 'knowledge_item')),
  target_id TEXT NOT NULL CHECK(length(target_id) BETWEEN 1 AND 128),
  payload_json TEXT NOT NULL
    CHECK(length(CAST(payload_json AS BLOB)) BETWEEN 2 AND 4096)
    CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  deduplication_key TEXT NOT NULL CHECK(length(deduplication_key) BETWEEN 1 AND 256),
  read_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK(read_at IS NULL OR read_at >= created_at),
  UNIQUE (recipient_member_id, deduplication_key)
);

CREATE INDEX idx_notifications_recipient_created
  ON notifications(recipient_member_id, created_at DESC, id DESC);
CREATE INDEX idx_notifications_recipient_type_created
  ON notifications(recipient_member_id, event_type, created_at DESC, id DESC);
CREATE INDEX idx_notifications_recipient_unread_created
  ON notifications(recipient_member_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;
