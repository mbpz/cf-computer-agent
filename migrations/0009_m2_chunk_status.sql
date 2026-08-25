-- M2 chunk moderation is metadata-only: the immutable source and revision
-- remain unchanged while indexing and retrieval honor this status.
ALTER TABLE chunks ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK(status IN ('active', 'disabled'));

CREATE INDEX chunks_revision_status
ON chunks(revision_id, status, ordinal, id);
