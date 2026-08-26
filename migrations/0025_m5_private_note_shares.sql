CREATE TABLE private_note_shares (
  note_id TEXT NOT NULL REFERENCES private_notes(id) ON DELETE CASCADE,
  recipient_member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY(note_id, recipient_member_id),
  CHECK(revoked_at IS NULL OR revoked_at >= created_at)
);

CREATE INDEX private_note_shares_recipient_page
ON private_note_shares(recipient_member_id, created_at DESC, note_id DESC);

CREATE INDEX private_note_shares_note_page
ON private_note_shares(note_id, revoked_at, recipient_member_id);
