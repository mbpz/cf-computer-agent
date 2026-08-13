# Task 6 report: owned review-pending submissions and allowlisted audit

## Delivered

- Added typed submission creation plus owner-scoped and pending keyset lists. Contributor-facing repository methods expose no unrestricted submission lookup; `listOwned` includes `WHERE submitter_id = ?` before every keyset condition.
- Enforced submission validation: `text`, `markdown`, or `code`; trimmed nonblank title; UTF-8 content size from 1 through 128 KiB; and fixed `review_pending` status.
- Moved submission target checks into the conditional insert: its Space must be active, non-legacy, and writable; an optional Collection must be active and in that same Space at statement execution.
- Added discriminated audit event types. `submission.created` permits only `{ kind, requestedSpaceId, requestedCollectionId? }`; runtime validation rejects arbitrary top-level/metadata fields including token, JWT, content, and request body fields.
- Submission creation builds the submission insert and its allowlisted audit event in one local D1 `batch`. The audit statement is conditional on the submitted row and matching member actor, so an invalid target does not leave an audit row.

## Local D1 batch boundary

The workerd+D1 integration characterizes the observed local behavior: when the dependent audit insert fails on a duplicate audit ID, the earlier submission insert is absent afterwards. The implementation relies only on this tested D1 batch behavior for the paired local writes; it does not claim cross-service atomicity or a broader transaction guarantee beyond D1's batch operation.

## Verification

- `rtk npm run typecheck` — passed.
- `rtk npx vitest run test/unit/submissions-service.test.ts test/unit/audit.test.ts test/worker/submissions.test.ts` — passed (3 files, 17 tests).
- `rtk npm run check` — passed: generated types, TypeScript, 2 smoke tests, 14 unit files/100 tests, 5 worker files/39 tests, and local dry-run build.
- `rtk git diff --check` — passed.

The established worker suite still prints intentional `Invalid pending note journal` diagnostics from durability tests and the established local AI-binding warning; Vitest reports all tests passing.

## Commit

`feat: add review-pending submissions`
