-- Backfill a bound reset invitation for password accounts created before
-- invitation codes existed.
--
-- Such accounts can already change their password from a live session (the
-- authenticated account route), but the unauthenticated "forgot password" flow
-- requires the invitation bound to the member. Without this backfill those
-- legacy accounts could never reset. The generated row is a used, admin-kind
-- invitation already bound to the member; administrators see the code in the
-- menu-management invitation panel and can hand it to the account owner.
--
-- The code is 16 characters from the canonical alphabet: hex(randomblob(16))
-- is mapped 0 -> 2 and 1 -> 3 so neither excluded I/O/0/1 character appears.
-- created_by_member_id uses the first active administrator, or the member
-- itself when no administrator exists yet (the column is only a provenance FK).
INSERT INTO invitations (
  id, code, kind, owner_member_id, bound_member_id, status,
  created_by_member_id, created_at, used_at
)
SELECT
  'backfill-' || lower(hex(randomblob(16))),
  substr(replace(replace(hex(randomblob(16)), '0', '2'), '1', '3'), 1, 16),
  'admin',
  NULL,
  m.id,
  'used',
  COALESCE(
    (SELECT a.id FROM members a WHERE a.role = 'admin' AND a.status = 'active'
      ORDER BY a.created_at ASC, a.id ASC LIMIT 1),
    m.id
  ),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM members m
WHERE m.password_hash IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM invitations i WHERE i.bound_member_id = m.id);
