CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX auth_sessions_member_expires_created
ON auth_sessions(member_id, expires_at, created_at);

CREATE INDEX auth_sessions_expires
ON auth_sessions(expires_at);

CREATE TABLE automation_nonces (
  client_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (client_id, nonce)
);

CREATE INDEX automation_nonces_expires
ON automation_nonces(expires_at);
