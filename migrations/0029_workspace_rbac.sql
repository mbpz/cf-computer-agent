-- Workspace roles, permission masks and administrator-managed menu tree.
-- Permission masks are lower-case hexadecimal strings interpreted by the
-- Worker with bigint; indexes are append-only in src/authorization.
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  allow_bits TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
  is_system INTEGER NOT NULL CHECK(is_system IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE role_members (
  role_id TEXT NOT NULL REFERENCES roles(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (role_id, member_id)
);

CREATE TABLE menus (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES menus(id),
  key TEXT NOT NULL UNIQUE,
  label_key TEXT NOT NULL,
  path TEXT UNIQUE,
  icon TEXT,
  group_name TEXT NOT NULL CHECK(group_name IN ('workspace', 'admin')),
  position INTEGER NOT NULL CHECK(position >= 0),
  required_bits TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active', 'disabled')),
  visible INTEGER NOT NULL CHECK(visible IN (0, 1)),
  is_system INTEGER NOT NULL CHECK(is_system IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX role_members_member ON role_members(member_id, role_id);
CREATE INDEX menus_parent_position ON menus(parent_id, position, key);

INSERT OR IGNORE INTO roles (id, key, name, description, allow_bits, status, is_system, created_at, updated_at)
VALUES
  ('role-admin', 'admin', 'Administrator', 'Full workspace governance', '0x7ffff', 'active', 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('role-contributor', 'contributor', 'Contributor', 'Create and use trusted knowledge', '0x600c3', 'active', 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');

INSERT OR IGNORE INTO role_members (role_id, member_id, created_at)
SELECT CASE role WHEN 'admin' THEN 'role-admin' ELSE 'role-contributor' END, id, '1970-01-01T00:00:00.000Z'
FROM members
WHERE role IN ('admin', 'contributor');

INSERT OR IGNORE INTO menus (id, parent_id, key, label_key, path, icon, group_name, position, required_bits, status, visible, is_system, created_at, updated_at)
VALUES
  ('menu-workspace', NULL, 'workspace', 'SHELL_GROUP_WORKSPACE', NULL, 'House', 'workspace', 0, '0x0', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-home', 'menu-workspace', 'home', 'NAV_HOME', '/', 'House', 'workspace', 0, '0x0', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-knowledge', 'menu-workspace', 'knowledge', 'NAV_KNOWLEDGE_BASE', '/knowledge', 'BookOpen', 'workspace', 1, '0x1', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-submit', 'menu-workspace', 'submit', 'NAV_SUBMIT', '/submit', 'UploadSimple', 'workspace', 2, '0x40', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-search', 'menu-workspace', 'search', 'NAV_SEARCH', '/search', 'MagnifyingGlass', 'workspace', 3, '0x40000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-agent', 'menu-workspace', 'agent', 'NAV_AGENT', '/agent', 'Sparkle', 'workspace', 4, '0x20000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-my-submissions', 'menu-workspace', 'my-submissions', 'NAV_MY_SUBMISSIONS', '/my-submissions', 'Files', 'workspace', 5, '0x80', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-admin', NULL, 'admin', 'NAV_ADMINISTRATION', NULL, 'ShieldCheck', 'admin', 1, '0x200', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-admin-overview', 'menu-admin', 'admin-overview', 'NAV_ADMINISTRATION', '/admin', 'ShieldCheck', 'admin', 0, '0x100', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-review', 'menu-admin', 'review', 'NAV_REVIEW_QUEUE', '/admin/submissions', 'NotePencil', 'admin', 1, '0x8', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-assets', 'menu-admin', 'assets', 'NAV_ASSET_QUEUE', '/admin/assets', 'Stack', 'admin', 2, '0x100', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-duplicates', 'menu-admin', 'duplicates', 'NAV_DUPLICATES', '/admin/duplicates', 'Stack', 'admin', 3, '0x100', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-members', 'menu-admin', 'members', 'NAV_MEMBERS', '/admin/members', 'UsersThree', 'admin', 4, '0x200', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-roles', 'menu-admin', 'roles', 'NAV_ROLES', '/admin/roles', 'ShieldCheck', 'admin', 5, '0x400', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-menus', 'menu-admin', 'menus', 'NAV_MENUS', '/admin/menus', 'List', 'admin', 6, '0x800', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-spaces', 'menu-admin', 'spaces', 'NAV_SPACES', '/admin/spaces', 'Stack', 'admin', 7, '0x1000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-analytics', 'menu-admin', 'site-analytics', 'NAV_SITE_ANALYTICS', '/admin/analytics', 'ChartLine', 'admin', 8, '0x4000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  ('menu-audit', 'menu-admin', 'audit', 'NAV_AUDIT', '/admin/audit', 'Scroll', 'admin', 9, '0x2000', 'active', 1, 1, '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z');
