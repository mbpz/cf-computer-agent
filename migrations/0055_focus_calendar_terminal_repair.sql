-- Focus is the lifecycle authority. Repair only a unique, same-member/task focus
-- link; never infer ownership from a client key, title or timestamp. Ambiguous,
-- orphaned, missing and detached links require separate explicit reconciliation.
-- One statement is atomic; already-consistent rows are untouched on replay.
UPDATE calendar_events
SET status = (
      SELECT CASE f.status WHEN 'completed' THEN 'completed' ELSE 'canceled' END
      FROM focus_sessions f WHERE f.calendar_event_id = calendar_events.id
    ),
    updated_at = MAX(updated_at + 1, (
      SELECT f.updated_at FROM focus_sessions f
      WHERE f.calendar_event_id = calendar_events.id
    ))
WHERE kind = 'focus'
  AND (SELECT COUNT(*) FROM focus_sessions f WHERE f.calendar_event_id = calendar_events.id) = 1
  AND EXISTS (
    SELECT 1 FROM focus_sessions f
    WHERE f.calendar_event_id = calendar_events.id
      AND f.member_id = calendar_events.member_id
      AND f.task_id = calendar_events.task_id
      AND f.status IN ('completed', 'abandoned')
      AND calendar_events.status != CASE f.status WHEN 'completed' THEN 'completed' ELSE 'canceled' END
  );
