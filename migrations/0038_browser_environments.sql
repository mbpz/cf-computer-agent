-- Local G1a foundation. No default role grant, navigation entry or VM runtime data.
CREATE TABLE browser_environments (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  type TEXT NOT NULL CHECK(type IN ('personal', 'temporary')),
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_browser_environments_member_page ON browser_environments(member_id, created_at DESC, id DESC);
CREATE INDEX idx_browser_environments_member_type_page ON browser_environments(member_id, type, created_at DESC, id DESC);
CREATE INDEX idx_browser_environments_task ON browser_environments(task_id);

-- Request digest includes the operation kind. This table retains original creation
-- responses, not terminal data, commands, files or current lifecycle state.
-- No environment FK: replay receipts must survive future environment tombstones.
CREATE TABLE environment_create_receipts (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 128),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  environment_id TEXT NOT NULL UNIQUE,
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND length(response_json) <= 4096),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(member_id, operation_id)
);
