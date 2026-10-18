-- Self-service email login codes.
--
-- The previous invitation flow asked an administrator to generate a 43-character
-- code and hand it to the invitee. Email sending now exists, so the emailed
-- six-digit code is the credential and the invitation only records that an
-- email address is authorized to create a contributor account.
--
-- email_login_codes stores only the HMAC-SHA-256 hex of a short-lived code.
-- The latest row for an email is the only active challenge; consumed and older
-- rows remain as an attempt history. Request rate limiting is enforced by the
-- conditional INSERT (no recent row and at most five rows per hour), while the
-- attempt ceiling and single use are enforced by conditional UPDATEs.
--
-- The invitations table is rebuilt without code_hash/attempt_count: those
-- columns described the removed admin-issued credential. The rebuild copies
-- every existing row, so pending grants and their history survive.
DROP TABLE IF EXISTS member_login_invitations_next;
CREATE TABLE member_login_invitations_next (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
  status TEXT NOT NULL CHECK(status IN ('pending', 'redeemed', 'revoked')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  revoked_at TEXT
);

INSERT INTO member_login_invitations_next (id, email, status, created_at, expires_at, redeemed_at, revoked_at)
  SELECT id, email, status, created_at, expires_at, redeemed_at, revoked_at
  FROM member_login_invitations;

DROP TABLE member_login_invitations;
ALTER TABLE member_login_invitations_next RENAME TO member_login_invitations;

CREATE UNIQUE INDEX IF NOT EXISTS member_login_invitations_pending_email
  ON member_login_invitations(email) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS member_login_invitations_created_at
  ON member_login_invitations(created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS email_login_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
  code_hash TEXT NOT NULL CHECK(length(code_hash) = 64),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX IF NOT EXISTS email_login_codes_email_created
  ON email_login_codes(email, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS email_login_codes_created
  ON email_login_codes(created_at);
