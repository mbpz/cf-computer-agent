-- Context-bound workbench discussions. Participants are interaction metadata
-- only: task/knowledge authorization is re-evaluated for every operation.
CREATE TABLE discussion_threads (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
  context_kind TEXT NOT NULL CHECK(context_kind IN ('task', 'knowledge')),
  context_id TEXT NOT NULL CHECK(length(context_id) BETWEEN 1 AND 128),
  creator_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT
    CHECK(length(creator_member_id) BETWEEN 1 AND 128),
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_sequence >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(updated_at >= created_at),
  UNIQUE(context_kind, context_id)
);

CREATE INDEX idx_discussion_threads_created
  ON discussion_threads(created_at DESC, id DESC);

-- Authorization projection for bounded inbox pagination. These rows are not an
-- independent grant: triggers below keep them synchronized with the canonical
-- task/knowledge authorization inputs.
CREATE TABLE discussion_thread_access (
  principal_kind TEXT NOT NULL CHECK(principal_kind IN ('task_member', 'knowledge')),
  principal_id TEXT NOT NULL CHECK(length(principal_id) BETWEEN 1 AND 128),
  thread_id TEXT NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(principal_kind, principal_id, thread_id)
);

CREATE INDEX idx_discussion_thread_access_principal_page
  ON discussion_thread_access(principal_kind, principal_id, created_at DESC, thread_id DESC);
CREATE INDEX idx_discussion_thread_access_thread
  ON discussion_thread_access(thread_id);

-- Single canonical source for the materialized access keys. Task threads have
-- exactly one current owner key. Active knowledge targets always have an admin
-- key and additionally have a shared key when the current revision is shared.
CREATE VIEW discussion_thread_canonical_access AS
SELECT 'task_member' AS principal_kind, t.member_id AS principal_id,
       dt.id AS thread_id, dt.created_at AS created_at
FROM discussion_threads dt
JOIN tasks t ON dt.context_kind = 'task' AND t.id = dt.context_id
UNION ALL
SELECT 'knowledge' AS principal_kind, 'admin' AS principal_id,
       dt.id AS thread_id, dt.created_at AS created_at
FROM discussion_threads dt
JOIN knowledge_items k ON dt.context_kind = 'knowledge' AND k.id = dt.context_id
JOIN revisions r ON r.id = k.current_revision_id
JOIN spaces s ON s.id = k.space_id
WHERE k.status = 'active' AND s.status = 'active' AND s.kind != 'legacy'
UNION ALL
SELECT 'knowledge' AS principal_kind, 'shared' AS principal_id,
       dt.id AS thread_id, dt.created_at AS created_at
FROM discussion_threads dt
JOIN knowledge_items k ON dt.context_kind = 'knowledge' AND k.id = dt.context_id
JOIN revisions r ON r.id = k.current_revision_id
JOIN spaces s ON s.id = k.space_id
WHERE k.status = 'active' AND s.status = 'active' AND s.kind != 'legacy'
  AND r.visibility = 'shared';

CREATE TRIGGER discussion_threads_access_insert
AFTER INSERT ON discussion_threads
BEGIN
  INSERT OR IGNORE INTO discussion_thread_access
    (principal_kind, principal_id, thread_id, created_at)
  SELECT principal_kind, principal_id, thread_id, created_at
  FROM discussion_thread_canonical_access WHERE thread_id = NEW.id;
END;

CREATE TRIGGER discussion_threads_access_update
AFTER UPDATE OF context_kind, context_id, created_at ON discussion_threads
BEGIN
  DELETE FROM discussion_thread_access WHERE thread_id = NEW.id;
  INSERT OR IGNORE INTO discussion_thread_access
    (principal_kind, principal_id, thread_id, created_at)
  SELECT principal_kind, principal_id, thread_id, created_at
  FROM discussion_thread_canonical_access WHERE thread_id = NEW.id;
END;

CREATE TRIGGER discussion_task_access_insert
AFTER INSERT ON tasks
BEGIN
  INSERT OR IGNORE INTO discussion_thread_access
    (principal_kind, principal_id, thread_id, created_at)
  SELECT principal_kind, principal_id, thread_id, created_at
  FROM discussion_thread_canonical_access
  WHERE principal_kind = 'task_member'
    AND thread_id IN (
      SELECT id FROM discussion_threads
      WHERE context_kind = 'task' AND context_id = NEW.id
    );
END;

CREATE TRIGGER discussion_task_access_update
AFTER UPDATE OF member_id ON tasks
BEGIN
  DELETE FROM discussion_thread_access
  WHERE principal_kind = 'task_member'
    AND thread_id IN (
      SELECT id FROM discussion_threads
      WHERE context_kind = 'task' AND context_id = NEW.id
    );
  INSERT OR IGNORE INTO discussion_thread_access
    (principal_kind, principal_id, thread_id, created_at)
  SELECT principal_kind, principal_id, thread_id, created_at
  FROM discussion_thread_canonical_access
  WHERE principal_kind = 'task_member'
    AND thread_id IN (
      SELECT id FROM discussion_threads
      WHERE context_kind = 'task' AND context_id = NEW.id
    );
END;

