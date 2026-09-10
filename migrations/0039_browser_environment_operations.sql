-- Unified member-scoped idempotency namespace. Preserve original creation replies.
CREATE TABLE environment_operation_receipts (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 128),
  kind TEXT NOT NULL CHECK(kind IN ('environment.create', 'environment.update', 'environment.delete')),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  environment_id TEXT NOT NULL,
  claim_id TEXT NOT NULL UNIQUE,
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND length(response_json) <= 4096),
  created_at INTEGER NOT NULL,
  UNIQUE(member_id, operation_id)
);
INSERT INTO environment_operation_receipts
  (member_id, operation_id, kind, request_hash, environment_id, claim_id, response_json, created_at)
SELECT member_id, operation_id, 'environment.create', request_hash, environment_id,
  environment_id, response_json, created_at FROM environment_create_receipts
ORDER BY created_at, member_id, operation_id;
DROP TABLE environment_create_receipts;
CREATE INDEX idx_environment_operations_member_page
  ON environment_operation_receipts(member_id, environment_id, sequence DESC);

-- No private files or live-state promises. Retained until the member is deleted.
CREATE TABLE environment_tombstones (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 2),
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY(member_id, environment_id)
);

-- FK SET NULL alone would silently change metadata without invalidating editors.
CREATE TRIGGER browser_environment_detach_task BEFORE DELETE ON tasks
BEGIN
  UPDATE browser_environments SET task_id = NULL, version = version + 1,
    updated_at = MAX(updated_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
  WHERE task_id = OLD.id;
END;
