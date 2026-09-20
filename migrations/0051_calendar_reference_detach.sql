-- 0042 uses composite owner-scoped foreign keys with ON DELETE SET NULL.
-- Detach only the optional reference before FK actions can null member_id.
-- Keep historical SQL and ownership constraints unchanged; no data backfill.
CREATE TRIGGER calendar_detach_task BEFORE DELETE ON tasks
BEGIN
  UPDATE calendar_events
  SET task_id = NULL,
      updated_at = MAX(updated_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
  WHERE task_id = OLD.id AND member_id = OLD.member_id;
END;

CREATE TRIGGER calendar_detach_project BEFORE DELETE ON projects
BEGIN
  UPDATE calendar_events
  SET project_id = NULL,
      updated_at = MAX(updated_at, CAST(strftime('%s', 'now') AS INTEGER) * 1000)
  WHERE project_id = OLD.id AND member_id = OLD.member_id;
END;
