-- Private personal-work Inbox. Binary originals remain out of scope for this
-- free-tier slice; file_ref stores only a caller-provided reference.
CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  client_key TEXT NOT NULL CHECK(length(client_key) BETWEEN 1 AND 160),
  kind TEXT NOT NULL CHECK(kind IN ('text', 'link', 'file_ref')),
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 200000),
  source_url TEXT CHECK(source_url IS NULL OR length(source_url) BETWEEN 1 AND 2048),
  status TEXT NOT NULL CHECK(status IN ('inbox', 'archived', 'promoted')),
  promoted_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  promoted_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(updated_at >= created_at),
  CHECK(kind != 'link' OR source_url IS NOT NULL),
  CHECK(kind = 'link' OR source_url IS NULL OR length(source_url) > 0)
);

CREATE UNIQUE INDEX idx_inbox_items_member_client_key
  ON inbox_items(member_id, client_key);

CREATE INDEX idx_inbox_items_member_status_created
  ON inbox_items(member_id, status, created_at DESC, id DESC);

INSERT OR IGNORE INTO menus (
  id, parent_id, key, label_key, path, icon, group_name, position,
  required_bits, status, visible, is_system, created_at, updated_at
)
VALUES (
  'menu-inbox', 'menu-workspace', 'inbox', 'NAV_INBOX', '/inbox', 'Tray',
  'workspace', 10, '0x0', 'active', 1, 1,
  '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
);
