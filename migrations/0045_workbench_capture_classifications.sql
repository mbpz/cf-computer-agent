-- P3-A: private AI/heuristic capture classification suggestions.
CREATE TABLE inbox_classifications (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  inbox_id TEXT NOT NULL REFERENCES inbox_items(id) ON DELETE CASCADE,
  suggested_kind TEXT NOT NULL CHECK(suggested_kind IN ('task', 'knowledge', 'note')),
  confidence INTEGER NOT NULL CHECK(confidence >= 0 AND confidence <= 100),
  rationale TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('suggested', 'accepted', 'dismissed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(member_id, inbox_id)
);
CREATE INDEX idx_inbox_classifications_member_updated ON inbox_classifications(member_id, updated_at DESC, id DESC);
