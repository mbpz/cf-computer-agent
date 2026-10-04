-- The default administrator is a system role, so its checkboxes cannot be edited.
-- Workbench VM was left out of that mask, which meant an administrator who
-- already had every menu permission could not grant themselves workbench access.
UPDATE roles
SET allow_bits = '0x37ffff', updated_at = '1970-01-01T00:00:00.000Z'
WHERE id = 'role-admin' AND is_system = 1 AND allow_bits IN ('0x7ffff', '0x17ffff');
