-- Administrator review decisions (publish, reject, request-revision) become
-- recorded operations. A decision carries the client's operation number and the
-- submission version it was read at, so a lost response can be retried under the
-- same number and replayed from its original receipt instead of acting twice,
-- while a stale request fails as an explicit conflict that names the current
-- version instead of overwriting a newer state.
--
-- One submission is decided once per version, but it can be decided again after
-- a revision was requested and resubmitted, so the operation namespace is the
-- submission (the same decision reached from the queue or from the detail
-- surface resolves to one receipt). `actor_id` deliberately carries no foreign
-- key so a receipt survives the acting member's removal, and it is the acting
-- identity of the winning attempt, not an authorization source: the decision
-- still re-reads the caller's live admin state on every attempt.
CREATE TABLE review_decision_receipts (
  submission_id TEXT NOT NULL,
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 1 AND 128),
  kind TEXT NOT NULL CHECK(kind IN ('review.publish', 'review.reject', 'review.request_revision')),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64),
  actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 128),
  expected_version TEXT,
  claim_id TEXT NOT NULL UNIQUE,
  response_json TEXT NOT NULL CHECK(json_valid(response_json) AND length(response_json) <= 8192),
  created_at TEXT NOT NULL,
  PRIMARY KEY(submission_id, operation_id)
);
