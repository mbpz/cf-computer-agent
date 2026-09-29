-- No default policy: networking authorization is disabled until trusted local
-- configuration and an explicitly provisioned policy agree. No runtime reports
-- populate these tables; these are authorization reservations, not VM telemetry.
CREATE TABLE connector_authorization_policy (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  origin TEXT NOT NULL CHECK(length(origin) BETWEEN 1 AND 2048),
  policy_version TEXT NOT NULL CHECK(length(policy_version) BETWEEN 1 AND 128),
  enabled INTEGER NOT NULL CHECK(enabled IN (0, 1))
);
CREATE TABLE connector_authority_heads (
  environment_id TEXT PRIMARY KEY REFERENCES browser_environments(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  runtime_id TEXT NOT NULL UNIQUE,
  generation INTEGER NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740990),
  connector_id TEXT NOT NULL CHECK(length(connector_id) BETWEEN 1 AND 128),
  origin TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  -- A hash only, not the cookie. Keep the generation watermark after logout;
  -- every issuance rechecks this hash against a live session of the same member.
  session_hash TEXT NOT NULL CHECK(length(session_hash) = 64),
  state TEXT NOT NULL CHECK(state IN ('active', 'revoked')),
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_connector_authority_member ON connector_authority_heads(member_id, environment_id);
CREATE TABLE connector_authorization_receipts (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 128),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  kind TEXT NOT NULL CHECK(kind IN ('reserve', 'connect', 'revoke')),
  environment_id TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740990),
  claim_id TEXT NOT NULL UNIQUE,
  key_id TEXT,
  -- Canonical unsigned claims / authority acknowledgement only. Never a ticket.
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND length(response_json) <= 8192),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(member_id, operation_id)
);
-- Expiry does not free this slot. A fresh attempt needs a new explicit runtime
-- reservation, never a silently minted second valid connect capability.
CREATE UNIQUE INDEX idx_connector_one_connect_per_generation
  ON connector_authorization_receipts(environment_id, runtime_id, generation) WHERE kind = 'connect';
