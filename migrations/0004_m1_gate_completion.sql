-- M1 completion is forward-only. Legacy SourceVersions retain their immutable
-- content_sha256 semantics; source_identity_sha256 is intentionally NULL until
-- a canonical M1-v2 identity can be computed from the original source inputs.
ALTER TABLE source_versions ADD COLUMN parser_schema_version TEXT NOT NULL DEFAULT 'm1-v1';
ALTER TABLE source_versions ADD COLUMN source_identity_sha256 TEXT;
ALTER TABLE source_versions ADD COLUMN code_language TEXT;
ALTER TABLE source_versions ADD COLUMN file_label TEXT;
ALTER TABLE source_versions ADD COLUMN line_baseline INTEGER NOT NULL DEFAULT 1 CHECK(line_baseline > 0);

ALTER TABLE submissions ADD COLUMN supersedes_submission_id TEXT REFERENCES submissions(id);
CREATE INDEX submissions_owner_status_page
ON submissions(submitter_id, status, created_at DESC, id DESC);

ALTER TABLE reviews ADD COLUMN requested_title TEXT NOT NULL DEFAULT '';
ALTER TABLE reviews ADD COLUMN requested_space_id TEXT REFERENCES spaces(id);
ALTER TABLE reviews ADD COLUMN requested_collection_id TEXT REFERENCES collections(id);
ALTER TABLE reviews ADD COLUMN requested_visibility TEXT NOT NULL DEFAULT 'shared'
  CHECK(requested_visibility IN ('shared', 'admin_only'));
ALTER TABLE reviews ADD COLUMN final_space_id TEXT REFERENCES spaces(id);
ALTER TABLE reviews ADD COLUMN final_collection_id TEXT REFERENCES collections(id);
ALTER TABLE reviews ADD COLUMN final_visibility TEXT
  CHECK(final_visibility IN ('shared', 'admin_only'));
ALTER TABLE reviews ADD COLUMN visibility_reason_code TEXT;

-- Existing reviews predate distinct requested/final metadata. Recover requested
-- values from their immutable Submission and only populate final values for a
-- completed publication. This preserves legacy admin_only decisions exactly.
UPDATE reviews
SET
  requested_title = (SELECT title FROM submissions WHERE submissions.id = reviews.submission_id),
  requested_space_id = (SELECT requested_space_id FROM submissions WHERE submissions.id = reviews.submission_id),
  requested_collection_id = (SELECT requested_collection_id FROM submissions WHERE submissions.id = reviews.submission_id),
  requested_visibility = visibility,
  final_space_id = CASE WHEN decision = 'published' THEN COALESCE(
    (SELECT knowledge_items.space_id
     FROM source_versions
     JOIN revisions ON revisions.source_version_id = source_versions.id
     JOIN knowledge_items ON knowledge_items.id = revisions.knowledge_item_id
     WHERE source_versions.submission_id = reviews.submission_id),
    (SELECT requested_space_id FROM submissions WHERE submissions.id = reviews.submission_id)
  ) END,
  final_collection_id = CASE WHEN decision = 'published' THEN (
    SELECT knowledge_items.collection_id
    FROM source_versions
    JOIN revisions ON revisions.source_version_id = source_versions.id
    JOIN knowledge_items ON knowledge_items.id = revisions.knowledge_item_id
    WHERE source_versions.submission_id = reviews.submission_id
  ) END,
  final_visibility = CASE WHEN decision = 'published' THEN visibility END;

CREATE INDEX reviews_final_target_lookup
ON reviews(final_space_id, final_collection_id, final_visibility, created_at DESC, id DESC);

ALTER TABLE revisions ADD COLUMN summary TEXT NOT NULL DEFAULT '';
CREATE INDEX revision_tags_tag_revision ON revision_tags(tag_id, revision_id);
CREATE INDEX knowledge_items_current_revision_index_status
ON knowledge_items(current_revision_id, search_status, status);

-- Reindex only current readable revisions. Existing title, tag, and body terms
-- remain searchable; M1-only summary/code fields are safely empty for legacy rows.
DROP TABLE chunks_fts;
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  chunk_id UNINDEXED,
  title,
  summary,
  tags,
  body,
  code,
  tokenize='unicode61 remove_diacritics 2'
);
INSERT INTO chunks_fts (chunk_id, title, summary, tags, body, code)
SELECT chunks.id, revisions.title, revisions.summary, chunks.search_tags, chunks.search_body, ''
FROM chunks
JOIN revisions ON revisions.id = chunks.revision_id
JOIN knowledge_items ON knowledge_items.current_revision_id = revisions.id
WHERE knowledge_items.status = 'active';
