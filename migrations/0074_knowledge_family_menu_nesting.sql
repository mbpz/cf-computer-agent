-- Collapse the AI knowledge family under one top-level menu.
--
-- 0031 already moved /search and /agent under menu-knowledge (positions 0 and 1),
-- but /submit and /my-submissions were still flat menu-workspace siblings, so the
-- knowledge family was split across two levels of the same group and the member
-- sidebar showed "AI knowledge base" next to its own children. This migration
-- re-parents the two remaining rows so the whole family hangs off
-- menu-knowledge, which keeps `/knowledge` as its own destination (the base page
-- stays one click away) and becomes the family's single top-level entry.
--
-- This is a navigation-structure change only: `path`, `label_key`, `icon`,
-- `group_name`, `required_bits`, `status`, `visible` and `is_system` are
-- untouched, so no URL, page kind or capability gate changes. menu-tree.ts
-- includes a row only when `(permissionMask & required_bits) === required_bits`,
-- so an administrator who does not hold a child's mask still never sees that
-- child; nesting under menu-knowledge (0x1, `knowledge:read`) makes the family
-- read like the product does and mirrors the client fallback tree in
-- frontend/components/shell/app-shell.tsx and the registry parentRouteId in
-- shared/workspace-route-capabilities.ts.
--
-- Guarded like 0034/0060/0072: only the canonical system row still attached to
-- menu-workspace is moved, so a rerun is a no-op and an administrator-managed
-- parent or position is preserved verbatim.
--
-- Positions 2 and 3 append after the existing knowledge children (search 0,
-- agent 1). The vacated menu-workspace positions 2-5 stay unused, so no
-- published sibling position shifts and the sibling order stays deterministic.
UPDATE menus
SET parent_id = 'menu-knowledge', position = 2
WHERE id = 'menu-submit'
  AND parent_id = 'menu-workspace'
  AND key = 'submit'
  AND label_key = 'NAV_SUBMIT'
  AND path = '/submit'
  AND group_name = 'workspace'
  AND is_system = 1;

UPDATE menus
SET parent_id = 'menu-knowledge', position = 3
WHERE id = 'menu-my-submissions'
  AND parent_id = 'menu-workspace'
  AND key = 'my-submissions'
  AND label_key = 'NAV_MY_SUBMISSIONS'
  AND path = '/my-submissions'
  AND group_name = 'workspace'
  AND is_system = 1;
