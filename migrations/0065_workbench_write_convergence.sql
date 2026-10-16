-- Reader-read, saved-view and shared-note retries converge on one recorded
-- outcome instead of repeating a side effect or a last-write-wins upsert.

-- A reader visit carries the explicit identity of the reading it belongs to.
-- A retried read reuses its identity and does not advance the counter again; a
-- genuine second visit supplies a new identity and still counts.
ALTER TABLE knowledge_visits ADD COLUMN visit_identity TEXT NOT NULL DEFAULT '';

-- A saved view records the client key of the request that created it. A replay
-- resolves to the same row instead of colliding on UNIQUE(member_id, name).
ALTER TABLE saved_views ADD COLUMN client_key TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX idx_saved_views_member_client_key
  ON saved_views(member_id, client_key)
  WHERE client_key <> '';

-- A DELETE keeps an owner-scoped receipt so a retried delete of the same view
-- converges on success while another member's or an unknown id stays rejected.
CREATE TABLE saved_view_delete_receipts (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  view_id TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  PRIMARY KEY(member_id, view_id)
);
