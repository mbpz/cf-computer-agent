-- Self-service email + password accounts.
--
-- New members register their own canonical email and password; the password
-- is stored as a PBKDF2-SHA256 record (see src/password/hash.ts). Existing
-- password_hash = NULL members keep their GitHub identity and cannot be
-- claimed by registration.
--
-- One member per canonical email is now a database invariant: registration
-- checks first, and this unique expression index closes the concurrent-insert
-- race. The production preflight found no duplicate canonical emails.
CREATE UNIQUE INDEX IF NOT EXISTS members_canonical_email
  ON members(LOWER(TRIM(email)));

ALTER TABLE members ADD COLUMN password_hash TEXT;
ALTER TABLE members ADD COLUMN failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN locked_until TEXT;

-- Applies to password registrations only; keyed by a SHA-256 of the client IP
-- so the raw address is never stored. Five new accounts per IP per hour.
CREATE TABLE IF NOT EXISTS password_registration_attempts (
  ip_hash TEXT NOT NULL CHECK(length(ip_hash) = 64),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS password_registration_attempts_ip_created
  ON password_registration_attempts(ip_hash, created_at DESC);

-- The emailed-code and admin-invitation paths are gone. Their tables only
-- existed for the removed login scheme.
DROP TABLE IF EXISTS email_login_codes;
DROP TABLE IF EXISTS member_login_invitations;
