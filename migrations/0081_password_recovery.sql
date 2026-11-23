-- Independent one-time password-recovery credentials.
--
-- The invitation bound to a registration is provenance, not a recovery
-- credential. An administrator issues a short-lived, single-use recovery code
-- for a specific member; only its SHA-256 hash is stored, and the plaintext is
-- returned once. Presenting it with the account email replaces the password and
-- revokes other sessions.
CREATE TABLE IF NOT EXISTS password_recovery_codes (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL CHECK(length(code_hash) = 64),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by_member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS password_recovery_codes_member
  ON password_recovery_codes(member_id, used_at, expires_at);
CREATE INDEX IF NOT EXISTS password_recovery_codes_hash
  ON password_recovery_codes(code_hash);

-- Recovery attempts are rate-limited separately from registration attempts so
-- an unknown email or a wrong code cannot be used to enumerate accounts.
CREATE TABLE IF NOT EXISTS password_recovery_attempts (
  ip_hash TEXT NOT NULL CHECK(length(ip_hash) = 64),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS password_recovery_attempts_ip_created
  ON password_recovery_attempts(ip_hash, created_at DESC);

-- Registration attempts now distinguish successful account creation from a
-- rejected attempt. Only rows with member_id count toward the new-account quota;
-- rejected invitations stay in the same table as bounded failure evidence.
ALTER TABLE password_registration_attempts ADD COLUMN member_id TEXT;
CREATE INDEX IF NOT EXISTS password_registration_attempts_ip_member_created
  ON password_registration_attempts(ip_hash, member_id, created_at DESC);
