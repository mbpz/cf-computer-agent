-- Pair a parsed private asset with the review-bound Submission in one D1 batch.
-- Both columns are nullable so existing text submissions and historical assets
-- remain unchanged. Triggers make an invalid pairing abort the whole batch.
ALTER TABLE assets ADD COLUMN submission_id TEXT REFERENCES submissions(id);
ALTER TABLE submissions ADD COLUMN asset_id TEXT REFERENCES assets(id);

CREATE UNIQUE INDEX assets_submission_id_unique
ON assets(submission_id)
WHERE submission_id IS NOT NULL;

-- D1 remote migrations execute each statement through the SQL API. Compound
-- trigger definitions are rejected there as incomplete input even though the
-- local SQLite emulator accepts them. Keep the invariant in the application
-- batch and add a portable uniqueness guard for races.
CREATE UNIQUE INDEX submissions_asset_id_unique
ON submissions(asset_id)
WHERE asset_id IS NOT NULL;
