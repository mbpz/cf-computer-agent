# Handoff fix batch (2026-11-23, local)

Scope: `docs/product/2026-11-19-product-handoff.md` H01–H11. This is local implementation and regression evidence, not deployment or signed-browser acceptance. Baseline product SHA: `1795685fd7e2425278f0e694dbc256305df3da22`; handoff documentation commits `debc145c`/`25e6aa7d`.

## H01 — separate registration invitations from password recovery

- New `migrations/0081_password_recovery.sql`: `password_recovery_codes` stores only a SHA-256 hash, one active code per member, with a 30-minute expiry and single use. Recovery attempts have their own per-IP counter.
- `POST /api/admin/members/:id/recovery-code` (built-in admin + `member:manage`): invalidates earlier unused codes, returns the formatted code exactly once, audits `member.recovery_code_issued` without the plaintext.
- `POST /auth/password/recovery` (anonymous): email + one-time recovery code + new password. A valid code replaces the password, clears login locks, revokes other sessions and is consumed once. Unknown email, disabled member, wrong/expired/reused code all return `PASSWORD_RECOVERY_INVALID`; attempts are bounded per IP.
- `POST /auth/password/reset` now returns `410 PASSWORD_RESET_DEPRECATED`; registration invitation codes are never accepted as recovery credentials.
- Login reset mode asks for the one-time recovery code; the member-management page has a "Recovery code" row action for active members. The settings account-bound invitation copy now says it is registration provenance, not a reset credential.
- Legacy/OAuth-only accounts are recoverable through an administrator-issued recovery code; authenticated password change remains available.

Tests: `test/worker/password-recovery.test.ts` (issue/use/replay/expiry/wrong code/old endpoint/admin-only/quota), updated `test/worker/password-auth.test.ts`, `test/worker/invitation-auth.test.ts`, `test/unit/frontend-login-password.test.tsx`, `test/unit/frontend-password-auth-data.test.ts`, `test/unit/frontend-admin-members-tabs.test.tsx`.

## H02 — menu write refreshes the shell navigation

- `frontend/lib/navigation-data.ts` exports `NAVIGATION_REFRESH_EVENT`; `AdminMenusRoute` dispatches it only after a committed menu write. `AppShell` listens and re-reads `/api/navigation` without a logout or full reload.
- Test: `test/unit/frontend-admin-menu-recovery.test.tsx` asserts one refresh request after a committed save.

## H03/H11 — role effective permissions and built-in membership

- `RoleRecord` now carries `effectiveBits` (stored mask OR the built-in fallback for the role's member type). Role detail shows the effective mask and stored mask separately and labels a record-only edit; the confirmation still targets the stored mask and expected version.
- Built-in system roles derive membership from `members.role` as well as `role_members`, so the Contributor/Admin member lists and counts include newly registered members while permission fallback is unchanged.
- Tests: `test/unit/frontend-admin-role-confirmation.test.tsx`, `test/worker/admin-roles.test.ts` (new contributor appears in Contributor role; effective mask remains authoritative).

## H04–H06 — batch review page ownership and recovery

- H04: the queue's Batch decisions entry carries its current page/page size; the batch page loads that page, supports numbered pagination/page-size changes, and clears the selection when the page changes.
- H05: `useReviewBatch` gained `onStart`; the batch page records the page/attempt that owns navigation, checks the route is still `/admin/submissions/batch` and the component is mounted before auto-returning. A late completion after leaving does not navigate.
- H06: `frontend/lib/review-batch-intent.ts` persists the frozen actions (operation ids + expected versions), selected decision/reason/note and outcomes in sessionStorage per member. A POST whose 200 body cannot be trusted now raises `BatchReviewUnknownOutcomeError` and restores as an explicit unknown attempt; the page offers "Retry the original batch" (same operation ids/payload) or discard, and never silently resends.
- Tests: `test/unit/frontend-review-batch.test.tsx` covers the requested page, page-scoped selection, late-completion suppression, unknown-result restore, and malformed-200 classification.

## H07 — tab switches preserve operation owners

- `frontend/components/motion/tabs.tsx` uses `key={value}` for both active and inactive panels, so a panel is not unmounted/remounted when another tab becomes active. Asset hygiene, member invitation/network and other consumers keep their in-flight/finished state across tab switches.
- Tests: `test/unit/frontend-admin-asset-tabs.test.tsx` asserts the hygiene panel DOM node survives tab switches; existing asset hygiene tests remain green.

## H08 — rejected registrations do not spend the new-account quota

- Registration attempt rows now store `member_id` only when the guarded member insert succeeded; the hourly account quota counts only those rows. Rejected invitations are recorded with `member_id = NULL` and have their own bounded failure limit, so brute-force attempts stay limited without consuming legitimate account quota.
- Test: `test/worker/password-recovery.test.ts` issues five rejected attempts, then a valid registration succeeds and only one successful attempt is recorded.

## H09/H10 — delegated member administrators

- Only the built-in admin role sees the Invitation codes and Relationship network tabs or the recovery-code action; delegated `member:manage` administrators see only the member list and never request the invitation endpoints. Server-side capability + admin-role checks remain in place.
- Once an admin opens an invitation/network tab, the panel stays mounted while another member tab is active; generated-code state and results survive tab switches without refetching.
- Tests: `test/unit/frontend-admin-members-tabs.test.tsx` covers hidden tabs, no invitation request for a delegated manager, recovery issuance and panel state preservation.

## Local verification

From the repository root on the fixed working tree:

| Command | Result |
| --- | --- |
| `npm run verify:m1:migrations -- --files` | exit 0; 81 local migration files; not remote D1 evidence |
| `npm run audit:workbench-domain` | exit 0; domain evidence regenerated for the new recovery-code mutation |
| `npm run verify:workbench-maturity` | exit 0; 15/15 |
| `npm run verify:delivery-status` | exit 0; 30/30 |
| `npm run audit:frontend-operations` / operation inventory tests | exit 0; 481 files / 1818 candidates; manual review and fingerprints updated |
| `npm run verify:m1:docs` | exit 0; 14 evidence blocks, 76/76 atoms |
| `npm run check` | exit 0; unit 414 files / 5635 tests, worker 81 files / 1327 tests, smoke 88, i18n 14, delivery 30, landing 100; build upload 1745.68 KiB / gzip 330.71 KiB |

## Production check (2026-11-23 23:23 Shanghai)

Wrangler OAuth was completed successfully. The remote D1 ledger already contained `0081_password_recovery.sql` as migration id 82 (82 applied rows); `npm run db:migrate:remote` reported “No migrations to apply”. The remote recovery schema has `password_recovery_codes`, `password_recovery_attempts` and their indexes.

The production Worker version `2a67c519-1d65-42fe-b6af-230b10604f82` (created 2026-11-23T15:13:31Z) serves the same built asset hashes as the local `frontend/dist` from commit `0bf412a0` (`/assets/index-sIPpdZRP.js`, `/assets/rolldown-runtime-hePW80VL.js`). Production probes: `POST /auth/password/reset` → `410 PASSWORD_RESET_DEPRECATED`; `POST /auth/password/recovery` with a dummy code → `401 PASSWORD_RECOVERY_INVALID`. Therefore the remote code and migration already match this fix batch; no new version upload was needed.

No signed-browser acceptance is claimed. H01–H11 are locally implemented with regression tests; production journey acceptance remains open in the delivery ledger.