CREATE TRIGGER discussion_task_access_delete
AFTER DELETE ON tasks
BEGIN
  DELETE FROM discussion_thread_access
  WHERE principal_kind = 'task_member'
    AND thread_id IN (
      SELECT id FROM discussion_threads
      WHERE context_kind = 'task' AND context_id = OLD.id
    );
END;

CREATE TRIGGER discussion_knowledge_item_access_update
AFTER UPDATE OF status, current_revision_id, space_id ON knowledge_items
BEGIN
  DELETE FROM discussion_thread_access
  WHERE principal_kind = 'knowledge'
    AND thread_id IN (
      SELECT id FROM discussion_threads
      WHERE context_kind = 'knowledge' AND context_id = NEW.id
    );
  INSERT OR IGNORE INTO discussion_thread_access
    (principal_kind, principal_id, thread_id, created_at)
  SELECT principal_kind, principal_id, thread_id, created_at
  FROM discussion_thread_canonical_access
  WHERE principal_kind = 'knowledge'
    AND thread_id IN (
      SELECT id FROM discussion_threads
      WHERE context_kind = 'knowledge' AND context_id = NEW.id
    );
END;

CREATE TRIGGER discussion_knowledge_item_access_delete
AFTER DELETE ON knowledge_items
BEGIN
  DELETE FROM discussion_thread_access
  WHERE principal_kind = 'knowledge'
    AND thread_id IN (
      SELECT id FROM discussion_threads
      WHERE context_kind = 'knowledge' AND context_id = OLD.id
    );
END;

CREATE TRIGGER discussion_revision_access_update
AFTER UPDATE OF visibility ON revisions
BEGIN
  DELETE FROM discussion_thread_access
  WHERE principal_kind = 'knowledge'
    AND thread_id IN (
      SELECT dt.id FROM discussion_threads dt
      JOIN knowledge_items k ON k.id = dt.context_id
      WHERE dt.context_kind = 'knowledge' AND k.current_revision_id = NEW.id
    );
  INSERT OR IGNORE INTO discussion_thread_access
    (principal_kind, principal_id, thread_id, created_at)
  SELECT canonical.principal_kind, canonical.principal_id,
         canonical.thread_id, canonical.created_at
  FROM discussion_thread_canonical_access canonical
  JOIN discussion_threads dt ON dt.id = canonical.thread_id
  JOIN knowledge_items k ON k.id = dt.context_id
  WHERE canonical.principal_kind = 'knowledge'
    AND dt.context_kind = 'knowledge' AND k.current_revision_id = NEW.id;
END;

CREATE TRIGGER discussion_space_access_update
AFTER UPDATE OF status, kind ON spaces
BEGIN
  DELETE FROM discussion_thread_access
  WHERE principal_kind = 'knowledge'
    AND thread_id IN (
      SELECT dt.id FROM discussion_threads dt
      JOIN knowledge_items k ON k.id = dt.context_id
      WHERE dt.context_kind = 'knowledge' AND k.space_id = NEW.id
    );
  INSERT OR IGNORE INTO discussion_thread_access
    (principal_kind, principal_id, thread_id, created_at)
  SELECT canonical.principal_kind, canonical.principal_id,
         canonical.thread_id, canonical.created_at
  FROM discussion_thread_canonical_access canonical
  JOIN discussion_threads dt ON dt.id = canonical.thread_id
  JOIN knowledge_items k ON k.id = dt.context_id
  WHERE canonical.principal_kind = 'knowledge'
    AND dt.context_kind = 'knowledge' AND k.space_id = NEW.id;
END;

CREATE TABLE discussion_participants (
  thread_id TEXT NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  last_read_sequence INTEGER NOT NULL DEFAULT 0 CHECK(last_read_sequence >= 0),
  PRIMARY KEY(thread_id, member_id)
);

CREATE INDEX idx_discussion_participants_member_thread
  ON discussion_participants(member_id, thread_id);

CREATE TABLE discussion_messages (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 128),
  thread_id TEXT NOT NULL REFERENCES discussion_threads(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  author_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE RESTRICT
    CHECK(length(author_member_id) BETWEEN 1 AND 128),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
  reply_to_message_id TEXT,
  mentions_json TEXT NOT NULL DEFAULT '[]'
    CHECK(length(CAST(mentions_json AS BLOB)) BETWEEN 2 AND 4096)
    CHECK(json_valid(mentions_json) AND json_type(mentions_json) = 'array')
    CHECK(json_array_length(mentions_json) <= 20),
  client_key TEXT NOT NULL CHECK(length(client_key) BETWEEN 1 AND 128),
  created_at INTEGER NOT NULL,
  UNIQUE(thread_id, sequence),
  UNIQUE(id, thread_id),
  UNIQUE(author_member_id, client_key),
  FOREIGN KEY(reply_to_message_id, thread_id)
    REFERENCES discussion_messages(id, thread_id) ON DELETE RESTRICT
);

CREATE INDEX idx_discussion_messages_thread_sequence
  ON discussion_messages(thread_id, sequence DESC, id DESC);
CREATE INDEX idx_discussion_messages_reply
  ON discussion_messages(reply_to_message_id, thread_id)
  WHERE reply_to_message_id IS NOT NULL;
