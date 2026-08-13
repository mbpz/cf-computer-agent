# Task 7 report: role-aware Phase 1 API composition

## Delivered

- Replaced the Phase 0 blanket APP_TOKEN gate with exactly one request-scoped `resolvePrincipal` call per API request. A verified Access assertion always selects the member path; requests without one use the existing constant-time APP_TOKEN automation path.
- Constructed request-scoped D1/DO/AI services after API path classification. `MembersService` receives a bound `ctx.waitUntil(promise)` callback; a real workerd execution-context regression proves the scheduled `last_seen_at` update completes.
- Added exact Session, member, admin, Space/Collection, submission, and audit route modules with stable 404/405 JSON errors, exact `Allow` headers, request IDs, no-store/security headers, bounded JSON bodies, and existing service/repository validation.
- Enforced every route with the approved capability/principal boundary:
  - contributor: Session, Space/Collection reads, submission create/list-own, legacy note/list/search/chat reads;
  - admin: contributor paths, legacy note writes, and all Phase 1 admin routes;
  - automation: health plus legacy note read/write, search, and chat only;
  - disabled member: rejected during principal resolution before dispatch.
- Kept contributor submission reads ownership-scoped through `SubmissionsService.listOwn(memberId, ...)`, whose repository query contains `WHERE submitter_id = ?`. Route tests seed another owner and reuse an admin cursor-shaped input without exposing foreign submissions.
- Session returns only `{ member: { id, email, role }, capabilities, logoutUrl }`. Session and admin member DTOs omit `accessSub`; tests reject JWT/token/bootstrap markers.
- Preserved Phase 0 `{ ok }`, `{ note }`, `{ notes }`, `{ hits }`, and chat bodies plus note create/update `201`/`200` semantics. Existing concurrent-write, eviction, journal-recovery, request-limit, and error-redaction tests continue through the new composition.

## TDD evidence

- Initial real-workerd Phase 1 matrix: RED, 15/15 failures for the intended Phase 0 boundary (member requests returned APP_TOKEN `AUTH_REQUIRED`, automation Phase 1 paths returned `NOT_FOUND`, and route-specific 405 behavior did not exist).
- After request-scoped composition: GREEN, 15/15.
- Status-filtered member pagination: RED because `listPage(..., "disabled")` returned active rows; GREEN after the authorized Task 3 ownership exception below.
- Protected-admin route: RED with `FORBIDDEN`; GREEN with stable `ADMIN_PROTECTED`.
- Automation-only health: RED because active members received 200; GREEN after principal enforcement.
- Final expanded Phase 1 matrix: 24/24, covering inherited admin routes, all admin endpoints, contributor collection reads, foreign-owner/cursor isolation, automation restrictions, disabled fail-closed behavior, request/error redaction, and exact 405/`Allow` values for every route family.

## Authorized ownership exception

The controller authorized a narrow change to the Task 3-owned member repository contract because `GET /api/admin/members?status=` cannot be correct by filtering after a keyset page. `MembersRepository.listPage(limit, cursor, status?)` now validates the optional status and adds `status = ?` directly to bounded D1 SQL before `id > ?`, ordering, and `LIMIT + 1`. Existing unfiltered callers and opaque/default/max pagination behavior remain unchanged. A real D1 test traverses 55 mixed-status members in pages of seven with no gaps, duplicates, cross-status records, or unbounded reads.

## Independent review

The first review found no Critical issues and identified four Important concerns. The following were fixed and re-reviewed:

- post-page member status filtering moved into keyset SQL;
- protected-admin mutations now return `ADMIN_PROTECTED`;
- permission evidence expanded to inherited admin, contributor collection, foreign-owner/cursor, and every admin path;
- route-family 405 coverage completed, and health restricted to automation.

Fix-round verdict: **READY for Task 7; no Critical or Important defects remain.** The reviewer independently ran typecheck, diff check, and a focused workerd suite (6 files / 66 tests).

## Deferred audit design gap for controller adjudication

The reviewer’s exact concern was that the design scope §2.1 includes “登录、成员、空间、集合和投稿审计,” while login/session and member/Space/Collection mutations currently do not create audit events. The approved Task 7 brief, however, requires composing the already approved Session, Submission, Member, Space/Collection, and Audit APIs; it does not define new audit actions or multi-resource write semantics. The existing Task 6 interface produced a discriminated action map containing only `submission.created`, a paired submission/audit D1 batch, and paged `listAudit`.

Per controller direction, Task 7 does not silently expand the Task 6 action map. The explicitly approved audit-producing operation remains wired: submission creation builds an allowlisted `submission.created`, writes it with the submission in the tested D1 batch, and exposes it through the capability-gated `/api/admin/audit-events?action=submission.created`. Login/member/Space/Collection audit action names, metadata allowlists, and failure/transaction boundaries remain a deferred design gap requiring an explicit cross-task interface decision.

## Verification

- `rtk npx vitest run test/unit/members-service.test.ts test/worker/members.test.ts test/worker/phase1.test.ts` — passed, 3 files / 46 tests.
- `rtk npm run typecheck` — passed.
- `rtk git diff --check` — passed.
- `rtk npm run check` — passed: generated types current, TypeScript clean, smoke 2/2, unit 14 files / 102 tests, worker 6 files / 66 tests, and Wrangler dry-run build successful.

The established worker suite intentionally prints negative `Invalid pending note journal` diagnostics while testing redaction/recovery and the local AI-binding warning; passing test counts and exit status are authoritative.
