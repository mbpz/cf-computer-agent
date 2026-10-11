-- Register the remaining ready workspace routes as system menu rows and make
-- the workspace sibling positions a deterministic unique sequence.
--
-- Guarded like 0034: a canonical row is preserved verbatim so reruns never
-- override administrator-managed position, permission, status, or visibility,
-- and an incompatible id/key/path conflict reaches a UNIQUE constraint and
-- aborts instead of silently diverging.
--
-- Permission isolation: every required_bits below is the exact mask derived
-- from the route's shared requiredPermission (workspace.tasks = bit 20 =
-- 0x100000, workspace.vm = bit 21 = 0x200000). No 0x0 shortcut.

INSERT INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
SELECT
  'menu-graph', 'menu-workspace', 'graph', 'NAV_GRAPH', '/graph', 'ChartLine', 'workspace', 13, '0x100000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE id = 'menu-graph' AND parent_id = 'menu-workspace'
    AND key = 'graph' AND label_key = 'NAV_GRAPH' AND path = '/graph'
    AND icon = 'ChartLine' AND group_name = 'workspace' AND is_system = 1
);

INSERT INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
SELECT
  'menu-calendar', 'menu-workspace', 'calendar', 'NAV_CALENDAR', '/calendar', 'CalendarBlank', 'workspace', 14, '0x100000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE id = 'menu-calendar' AND parent_id = 'menu-workspace'
    AND key = 'calendar' AND label_key = 'NAV_CALENDAR' AND path = '/calendar'
    AND icon = 'CalendarBlank' AND group_name = 'workspace' AND is_system = 1
);

INSERT INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
SELECT
  'menu-today', 'menu-workspace', 'today', 'NAV_TODAY', '/today', 'CalendarBlank', 'workspace', 15, '0x100000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE id = 'menu-today' AND parent_id = 'menu-workspace'
    AND key = 'today' AND label_key = 'NAV_TODAY' AND path = '/today'
    AND icon = 'CalendarBlank' AND group_name = 'workspace' AND is_system = 1
);

INSERT INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
SELECT
  'menu-focus', 'menu-workspace', 'focus', 'NAV_FOCUS', '/focus', 'Timer', 'workspace', 16, '0x100000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE id = 'menu-focus' AND parent_id = 'menu-workspace'
    AND key = 'focus' AND label_key = 'NAV_FOCUS' AND path = '/focus'
    AND icon = 'Timer' AND group_name = 'workspace' AND is_system = 1
);

-- The 0029 administrator node already owns id `menu-review` and key `review`
-- (the /admin/submissions review queue), so the workspace review entry uses the
-- workbench-review name shared with src/routes/workbench-review.ts and
-- shared/workbench-maturity-capabilities.ts.
INSERT INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
SELECT
  'menu-workbench-review', 'menu-workspace', 'workbench-review', 'NAV_REVIEW', '/review', 'Check', 'workspace', 17, '0x100000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE id = 'menu-workbench-review' AND parent_id = 'menu-workspace'
    AND key = 'workbench-review' AND label_key = 'NAV_REVIEW' AND path = '/review'
    AND icon = 'Check' AND group_name = 'workspace' AND is_system = 1
);

INSERT INTO menus
  (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
SELECT
  'menu-environments', 'menu-workspace', 'environments', 'NAV_ENVIRONMENTS', '/environments', 'Monitor', 'workspace', 18, '0x200000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
WHERE NOT EXISTS (
  SELECT 1 FROM menus WHERE id = 'menu-environments' AND parent_id = 'menu-workspace'
    AND key = 'environments' AND label_key = 'NAV_ENVIRONMENTS' AND path = '/environments'
    AND icon = 'Monitor' AND group_name = 'workspace' AND is_system = 1
);

-- /inbox and /boards are gated end-to-end by workspace.tasks: the shared route
-- registry declares requiredPermission workspace.tasks, the shell route guard
-- (frontend/components/shell/app-shell.tsx via resolveFrontendAccess), the
-- command palette, and GET/POST /api/inbox (requireCapability "tasks:use",
-- mapped to workspace.tasks in src/authorization/policy.ts) all deny without
-- bit 20. 0034/0038 seeded placeholder masks, so only the untouched canonical
-- placeholder is corrected; an administrator-managed value is preserved.
UPDATE menus
SET required_bits = '0x100000'
WHERE id IN ('menu-boards', 'menu-inbox')
  AND parent_id = 'menu-workspace'
  AND group_name = 'workspace'
  AND is_system = 1
  AND required_bits = '0x0';

-- The admin group root must not gate its children behind a permission the
-- /admin landing page does not require. A role can hold submission:read-all
-- (bit 8, the /admin route mask and the admin read APIs) without member:manage
-- (bit 9); those two live in separate admin role groups
-- (frontend/pages/admin/roles-page.tsx:22-24), so the combination is grantable.
-- 0029 gave this path-less group root 0x200, which dropped the whole admin
-- subtree for such a role even though the /admin page and its APIs authorize it.
-- Group roots are containers: menu-workspace and menu-governance already carry
-- 0x0 and are rendered whenever any child passes.
UPDATE menus
SET required_bits = '0x0'
WHERE id = 'menu-admin'
  AND parent_id IS NULL
  AND group_name = 'admin'
  AND is_system = 1
  AND required_bits = '0x200';

-- Deterministic unique positions for the system workspace siblings. 0035 set
-- tasks/boards/notifications/messages to 6/7/8/9, but 0039 seeded goals at 7
-- and 0040 seeded projects at 8, so those two siblings collided and the tree
-- fell back to key sort. The values below keep every already-unique published
-- position unchanged (positions 3-4 stay unused since 0031 moved search/agent
-- under menu-knowledge) and make the workbench chain contiguous.
-- Only is_system = 1 rows are touched so administrator-managed rows are never
-- clobbered.
UPDATE menus
SET position = CASE id
  WHEN 'menu-home' THEN 0
  WHEN 'menu-knowledge' THEN 1
  WHEN 'menu-submit' THEN 2
  WHEN 'menu-my-submissions' THEN 5
  WHEN 'menu-tasks' THEN 6
  WHEN 'menu-boards' THEN 7
  WHEN 'menu-notifications' THEN 8
  WHEN 'menu-messages' THEN 9
  WHEN 'menu-inbox' THEN 10
  WHEN 'menu-goals' THEN 11
  WHEN 'menu-projects' THEN 12
  WHEN 'menu-graph' THEN 13
  WHEN 'menu-calendar' THEN 14
  WHEN 'menu-today' THEN 15
  WHEN 'menu-focus' THEN 16
  WHEN 'menu-workbench-review' THEN 17
  WHEN 'menu-environments' THEN 18
  ELSE position
END
WHERE parent_id = 'menu-workspace'
  AND group_name = 'workspace'
  AND is_system = 1;
