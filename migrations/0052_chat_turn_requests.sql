-- Durable at-most-once admission for explicitly keyed chat turns.
-- Pending receipts are never automatically taken over after a timeout.
CREATE TABLE chat_turn_requests (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  response_json TEXT,
  authorization_citations_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  UNIQUE (member_id, idempotency_key),
  CHECK ((status = 'completed' AND response_json IS NOT NULL AND authorization_citations_json IS NOT NULL AND completed_at IS NOT NULL)
    OR (status != 'completed' AND response_json IS NULL AND authorization_citations_json IS NULL AND completed_at IS NULL))
);
