-- Administrator knowledge lifecycle writes (trash, restore, purge, rollback)
-- become recorded operations. Each one is identified by the client's operation
-- number inside the knowledge item's own namespace, so a lost response can be
-- retried under the same number and replayed from its original receipt instead
-- of acting twice (a second trash would otherwise fail as an invalid lifecycle
-- transition, a second purge would answer with a different result than the one
-- that committed, and a second rollback would report a different "rolled back
-- from" revision).
--
-- The namespace is the knowledge item, not the member: the same transition
-- requested from two administrator surfaces resolves to one receipt, and a
-- retried operation is answered with the exact item/revision/result the first
-- attempt committed. `actor_id` deliberately carries no foreign key so a
-- receipt survives the acting member's removal, and it is the acting identity
-- of the winning attempt, not an authorization source: every attempt still
-- re-reads the caller's live administrator state and every guarded write still
-- re-checks the item's own state.
--
-- `claim_id` is unique so a racing duplicate can only keep the winner's row.
-- Receipts are written after the guarded write and its audit entry exist, so a
-- replay answers with a decision that actually committed.
CREATE TABLE knowledge_lifecycle_operation_receipts (
  knowledge_item_id TEXT NOT NULL,
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 128),
  kind TEXT NOT NULL CHECK(kind IN ('knowledge.trash', 'knowledge.restore', 'knowledge.purge', 'knowledge.rollback')),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
  claim_id TEXT NOT NULL UNIQUE,
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND length(response_json) <= 8192),
  created_at TEXT NOT NULL,
  PRIMARY KEY(knowledge_item_id, operation_id)
);
