-- Numbered pagination indexes for formal workbench pages.
-- Existing page indexes already cover analytics, audit, submissions, knowledge,
-- duplicates, and member ID ordering. These two close the demonstrated sort gaps.
CREATE INDEX IF NOT EXISTS assets_admin_page
ON assets(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS tasks_member_page
ON tasks(member_id, created_at DESC, id DESC);
