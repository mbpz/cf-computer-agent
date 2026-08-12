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
