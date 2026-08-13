# Task 6 report: owned review-pending submissions and allowlisted audit

## Delivered

- Added typed submission creation plus owner-scoped and pending keyset lists. Contributor-facing repository methods expose no unrestricted submission lookup; `listOwned` includes `WHERE submitter_id = ?` before every keyset condition.
- Enforced submission validation: `text`, `markdown`, or `code`; trimmed nonblank title; UTF-8 content size from 1 through 128 KiB; and fixed `review_pending` status.
- Moved submission target checks into the conditional insert: its Space must be active, non-legacy, and writable; an optional Collection must be active and in that same Space at statement execution.
- Added discriminated audit event types. `submission.created` permits only `{ kind, requestedSpaceId, requestedCollectionId? }`; runtime validation rejects arbitrary top-level/metadata fields including token, JWT, content, and request body fields.
- Submission creation builds the submission insert and its allowlisted audit event in one local D1 `batch`. The audit statement is conditional on the submitted row and matching member actor, so an invalid target does not leave an audit row.

## Local D1 batch boundary

The workerd+D1 integration characterizes the observed local behavior: when the dependent audit insert fails on a duplicate audit ID, the earlier submission insert is absent afterwards. A zero-row dependent audit statement also makes the repository reject rather than return a successful submission. The implementation relies only on these tested D1 batch behaviors for the paired local writes; it does not claim cross-service atomicity or a broader transaction guarantee beyond D1's batch operation.

## Review fix round 1

- `assertAuditEventInput` now accepts only ordinary/null-prototype data objects with own data properties, rejects own/inherited `toJSON`, symbols, custom prototypes, nested values, and unallowlisted fields, then rebuilds null-prototype event and metadata DTOs from validated primitive fields. The repository serializes only that rebuilt DTO.
- The paired-write repository validates exact submission/audit identity before `D1Database.batch`: member actor equals submitter, resource is the submitted ID/type, action is `submission.created`, and metadata exactly derives from the submission target and kind. It also rejects a zero-change audit batch result.
- Regression coverage proves prototype and `toJSON` markers cannot reach serialized output; actor/resource mismatches persist no submission; and a zero-row audit write does not yield a successful create result.

## Review fix round 2

- The dependent audit SQL now derives `actor_id`, fixed member action/type, and `resource_id` from the just-inserted submission row rather than binding caller-provided identity fields. If target validation inserts no submission, both statements report zero changes and the repository returns the stable target error; it cannot return a success without an audit row.
- A real workerd D1 duplicate-audit regression now makes the second statement fail inside `D1Database.batch` and asserts that neither the new submission nor a linked audit event remains. This is the tested rollback boundary used by the paired-write implementation.

## Verification

- `rtk npm run typecheck` — passed.
- `rtk npx vitest run test/unit/submissions-service.test.ts test/unit/audit.test.ts test/worker/submissions.test.ts` — passed (3 files, 20 tests).
- `rtk npm run check` — passed: generated types, TypeScript, 2 smoke tests, 14 unit files/100 tests, 5 worker files/39 tests, and local dry-run build.
- `rtk git diff --check` — passed.

The established worker suite still prints intentional `Invalid pending note journal` diagnostics from durability tests and the established local AI-binding warning; Vitest reports all tests passing.

## Commit

`feat: add review-pending submissions`
