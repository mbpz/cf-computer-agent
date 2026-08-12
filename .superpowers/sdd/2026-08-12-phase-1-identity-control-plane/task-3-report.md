# Task 3 report — Complete

## Delivered

- Added typed Member domain records, a D1 repository, and `MembersService`.
- `resolveFirstLogin(identity)` looks up the stable Access subject, fails closed for disabled members, creates active contributors by default, and grants the bootstrap admin role only when no active admin exists and the canonicalized configured email matches.
- Bootstrap insert conflicts are handled safely: the service re-reads by subject, checks for a newly-created admin, and retries once as a contributor. Non-unique D1 failures propagate and never create an account.
- `setContributorStatus(actor, memberId, status)` requires an active admin actor and only updates contributors; no Web path can mutate an admin.
- `last_seen_at` uses a conditional D1 update with a 60-second window. The update is best-effort and never changes the authorization outcome; its warning has no identity or configuration data.

## TDD evidence

- RED: `rtk npx vitest run test/unit/members-service.test.ts` failed because `src/members/service` did not yet exist.
- GREEN: the focused unit suite passes bootstrap-admin, contributor, no-late-promotion, disabled-member, protected-admin, rate-limited last-seen, best-effort write, and arbitrary-D1-failure behaviors.
- The local workerd D1 suite applies the migration and verifies concurrent matching bootstrap logins produce exactly one active admin plus one contributor, and that a disabled D1 record is rejected.

## Verification

- `rtk npx vitest run test/unit/members-service.test.ts test/worker/members.test.ts`: 2 files, 10 tests passed.
- `rtk npm run typecheck`: passed.
- `rtk git diff --check`: passed.
- `rtk npm run check`: passed (generated types, typecheck, 2 smoke tests, 56 unit tests, 23 worker tests, and a dry-run build).

Vitest emitted the existing local AI-binding warning. The worker suite also emitted its pre-existing intentional corrupt-journal diagnostic while all tests passed. The tests use local workerd/D1 and do not deploy, migrate remote D1, or contact network services.

## Self-review

- Scoped changes are confined to the Task 3 files and this report.
- `BOOTSTRAP_ADMIN_EMAIL` is canonicalized through the Access identity canonicalizer and no real email or configured value occurs in source, fixtures, tests, logs, or this report.
- The partial D1 unique index remains the authoritative one-active-admin concurrency guard; recovery only handles unique-constraint races.

## Fix round 1/5 — Complete

### Review findings resolved

- `MembersService` now accepts an optional `waitUntil(promise)` lifecycle sink. The scheduled `last_seen` promise catches internally, so its failure cannot reject authorization; without a sink, the service awaits that handled promise in unit/direct-call contexts. Task 7 can inject `ExecutionContext.waitUntil` without changing this contract.
- `MembersRepository.listPage` now owns a small member-scoped implementation of the global page contract: opaque versioned base64url keyset cursors, default 20, maximum 50, finite-integer limit validation, and stable invalid-limit/cursor `AppError`s. Task 5 should consolidate this logic into shared `src/pagination.ts` without changing member behavior.
- `insert` maps only exact known D1/SQLite messages for `members.access_sub` and the partial `members.role` admin index to typed `MembersConflictError` variants. The service re-reads/retries only those race types; unrelated unique constraints such as `members.id` and arbitrary D1 failures propagate unchanged.

### Regression evidence

- RED: focused member suites failed for the missing lifecycle sink, missing `listPage`, and absent typed conflict class; the tests also demonstrated the original raw-ID/limit behavior was non-conformant.
- GREEN: `rtk npx vitest run test/unit/members-service.test.ts test/worker/members.test.ts` passed: 2 files, 18 tests.
- Full gate: `rtk npm run check` passed (generated types, typecheck, 2 smoke tests, 58 unit tests, 29 worker tests, and dry-run build). `rtk git diff --check` passed.

The same local AI-binding warning and intentional corrupt-journal workerd diagnostic appeared while all tests passed. No remote D1 migration, deployment, or network operation occurred.
