-- Preserve the original normalized start payload independently of mutable calendar data.
-- NULL identifies legacy rows whose original payload cannot be proven; do not backfill guesses.
ALTER TABLE focus_sessions ADD COLUMN start_title TEXT CHECK(start_title IS NULL OR length(start_title) BETWEEN 1 AND 240);
ALTER TABLE focus_sessions ADD COLUMN duration_minutes INTEGER CHECK(duration_minutes IS NULL OR (typeof(duration_minutes) = 'integer' AND duration_minutes BETWEEN 1 AND 240));
