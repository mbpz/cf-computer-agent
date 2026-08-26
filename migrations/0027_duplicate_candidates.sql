-- ING-014: exact duplicate candidates are retained for an explicit admin decision.
CREATE TABLE duplicate_candidates (
  submission_id TEXT PRIMARY KEY REFERENCES submissions(id),
  canonical_submission_id TEXT NOT NULL REFERENCES submissions(id),
  canonical_source_id TEXT NOT NULL REFERENCES sources(id),
  canonical_source_version_id TEXT NOT NULL REFERENCES source_versions(id),
  decision TEXT NOT NULL CHECK(decision IN ('pending', 'associate', 'keep_separate', 'reject')) DEFAULT 'pending',
  decided_by TEXT REFERENCES members(id),
  decided_at TEXT,
  created_at TEXT NOT NULL,
  CHECK((decision = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
    OR (decision != 'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);

CREATE INDEX duplicate_candidates_queue
ON duplicate_candidates(decision, created_at DESC, submission_id DESC);
