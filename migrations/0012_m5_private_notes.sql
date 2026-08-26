CREATE TABLE private_notes (
  id TEXT PRIMARY KEY,
  owner_member_id TEXT NOT NULL REFERENCES members(id),
  knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  citations_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_member_id, knowledge_item_id)
);

CREATE INDEX private_notes_owner_page
ON private_notes(owner_member_id, updated_at DESC, id DESC);
