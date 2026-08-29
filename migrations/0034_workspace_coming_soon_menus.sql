-- Seed registered workspace destinations that are intentionally unavailable.
-- Availability is supplied by the shared route registry; D1 remains the owner
-- of hierarchy, ordering, permission filtering, status, and visibility.
INSERT OR IGNORE INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
VALUES
  ('menu-boards', 'menu-workspace', 'boards', 'NAV_BOARDS', '/boards', 'SquaresFour', 'workspace', 7, '0x0', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-notifications', 'menu-workspace', 'notifications', 'NAV_NOTIFICATIONS', '/notifications', 'Bell', 'workspace', 8, '0x0', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-messages', 'menu-workspace', 'messages', 'NAV_MESSAGES', '/messages', 'ChatCircle', 'workspace', 9, '0x0', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');
