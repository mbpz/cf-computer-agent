-- M1 completion is forward-only. Legacy SourceVersions retain their immutable
-- content_sha256 semantics; source_identity_sha256 is intentionally NULL until
-- a canonical M1-v2 identity can be computed from the original source inputs.
ALTER TABLE source_versions ADD COLUMN parser_schema_version TEXT NOT NULL DEFAULT 'm1-v1';
ALTER TABLE source_versions ADD COLUMN source_identity_sha256 TEXT;
ALTER TABLE source_versions ADD COLUMN code_language TEXT;
ALTER TABLE source_versions ADD COLUMN file_label TEXT;
ALTER TABLE source_versions ADD COLUMN line_baseline INTEGER NOT NULL DEFAULT 1 CHECK(line_baseline > 0);

ALTER TABLE submissions ADD COLUMN supersedes_submission_id TEXT REFERENCES submissions(id);
ALTER TABLE submissions ADD COLUMN requested_visibility TEXT NOT NULL DEFAULT 'shared'
  CHECK(requested_visibility IN ('shared', 'admin_only'));
CREATE INDEX submissions_owner_status_page
ON submissions(submitter_id, status, created_at DESC, id DESC);

-- Publication intents are the immutable normalized final-metadata snapshot used
-- for exact retry equality. Nullable legacy rows are backfilled from Submission.
ALTER TABLE publication_intents ADD COLUMN space_id TEXT REFERENCES spaces(id);
ALTER TABLE publication_intents ADD COLUMN collection_id TEXT REFERENCES collections(id);
ALTER TABLE publication_intents ADD COLUMN visibility_reason_code TEXT
  CHECK(visibility_reason_code IS NULL OR visibility_reason_code = 'admin_visibility_expansion');
UPDATE publication_intents
SET space_id = (SELECT requested_space_id FROM submissions WHERE submissions.id = publication_intents.submission_id),
    collection_id = (SELECT requested_collection_id FROM submissions WHERE submissions.id = publication_intents.submission_id);

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
ALTER TABLE chunks ADD COLUMN index_field TEXT NOT NULL DEFAULT 'body'
  CHECK(index_field IN ('body', 'code'));
UPDATE chunks SET index_field = 'code'
WHERE revision_id IN (
  SELECT revisions.id FROM revisions
  JOIN source_versions ON source_versions.id = revisions.source_version_id
  JOIN sources ON sources.id = source_versions.source_id
  WHERE sources.kind = 'code'
);
ALTER TABLE jobs ADD COLUMN lease_token TEXT;
ALTER TABLE jobs ADD COLUMN lease_expires_at TEXT;
CREATE INDEX revisions_knowledge_item_cleanup
ON revisions(knowledge_item_id, id);
CREATE INDEX revision_tags_tag_revision ON revision_tags(tag_id, revision_id);
CREATE INDEX knowledge_items_current_revision_index_status
ON knowledge_items(current_revision_id, search_status, status);
CREATE INDEX knowledge_items_collection_reindex
ON knowledge_items(status, collection_id, current_revision_id);

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
WITH active_tag_documents AS (
  SELECT revision_id, group_concat(tag_text, ' ') AS tags
  FROM (
    SELECT revision_tags.revision_id,
      trim(lower(tags.slug) || ' ' || tags.name) AS tag_text
    FROM revision_tags
    JOIN tags ON tags.id = revision_tags.tag_id AND tags.status = 'active'
    ORDER BY revision_tags.revision_id, tag_text
  )
  GROUP BY revision_id
)
INSERT INTO chunks_fts (rowid, chunk_id, title, summary, tags, body, code)
SELECT chunks.rowid, chunks.id, revisions.title, revisions.summary,
  coalesce(active_tag_documents.tags, ''),
  CASE WHEN chunks.index_field = 'body' THEN chunks.search_body ELSE '' END,
  CASE WHEN chunks.index_field = 'code' THEN chunks.search_body ELSE '' END
FROM chunks
JOIN revisions ON revisions.id = chunks.revision_id
JOIN knowledge_items ON knowledge_items.current_revision_id = revisions.id
JOIN jobs ON jobs.kind = 'index_revision' AND jobs.resource_id = revisions.id
  AND jobs.state = 'completed'
JOIN spaces ON spaces.id = knowledge_items.space_id
  AND spaces.status = 'active' AND spaces.kind != 'legacy'
LEFT JOIN collections ON collections.id = knowledge_items.collection_id
  AND collections.space_id = knowledge_items.space_id AND collections.status = 'active'
LEFT JOIN active_tag_documents ON active_tag_documents.revision_id = revisions.id
WHERE knowledge_items.status = 'active' AND knowledge_items.search_status = 'indexed'
  AND (knowledge_items.collection_id IS NULL OR collections.id IS NOT NULL);

-- Contributor ranking uses an independent corpus so admin-only documents can
-- never alter contributor BM25 statistics, raw scores, ordering, or cursors.
CREATE VIRTUAL TABLE chunks_fts_shared USING fts5(
  chunk_id UNINDEXED,
  title,
  summary,
  tags,
  body,
  code,
  tokenize='unicode61 remove_diacritics 2'
);
WITH active_tag_documents AS (
  SELECT revision_id, group_concat(tag_text, ' ') AS tags
  FROM (
    SELECT revision_tags.revision_id,
      trim(lower(tags.slug) || ' ' || tags.name) AS tag_text
    FROM revision_tags
    JOIN tags ON tags.id = revision_tags.tag_id AND tags.status = 'active'
    ORDER BY revision_tags.revision_id, tag_text
  )
  GROUP BY revision_id
)
INSERT INTO chunks_fts_shared (rowid, chunk_id, title, summary, tags, body, code)
SELECT chunks.rowid, chunks.id, revisions.title, revisions.summary,
  coalesce(active_tag_documents.tags, ''),
  CASE WHEN chunks.index_field = 'body' THEN chunks.search_body ELSE '' END,
  CASE WHEN chunks.index_field = 'code' THEN chunks.search_body ELSE '' END
FROM chunks
JOIN revisions ON revisions.id = chunks.revision_id
JOIN knowledge_items ON knowledge_items.current_revision_id = revisions.id
JOIN jobs ON jobs.kind = 'index_revision' AND jobs.resource_id = revisions.id
  AND jobs.state = 'completed'
JOIN spaces ON spaces.id = knowledge_items.space_id
  AND spaces.status = 'active' AND spaces.kind != 'legacy'
LEFT JOIN collections ON collections.id = knowledge_items.collection_id
  AND collections.space_id = knowledge_items.space_id AND collections.status = 'active'
LEFT JOIN active_tag_documents ON active_tag_documents.revision_id = revisions.id
WHERE knowledge_items.status = 'active' AND knowledge_items.search_status = 'indexed'
  AND revisions.visibility = 'shared'
  AND (knowledge_items.collection_id IS NULL OR collections.id IS NOT NULL);
