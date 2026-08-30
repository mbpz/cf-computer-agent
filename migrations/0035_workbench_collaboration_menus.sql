-- Keep the collaboration entries in deterministic first-level order while
-- preserving administrator-managed visibility, permissions, and status.
UPDATE menus
SET position = CASE id
  WHEN 'menu-tasks' THEN 6
  WHEN 'menu-boards' THEN 7
  WHEN 'menu-notifications' THEN 8
  WHEN 'menu-messages' THEN 9
  ELSE position
END
WHERE parent_id = 'menu-workspace'
  AND group_name = 'workspace'
  AND is_system = 1
  AND id IN ('menu-tasks', 'menu-boards', 'menu-notifications', 'menu-messages');
