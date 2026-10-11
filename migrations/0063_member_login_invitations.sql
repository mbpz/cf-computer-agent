-- Admin-issued one-time login authorization codes.
--
-- GitHub OAuth stays the interactive path, but it is allowlisted by
-- ALLOWED_MEMBER_EMAILS: anyone else is refused with MEMBER_NOT_ALLOWED. This
-- table lets an administrator issue one single-use code per canonical email so
-- an invited person can sign in with POST /auth/code without joining that
-- allowlist; the invitation itself is the authorization.
--
-- Only the sha256 hex of the code is persisted (never the code), the row
-- carries the 24h expiry and the persisted attempt counter that locks a
-- brute-forced invitation silently, and pending -> redeemed | revoked happens
-- exactly once under a conditional UPDATE that requires changes() = 1.
--
-- Guarded/idempotent like 0034/0060: a rerun must not fail or rewrite an
-- existing row. The partial unique index is the second guard behind the
-- conditional insert: at most one pending invitation per canonical email,
-- while redeemed and revoked rows never block a fresh invitation.
CREATE TABLE IF NOT EXISTS member_login_invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
  code_hash TEXT NOT NULL CHECK(length(code_hash) = 64),
  status TEXT NOT NULL CHECK(status IN ('pending', 'redeemed', 'revoked')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  redeemed_at TEXT,
  revoked_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS member_login_invitations_pending_email
  ON member_login_invitations(email) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS member_login_invitations_created_at
  ON member_login_invitations(created_at DESC, id DESC);
