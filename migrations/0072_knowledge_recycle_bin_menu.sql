-- Register the administrator knowledge recycle bin as a system menu row.
--
-- The menu tree is server-owned (`menus` drives `/api/navigation`), so a page that
-- should be discoverable in the administrator navigation needs a seeded row rather
-- than only a client-side registry entry. The row is guarded like 0034/0060: a
-- canonical row is preserved verbatim so a rerun never overrides
-- administrator-managed position, permission, status or visibility, and an
-- incompatible id/key/path conflict reaches a UNIQUE constraint instead of
-- silently diverging.
--
-- Permission isolation: `required_bits` is the exact mask for the route's
-- capability (`knowledge:review` = bit 3 = 0x8), the same mask `menu-review`
-- carries. menu-tree.ts includes a row only when `(permissionMask & required) ===
-- required`, so an administrator who does not hold review permission never sees
-- the entry, and the page itself still re-checks the capability on every request.
--
-- Position 10 appends after the existing administrator rows (review 1 … audit 9)
-- so no existing position shifts.
INSERT INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
SELECT
  'menu-recycle-bin', 'menu-admin', 'recycle-bin', 'NAV_RECYCLE_BIN', '/admin/knowledge/trash', 'Trash', 'admin', 10, '0x8', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE id = 'menu-recycle-bin' AND parent_id = 'menu-admin'
    AND key = 'recycle-bin' AND label_key = 'NAV_RECYCLE_BIN' AND path = '/admin/knowledge/trash'
    AND icon = 'Trash' AND group_name = 'admin' AND is_system = 1
);
