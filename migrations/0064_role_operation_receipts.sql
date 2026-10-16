-- A role creation becomes a member-scoped operation with a stable receipt, so a
-- lost response can be retried with the same key and still produce exactly one
-- role and one audit event instead of a duplicate-key conflict.
CREATE TABLE role_operation_receipts (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 128),
  kind TEXT NOT NULL CHECK(kind = 'role.create'),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  role_id TEXT NOT NULL,
  claim_id TEXT NOT NULL UNIQUE,
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND length(response_json) <= 4096),
  created_at TEXT NOT NULL,
  PRIMARY KEY(member_id, operation_id)
);
