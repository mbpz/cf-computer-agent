-- Pair a parsed private asset with the review-bound Submission in one D1 batch.
-- Both columns are nullable so existing text submissions and historical assets
-- remain unchanged. Triggers make an invalid pairing abort the whole batch.
ALTER TABLE assets ADD COLUMN submission_id TEXT REFERENCES submissions(id);
ALTER TABLE submissions ADD COLUMN asset_id TEXT REFERENCES assets(id);

CREATE UNIQUE INDEX assets_submission_id_unique
ON assets(submission_id)
WHERE submission_id IS NOT NULL;

CREATE TRIGGER submissions_asset_pairing_guard
BEFORE INSERT ON submissions
WHEN NEW.asset_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM assets a
    JOIN parse_jobs j ON j.asset_id = a.id
    WHERE a.id = NEW.asset_id
      AND a.owner_id = NEW.submitter_id
      AND a.submission_id IS NULL
      AND j.status = 'succeeded'
  ) THEN RAISE(ABORT, 'asset pairing invalid') END;
END;

CREATE TRIGGER submissions_asset_pairing_link
AFTER INSERT ON submissions
WHEN NEW.asset_id IS NOT NULL
BEGIN
  UPDATE assets
  SET submission_id = NEW.id, updated_at = NEW.updated_at
  WHERE id = NEW.asset_id;
END;

CREATE TRIGGER submissions_asset_pairing_immutable
BEFORE UPDATE OF asset_id ON submissions
WHEN OLD.asset_id IS NOT NEW.asset_id
BEGIN
  SELECT RAISE(ABORT, 'asset pairing is immutable');
END;
