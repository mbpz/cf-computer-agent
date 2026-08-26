-- Recent visits are private member-owned edges. The bounded retention window is
-- enforced by the repository after each upsert; FK cascades remove stale edges.
CREATE TABLE knowledge_visits (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  last_visited_at TEXT NOT NULL,
  visit_count INTEGER NOT NULL DEFAULT 1 CHECK(visit_count >= 1),
  PRIMARY KEY(member_id, knowledge_item_id)
);

CREATE INDEX knowledge_visits_member_page
ON knowledge_visits(member_id, last_visited_at DESC, knowledge_item_id DESC);

