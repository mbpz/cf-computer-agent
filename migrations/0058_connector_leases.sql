-- Persist single-use consumption independently of device restart. No raw ticket.
CREATE UNIQUE INDEX idx_connector_connect_ticket_id ON connector_authorization_receipts(json_extract(response_json, '$.ticketId')) WHERE kind = 'connect';
CREATE TABLE connector_leases (
  lease_id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL UNIQUE REFERENCES browser_environments(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  runtime_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  consumer_id TEXT NOT NULL CHECK(length(consumer_id) BETWEEN 1 AND 128),
  revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740990),
  expires_at INTEGER NOT NULL,
  renew_after INTEGER NOT NULL
);
CREATE TABLE connector_lease_tickets (
  ticket_id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 128),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  lease_id TEXT NOT NULL,
  expected_revision INTEGER NOT NULL,
  key_id TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND length(response_json) <= 8192),
  UNIQUE(member_id, operation_id),
  UNIQUE(lease_id, expected_revision)
);
CREATE TABLE connector_ticket_consumptions (
  ticket_id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE,
  lease_id TEXT NOT NULL,
  consumer_id TEXT NOT NULL,
  ack_json TEXT NOT NULL CHECK(json_valid(ack_json) AND length(ack_json) <= 4096),
  consumed_at INTEGER NOT NULL
);
-- Keep one operation namespace across both receipt stores, atomically at write.
CREATE TRIGGER connector_renewal_operation_collision BEFORE INSERT ON connector_lease_tickets
WHEN EXISTS (SELECT 1 FROM connector_authorization_receipts WHERE member_id = NEW.member_id AND operation_id = NEW.operation_id)
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER connector_authorization_operation_collision BEFORE INSERT ON connector_authorization_receipts
WHEN EXISTS (SELECT 1 FROM connector_lease_tickets WHERE member_id = NEW.member_id AND operation_id = NEW.operation_id)
BEGIN SELECT RAISE(IGNORE); END;
