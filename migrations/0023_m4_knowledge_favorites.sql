-- Personal favorites are private member-owned edges. Deleting a knowledge item
-- (purge) cascades the edge; trashing simply hides it from the readable list.
CREATE TABLE knowledge_favorites (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(member_id, knowledge_item_id)
);

CREATE INDEX knowledge_favorites_member_page
ON knowledge_favorites(member_id, created_at DESC, knowledge_item_id DESC);

