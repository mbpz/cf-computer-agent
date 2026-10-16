-- The status-intent receipt is keyed on `status_version` so that a legitimate repeat of the
-- same (from,to) transition is recorded again (todo->doing, doing->todo, todo->doing ...).
-- Dropping the version would make every reopen cycle collide, so the key stays. Instead the
-- receipt insert tolerates a re-used key: a path that rewinds `status_version` (repair or
-- migration) would otherwise re-use an existing key and abort the whole CAS write with a
-- UNIQUE failure. An existing receipt already represents that logical event, so ignoring the
-- duplicate keeps the write safe; a still-pending receipt is drained by the service as before.
DROP TRIGGER trg_tasks_status_notification_intent;
CREATE TRIGGER trg_tasks_status_notification_intent
AFTER UPDATE OF status ON tasks
WHEN OLD.status <> NEW.status
BEGIN
  INSERT OR IGNORE INTO task_status_notification_intents (
    id, recipient_member_id, task_id, previous_status, status,
    deduplication_key, created_at
  ) VALUES (
    'task-status:' || NEW.id || ':' || OLD.status || ':' || NEW.status || ':v' || NEW.status_version,
    NEW.member_id,
    NEW.id,
    OLD.status,
    NEW.status,
    'task:' || NEW.id || ':status:' || OLD.status || ':' || NEW.status || ':v' || NEW.status_version,
    NEW.updated_at
  );
END;
