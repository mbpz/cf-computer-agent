-- Self-service password recovery without email.
--
-- Registration returns a high-entropy recovery code exactly once. Only its
-- SHA-256 hash is stored; a successful reset rotates the code and clears all
-- existing sessions, so a leaked recovery code cannot be replayed and an old
-- session cannot survive a password reset.
ALTER TABLE members ADD COLUMN recovery_code_hash TEXT;
ALTER TABLE members ADD COLUMN recovery_attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN recovery_locked_until TEXT;
