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
