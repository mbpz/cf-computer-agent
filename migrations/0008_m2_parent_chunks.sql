-- M2 parent-child retrieval: each split child points at its block's first
-- chunk, which acts as a bounded context anchor. The anchor itself is NULL.
ALTER TABLE chunks ADD COLUMN parent_chunk_id TEXT REFERENCES chunks(id) ON DELETE SET NULL;
CREATE INDEX chunks_parent_lookup ON chunks(parent_chunk_id, revision_id, ordinal);
