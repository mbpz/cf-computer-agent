-- Extend the unified namespace without changing any existing operation identities.
CREATE TABLE environment_operation_receipts_next (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 128),
  kind TEXT NOT NULL CHECK(kind IN ('environment.create', 'environment.update', 'environment.delete', 'environment.lifecycle')),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  environment_id TEXT NOT NULL,
  claim_id TEXT NOT NULL UNIQUE,
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND length(response_json) <= 4096),
  lifecycle_json TEXT CHECK(lifecycle_json IS NULL OR (json_valid(lifecycle_json) AND length(lifecycle_json) <= 1024)),
  created_at INTEGER NOT NULL,
  UNIQUE(member_id, operation_id)
);
INSERT INTO environment_operation_receipts_next
  (sequence, member_id, operation_id, kind, request_hash, environment_id, claim_id, response_json, created_at)
SELECT sequence, member_id, operation_id, kind, request_hash, environment_id, claim_id, response_json, created_at
FROM environment_operation_receipts ORDER BY sequence;
DROP TABLE environment_operation_receipts;
ALTER TABLE environment_operation_receipts_next RENAME TO environment_operation_receipts;
CREATE INDEX idx_environment_operations_member_page
  ON environment_operation_receipts(member_id, environment_id, sequence DESC);

-- Ordering watermarks only. These are NOT authoritative current runtime states.
CREATE TABLE environment_runtime_heads (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL REFERENCES browser_environments(id) ON DELETE CASCADE,
  runtime_id TEXT NOT NULL CHECK(length(runtime_id) BETWEEN 1 AND 128),
  generation INTEGER NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740990),
  event_index INTEGER NOT NULL CHECK(event_index BETWEEN 1 AND 9007199254740990),
  PRIMARY KEY(member_id, environment_id, runtime_id)
);

-- Immutable append order lets a device traverse numbered pages while new deletions arrive.
CREATE TABLE environment_tombstones_next (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  environment_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 2),
  deleted_at INTEGER NOT NULL,
  UNIQUE(member_id, environment_id)
);
INSERT INTO environment_tombstones_next (member_id, environment_id, version, deleted_at)
SELECT member_id, environment_id, version, deleted_at FROM environment_tombstones
ORDER BY deleted_at, member_id, environment_id;
DROP TABLE environment_tombstones;
ALTER TABLE environment_tombstones_next RENAME TO environment_tombstones;
CREATE INDEX idx_environment_tombstones_member_page ON environment_tombstones(member_id, sequence);
