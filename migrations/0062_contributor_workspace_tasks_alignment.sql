-- Realign the contributor system role with the user-confirmed workspace.tasks grant.
--
-- 0032_workspace_tasks.sql added bit 20 (workspace.tasks) to role-contributor with a
-- conditional update (`WHERE allow_bits = '0x600c3'`, the 0029 placeholder). On the
-- deployed database that row was already recorded as applied after the mask had drifted
-- back to the placeholder value, so the condition could never fire again: production kept
-- 0x600c3 while the migration-reconstructed state grants 0x1600c3. With 0060 tightening
-- menu-boards/menu-inbox to 0x100000, that divergence silently hides the workbench
-- entries from contributors.
--
-- Re-apply the same user-confirmed value once, and only while the row is still the exact
-- legacy placeholder; an administrator-managed mask is preserved verbatim.
UPDATE roles
SET allow_bits = '0x1600c3', updated_at = '1970-01-01T00:00:00.000Z'
WHERE id = 'role-contributor'
  AND is_system = 1
  AND allow_bits = '0x600c3';
