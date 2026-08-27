-- Keep the knowledge base as an independent workspace entry and group
-- administrator governance tools under one expandable menu node.
UPDATE menus SET parent_id = 'menu-knowledge', position = 0, label_key = 'NAV_KNOWLEDGE_SEARCH'
WHERE id = 'menu-search';

UPDATE menus SET parent_id = 'menu-knowledge', position = 1, label_key = 'NAV_KNOWLEDGE_AGENT'
WHERE id = 'menu-agent';

INSERT OR IGNORE INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
VALUES
  ('menu-governance', 'menu-admin', 'governance', 'SHELL_GROUP_GOVERNANCE', NULL, 'ShieldCheck', 'admin', 4, '0x0', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');

UPDATE menus SET parent_id = 'menu-governance', position = 0 WHERE id = 'menu-members';
UPDATE menus SET parent_id = 'menu-governance', position = 1 WHERE id = 'menu-roles';
UPDATE menus SET parent_id = 'menu-governance', position = 2 WHERE id = 'menu-menus';
UPDATE menus SET parent_id = 'menu-governance', position = 3 WHERE id = 'menu-spaces';
UPDATE menus SET parent_id = 'menu-governance', position = 4 WHERE id = 'menu-audit';
UPDATE menus SET parent_id = 'menu-governance', position = 5 WHERE id = 'menu-analytics';
