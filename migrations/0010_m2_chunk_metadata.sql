-- M2 chunk metadata is derived, bounded, and separate from immutable content.
ALTER TABLE chunks ADD COLUMN keywords_json TEXT NOT NULL DEFAULT '[]'
  CHECK(json_valid(keywords_json));

ALTER TABLE chunks ADD COLUMN question_hints_json TEXT NOT NULL DEFAULT '[]'
  CHECK(json_valid(question_hints_json));
