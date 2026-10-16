-- Two administrator surfaces that act on storage and on the instance itself
-- become recorded operations: reclaiming orphaned asset objects and closing or
-- reopening admission for maintenance. Both carry the client's operation number
-- and the exact impact it confirmed, so a lost response can be retried under the
-- same number and replayed from its original receipt instead of deleting a
-- second object set, draining twice or inventing a second audit event.
--
-- The namespace is global, not member scoped, because both surfaces act on
-- instance-wide state (one R2 bucket, one coordinator): two administrators
-- confirming the same reclamation share one receipt. `actor_id` records who
-- performed the winning attempt and deliberately carries no foreign key, so a
-- receipt survives the acting member's removal; it is not an authorization
-- source, because every attempt re-reads the caller's live admin state.
CREATE TABLE admin_operation_receipts (
  kind TEXT NOT NULL CHECK(kind IN ('asset.orphans.reclaim', 'maintenance.begin_drain', 'maintenance.resume')),
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 128),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
  claim_id TEXT NOT NULL UNIQUE,
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND length(response_json) <= 65536),
  created_at TEXT NOT NULL,
  PRIMARY KEY(kind, operation_id)
);
