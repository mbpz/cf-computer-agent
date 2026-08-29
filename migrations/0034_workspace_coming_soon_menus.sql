-- Seed registered workspace destinations that are intentionally unavailable.
-- A structurally canonical row is preserved verbatim so reruns never override
-- administrator-managed position, permission, status, or visibility. Any
-- incompatible id/key/path conflict reaches a UNIQUE constraint and aborts.
INSERT INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
SELECT
  'menu-boards', 'menu-workspace', 'boards', 'NAV_BOARDS', '/boards', 'SquaresFour', 'workspace', 7, '0x0', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE id = 'menu-boards' AND parent_id = 'menu-workspace'
    AND key = 'boards' AND label_key = 'NAV_BOARDS' AND path = '/boards'
    AND icon = 'SquaresFour' AND group_name = 'workspace' AND is_system = 1
);

INSERT INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
SELECT
  'menu-notifications', 'menu-workspace', 'notifications', 'NAV_NOTIFICATIONS', '/notifications', 'Bell', 'workspace', 8, '0x0', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE id = 'menu-notifications' AND parent_id = 'menu-workspace'
    AND key = 'notifications' AND label_key = 'NAV_NOTIFICATIONS' AND path = '/notifications'
    AND icon = 'Bell' AND group_name = 'workspace' AND is_system = 1
);

INSERT INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
SELECT
  'menu-messages', 'menu-workspace', 'messages', 'NAV_MESSAGES', '/messages', 'ChatCircle', 'workspace', 9, '0x0', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE id = 'menu-messages' AND parent_id = 'menu-workspace'
    AND key = 'messages' AND label_key = 'NAV_MESSAGES' AND path = '/messages'
    AND icon = 'ChatCircle' AND group_name = 'workspace' AND is_system = 1
);
