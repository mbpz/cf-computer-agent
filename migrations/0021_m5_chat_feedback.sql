CREATE TABLE chat_feedback (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id),
  rating TEXT NOT NULL CHECK (rating IN ('useful', 'not_useful', 'citation_error')),
  citation_ids_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (conversation_id, member_id)
);

CREATE INDEX chat_feedback_rating_created
  ON chat_feedback(rating, created_at DESC, id);
