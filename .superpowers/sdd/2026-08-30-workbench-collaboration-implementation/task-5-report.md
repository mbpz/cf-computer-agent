# Workbench Collaboration Task 5 Report

## Status

Implemented notification storage and the narrow `NotificationsService` domain boundary. Tasks emit recipient-owned status notifications only after a real state transition. No notification API route, frontend, Queue, KV, Durable Object, or paid-plan dependency was added.

Commit subject: `feat: add idempotent workbench notifications` (this report is part of that commit).

## RED / GREEN Evidence

### Storage and repository

- RED: migration tests failed because `notifications` and its recipient indexes did not exist; repository tests could not import the notifications module.
- GREEN: migration `0036_workbench_notifications.sql` and repository tests pass, including append-only schema constraints, deterministic numbered pagination, recipient ownership, 100-ID bulk read, and `EXPLAIN QUERY PLAN` assertions that reject scans.
- RED: the exact migration verifier rejected the new migration count/hash, and the release-contract ledger still ended at `0035`.
- GREEN: verifier and release contract now pin all 36 migrations, including SHA-256 `00823b0d4247ed7c36a96456a5c6bb1811c9ab2c5ef2077910b8b29a1419117f` for `0036`.

### Domain service and task sink

- RED: service tests failed before `NotificationsService` existed; task tests observed zero emitted events; Worker tests lacked lazy due materialization.
- GREEN: tests cover event normalization, canonical bounded payloads, unauthorized-target suppression, dedupe replay, unread summary, idempotent single read, bounded bulk read, and lazy due/overdue materialization.
- RED: a self-review test showed invalid list input could trigger lazy writes before validation.
- GREEN: pagination and filters are normalized before materialization.
- RED: the 100-ID Worker bulk test hit SQLite's variable limit, and the free-tier review showed that materializing 50 due candidates left no D1 query headroom.
- GREEN: IDs are passed as one JSON parameter and expanded with `json_each(?)`; lazy due materialization is capped at 10 candidates per read.

## Schema and indexes

`notifications` is append-only except for the recipient-scoped `read_at` transition. The schema bounds identifiers, event/target enums, deduplication keys, and JSON object payloads (4096 bytes). It enforces `UNIQUE(recipient_member_id, deduplication_key)`.

Indexes:

- `idx_notifications_recipient_created(recipient_member_id, created_at DESC, id DESC)`
- `idx_notifications_recipient_type_created(recipient_member_id, event_type, created_at DESC, id DESC)`
- partial unread index `idx_notifications_recipient_unread_created(recipient_member_id, created_at DESC, id DESC) WHERE read_at IS NULL`

Pagination is deterministic: `created_at DESC, id DESC`, numbered `LIMIT/OFFSET`, with every select/count/update constrained by `recipient_member_id`. Query-plan tests assert indexed search and reject table scans for list, unread, type-filtered, and mutation paths.

## Isolation and idempotency

- `emit` authorizes the recipient against the target before persistence; unauthorized targets are suppressed without disclosure.
- Repository reads and read-state mutations require recipient identity. Cross-recipient single-read replay returns not found.
- `INSERT OR IGNORE` plus the recipient/deduplication unique key returns the original stable notification on replay.
- Single-read replay returns the existing row; bulk reads are capped at 100 and operate only on a bounded visible-ID or filtered recipient subset.
- Task status notifications are emitted only after the repository reports a real transition. Same-status replay exits before event emission.
- Lazy due/overdue observations use deterministic keys derived from task, state, and due timestamp, so repeated list/summary reads converge on one row.

## Non-atomic boundary

The task status update/audit and notification insert are separate D1 statements, not one transaction. Notification retries with the same event key converge through the unique constraint, so duplicate delivery cannot create duplicate rows. A failure after the task transition commits but before the first notification insert can still omit that notification; a same-status request intentionally does not synthesize a new event. This residual omission window is explicit and should be closed only by a future transactional/outbox design, not by Queue/KV/DO work in Task 5.

## Verification

- Focused unit: 2 files, 21 tests passed (`notifications-service`, `tasks-service`).
- Worker/migration/query-plan/task regressions: 27 files, 416 tests passed.
- Exact migration verifier: passed, 36 files.
- M1 release contract: 24 tests passed.
- TypeScript: `tsc --noEmit` passed.
- Diff hygiene: `git diff --check` passed.
- Aggregate `npm test`: smoke (48/48) and i18n (13/13) passed, then the aggregate run stopped on the unrelated existing delivery-status mismatch where `/boards` is registered ready but its expected ledger says coming soon. Task 5 does not modify either affected file; migration and notification gates were run separately above.

## Concerns / follow-up

- The non-atomic omission window above remains by design and is not overstated as atomic delivery.
- Discussion targets are fail-closed until the later discussion domain work supplies recipient authorization.
- Task 6 still owns all Notifications API and UI work.
- No deployment, remote migration, or browser acceptance was performed.
