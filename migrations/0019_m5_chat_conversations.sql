CREATE TABLE chat_conversations (
  id TEXT PRIMARY KEY,
  owner_member_id TEXT NOT NULL REFERENCES members(id),
  scope_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role = 'turn'),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  citation_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (conversation_id, sequence)
);

CREATE INDEX chat_conversations_owner_updated
  ON chat_conversations(owner_member_id, updated_at DESC, id);

CREATE INDEX chat_messages_conversation_sequence
  ON chat_messages(conversation_id, sequence DESC);
