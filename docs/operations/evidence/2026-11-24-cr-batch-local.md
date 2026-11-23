# Handoff CR batch (2026-11-24, local)

Scope: updated handoff work packages WP01/WP02/WP03/WP04 and audit findings CR01–CR05. Baseline: `a7bb0379` (handoff work-package breakdown) on top of `d759f94d`. This is local implementation/regression evidence; it is not signed-browser acceptance and does not close the 17 parent checklist items.

## CR01 — transport failure is unknown, not a rejection

- `frontend/lib/admin-batch-review-data.ts` now separates a pre-send validation refusal (`BatchReviewRequestError`) from a sent-but-unconfirmed result (`BatchReviewUnknownOutcomeError`). A transport `TypeError` is never treated as “nothing was sent”.
- `useReviewBatch` keeps the frozen actions, operation numbers and expected versions when the fetch itself fails; the page restores the unknown state and offers “Retry the original batch”. Explicit non-retryable HTTP refusals still clear the intent; retryable/5xx/malformed 200 keep it.
- Tests: `test/unit/frontend-review-batch.test.tsx` covers a `TypeError("Failed to fetch")`, recovery with identical operation ids, and malformed-200/unknown handling.

## WP01 — exact receipt lookup

- New admin-only `GET /api/admin/submissions/:id/decisions/operations/:operationId` (read-only; `knowledge:review`), backed by `PublicationService.findDecisionReceipt` and the existing `review_decision_receipts` row. No list-state inference.
- The batch unknown panel can now “Check original receipts”: it reads each original submission + operation number and shows how many have a recorded receipt; missing receipts remain eligible for retry under the same numbers.
- Tests: `test/worker/admin-knowledge-lifecycle.test.ts` asserts the receipt is returned for a committed item, 404 for a missing operation, 403 for a contributor; `test/unit/frontend-review-batch.test.tsx` asserts the receipt check performs only those reads.

## CR02 — batch identity isolation

- `StoredBatchIntent` carries a unique `batchId`. `saveBatchIntent` refuses to overwrite an unresolved (`unknown`/`pending`) batch, `clearBatchIntent` only removes the matching batch, and late old responses are ignored unless the component still owns that batch id. A new batch is refused while an unknown attempt is unresolved; the reviewer must check receipts, retry or discard it.
- Tests: `test/unit/review-batch-intent.test.ts` covers unresolved overwrite, cross-batch clear refusal and done-batch supersession; the batch DOM tests cover unknown-blocks-new-send and transport retry identity.

## CR03 / WP02 — shared batch ceiling

- UI selection and submission share `MAX_BATCH_ACTIONS = 20`; 50/100-row pages remain browsable, Select-all selects at most 20 and explains the limit, and a 21st manual selection is refused with the same message rather than truncated silently.
- Tests: new DOM case loads 25 rows at pageSize 100, selects all, asserts exactly 20 checked and a 20-action request; the worker test posts 21 actions and expects `400 BATCH_REVIEW_REQUEST_INVALID` before any item runs.

## CR04 / WP03 — baseline-aware role preview

- `RoleRecord` now exposes `baselineBits` separately from `effectiveBits` (both backend and frontend DTO). The role editor preview is `draftMask | baselineBits`, so a permission granted by both the role row and the built-in baseline remains effective after unchecking the row bit; a record-only edit is labelled.
- Tests: `test/unit/frontend-admin-role-confirmation.test.tsx` covers record-only edits and the overlap case (uncheck keeps effective permission); `test/worker/admin-roles.test.ts` asserts baseline/effective values.

## CR05 / WP04 — production manuals

- `docs/operations/production-settings-manual.md` now states the required order: backup D1 → apply `0078`–`0081` → verify `d1_migrations` lists `0081` → switch the Worker. It explains that the new Worker queries `password_registration_attempts.member_id` and the recovery tables, so skipping `0081` breaks even invitation registration.
- `docs/operations/production-environment-handbook.md` names all four migrations, fixes the “three migrations” wording, repeats the pre-switch requirement, and aligns OAuth-only password set/recovery wording. “Remote already has 0081” is explicitly not the same as a new/rebuilt environment satisfying the deployment prerequisite.

## Work packages not executed here

`WP05–WP15` cannot be completed by static source changes alone. They require browser/identity journeys, two real accounts, usable storage/AI bindings, a test VM, or production acceptance. This batch does not mark them done; it leaves those blockers explicit and does not update the 17 parent checklist items. `WP02`/`WP03` code portions are covered by CR03/CR04, but their browser acceptance remains open.

## Local verification

From the repository root on the fixed working tree:

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run verify:m1:migrations -- --files` | exit 0; 81 local migration files |
| `npm run verify:delivery-status` | exit 0; 30/30 |
| `npm run verify:workbench-maturity` | exit 0; 15/15 |
| `npm run audit:workbench-domain` | exit 0 |
| `npm run audit:frontend-operations` / inventory tests | exit 0; 481 files / 1820 candidates; 171 unassigned unchanged; 10/10 |
| `npm run check` | exit 0; unit 415 files / 5643 tests, worker 81 files / 1327 tests, smoke 88, i18n 14, delivery 30, landing 100; build upload 1747.08 KiB / gzip 330.93 KiB |

No browser/identity journey, storage/AI-backed upload, VM or production acceptance was executed. WP05–WP15 remain open with the blockers named above; no parent checklist item was closed.
