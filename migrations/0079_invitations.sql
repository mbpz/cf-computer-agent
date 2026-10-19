-- Invitation-only registration and binding-based password reset.
--
-- One row is either an administrator-issued code (kind = 'admin', no owner) or
-- a member's single lifetime sharing code (kind = 'member', owner set). Both
-- kinds are single use: registration claims an unused row and binds the new
-- member in the same D1 batch, so a concurrent second registration for the
-- same code inserts no member.
--
-- Codes are stored in plain text on purpose: administrators must be able to
-- read every code in the menu administration page and a member must be able to
-- copy the code they share. The code column holds the canonical 16-character
-- form (no separators); the UI adds the XXXX-XXXX-XXXX-XXXX grouping.
CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,                -- canonical: 16 uppercase letters/digits (no separators)
  kind TEXT NOT NULL CHECK (kind IN ('admin','member')),
  owner_member_id TEXT REFERENCES members(id),   -- sharer of a member code; NULL for admin codes
  bound_member_id TEXT REFERENCES members(id),   -- member created by this code; NULL while unused
  status TEXT NOT NULL CHECK (status IN ('unused','used')),
  created_by_member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  used_at TEXT,
  CHECK ((kind='admin' AND owner_member_id IS NULL) OR (kind='member' AND owner_member_id IS NOT NULL)),
  CHECK ((status='unused' AND bound_member_id IS NULL AND used_at IS NULL)
      OR (status='used' AND bound_member_id IS NOT NULL AND used_at IS NOT NULL))
);
CREATE UNIQUE INDEX invitations_code_unique ON invitations(code);
CREATE UNIQUE INDEX invitations_bound_member_unique ON invitations(bound_member_id) WHERE bound_member_id IS NOT NULL;
CREATE UNIQUE INDEX invitations_member_owner_unique ON invitations(owner_member_id) WHERE owner_member_id IS NOT NULL;
CREATE INDEX invitations_created_at ON invitations(created_at DESC);
