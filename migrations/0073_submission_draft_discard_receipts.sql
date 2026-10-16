-- R4-011: a member's own server-backed submission draft can be discarded.
--
-- A draft is private, unreviewed text that nothing references (it is never
-- reviewed, published, paired with an asset or linked from another row), so
-- discarding deletes the `submissions` row outright instead of inventing a
-- fourth lifecycle status: every existing draft reader keeps its meaning, and
-- the member's own numbered list stops returning the row.
--
-- The receipt is what makes the delete idempotent, exactly like
-- `saved_view_delete_receipts` (0065) and `task_tombstones` (0066): a retried
-- DELETE whose answer was lost converges on the recorded outcome instead of a
-- second 404, while another member's draft or an unknown id has no receipt and
-- stays not found. It stores no payload, so a receipt can neither resurrect nor
-- disclose deleted text, and `discarded_at` is the moment the delete committed.
CREATE TABLE submission_draft_discard_receipts (
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL,
  discarded_at TEXT NOT NULL,
  PRIMARY KEY(member_id, draft_id)
);
