-- Immutable, actor-scoped receipts for retry-safe administrative collection creation.
-- Applied locally only until the separate release/migration gate is authorized.
CREATE TABLE admin_collection_creation_requests (
  actor_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL CHECK(length(request_key) BETWEEN 8 AND 128),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  response_json TEXT NOT NULL CHECK(json_valid(response_json)),
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id, request_key)
);
