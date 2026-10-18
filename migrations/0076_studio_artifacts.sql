-- Owner-scoped Studio artifacts generated from one published revision.
-- NotebookLM keeps generated mind maps, flashcards, and quizzes beside the
-- notebook; this table is the equivalent retention boundary. The payload is the
-- exact service result, bounded so one artifact can never become an unbounded
-- blob store.
CREATE TABLE studio_artifacts (
  id TEXT PRIMARY KEY,
  knowledge_item_id TEXT NOT NULL REFERENCES knowledge_items(id),
  revision_id TEXT NOT NULL REFERENCES revisions(id),
  owner_id TEXT NOT NULL REFERENCES members(id),
  kind TEXT NOT NULL CHECK(kind IN ('mindmap', 'flashcards', 'quiz')),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND length(payload_json) <= 262144),
  citation_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(citation_ids_json) AND length(citation_ids_json) <= 8192),
  created_at TEXT NOT NULL
);

CREATE INDEX studio_artifacts_owner_page
ON studio_artifacts(owner_id, knowledge_item_id, created_at DESC, id DESC);

CREATE INDEX studio_artifacts_revision
ON studio_artifacts(revision_id);
