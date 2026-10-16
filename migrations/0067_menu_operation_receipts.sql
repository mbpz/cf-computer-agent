-- Administrator menu writes become recorded operations. A creation intent is
-- identified by its natural menu key (the stable key the admin editor already
-- keeps across a refresh) and a deletion intent by the removed row's id, so a
-- lost response can be retried by the same identity and replayed from its
-- original receipt instead of failing as a duplicate or inventing a second
-- audit. The deletion receipt is also the tombstone that keeps repeated deletes
-- converging after the row itself is gone.
--
-- Menus are global navigation configuration, so the operation namespace is not
-- member scoped: two administrators creating the same entry share one receipt.
-- `actor_id` records who performed the winning attempt and deliberately carries
-- no foreign key, so a receipt survives the acting member's removal.
CREATE TABLE menu_operation_receipts (
  kind TEXT NOT NULL CHECK(kind IN ('menu.create', 'menu.delete')),
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 128),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
  claim_id TEXT NOT NULL UNIQUE,
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND length(response_json) <= 4096),
  created_at TEXT NOT NULL,
  PRIMARY KEY(kind, operation_id)
);
