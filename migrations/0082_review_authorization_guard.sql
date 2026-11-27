-- The route and service checks happen before the transaction. These triggers
-- re-check the reviewer's current member status and effective review grant at
-- the write itself, so a role/member revocation racing the decision cannot
-- commit a review, receipt or audit.
CREATE TRIGGER reviews_require_active_reviewer
BEFORE INSERT ON reviews
WHEN NOT EXISTS (
  SELECT 1 FROM members m
  WHERE m.id = NEW.reviewer_id
    AND m.status = 'active'
    AND (
      m.role = 'admin'
      OR EXISTS (
        SELECT 1
        FROM role_members rm
        JOIN roles r ON r.id = rm.role_id
        WHERE rm.member_id = m.id
          AND r.status = 'active'
          -- knowledge:review is bit 3 (0x8), the high bit of the low hex nibble.
          AND substr(lower(r.allow_bits), -1, 1) IN ('8','9','a','b','c','d','e','f')
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'REVIEWER_NOT_AUTHORIZED');
END;

CREATE TRIGGER review_receipts_require_active_reviewer
BEFORE INSERT ON review_decision_receipts
WHEN NOT EXISTS (
  SELECT 1 FROM members m
  WHERE m.id = NEW.actor_id
    AND m.status = 'active'
    AND (
      m.role = 'admin'
      OR EXISTS (
        SELECT 1
        FROM role_members rm
        JOIN roles r ON r.id = rm.role_id
        WHERE rm.member_id = m.id
          AND r.status = 'active'
          AND substr(lower(r.allow_bits), -1, 1) IN ('8','9','a','b','c','d','e','f')
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'REVIEWER_NOT_AUTHORIZED');
END;
