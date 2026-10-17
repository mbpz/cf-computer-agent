-- Remove the 提交 navigation entry while keeping `/submit` reachable.
--
-- The submit composer is now offered from the 我的提交 page header (the primary
-- action linking to `/submit`), so the knowledge family no longer needs a
-- second navigation entry for the same destination. `/submit` itself stays a
-- first-class route: `shared/workspace-route-capabilities.ts` keeps page kind
-- `submit` and capability `submission:create`, so a deep link, a refresh and the
-- capability gate are unchanged.
--
-- menu-tree.ts includes a row only when
-- `status = 'active' && (visible = 1 || visible = true)` and the permission
-- mask covers `required_bits`, so a hidden row disappears from `/api/navigation`
-- for every role while `menus.list()` (the admin editor) still returns it: the
-- management surface deliberately retains hidden rows.
--
-- Guarded like 0034/0060/0072/0074: only the canonical system row still nested
-- under menu-knowledge is touched, and only while it is still visible, so a
-- rerun is a no-op and an administrator-managed row is preserved verbatim.
-- Positions and the other knowledge children are untouched.
UPDATE menus
SET visible = 0
WHERE id = 'menu-submit'
  AND parent_id = 'menu-knowledge'
  AND key = 'submit'
  AND label_key = 'NAV_SUBMIT'
  AND path = '/submit'
  AND group_name = 'workspace'
  AND is_system = 1
  AND visible = 1;
