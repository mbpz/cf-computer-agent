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

## Audit adjudication and fix round 1

The independent reviewer’s exact concern was that design scope §2.1 says “登录、成员、空间、集合和投稿审计,” while the first Task 7 implementation created only `submission.created`. The exact Task 7 interface text is “Produces exact approved Session, Submission, Member, Space/Collection, Audit APIs.” Because the brief did not itself define the missing actions or transaction semantics, the first report surfaced this for controller adjudication instead of silently changing the Task 6-owned action map.

Human adjudication confirmed that the approved design governs and authorized the cross-task interface expansion. Fix round 1 therefore adds the closed discriminated action set `member.login`, `member.status_updated`, `space.created`, `space.updated`, `collection.created`, `collection.updated`, and the retained `submission.created`. Every action has a strict primitive-only metadata shape, and the validator rejects unknown keys, accessors, symbols, prototypes, `toJSON`, nested objects, and incorrect action/resource combinations before rebuilding null-prototype event and metadata DTOs. Metadata contains only roles, resource identifiers, and status transitions; it never contains email, Access subject, title, content, token, JWT, bootstrap email, or caller-provided arbitrary fields.

First-login auditing means first member-row creation, not every authenticated request: the member insert and `member.login` audit are one D1 batch, bootstrap conflicts remain recoverable, concurrent bootstrap produces exactly one audit per successfully created member, and repeat login/`last_seen_at` background work produces no login audit. A failed paired audit rolls back member creation. The existing caught `waitUntil` last-seen path remains non-authoritative and cannot convert background failure into authentication failure.

Member status and every Space/Collection create/update now pair the mutation and audit insert in one D1 batch. Real D1 regressions force the audit insert to fail and prove rollback for each mutation family. Audited updates also condition on the state observed before building the status-transition metadata, preventing a concurrent write from producing a stale transition audit. Submission creation retains its existing paired batch and ownership-derived actor binding.

The `action` API filter is now passed into the audit repository and applied before cursor/order/`LIMIT + 1` in the keyset SQL. A mixed-action real D1 pagination test proves bounded, gap-free filtered pages, while the admin route test covers every action, invalid-filter rejection, response redaction, and first-login retrieval.

An independent read-only review of fix round 1 returned **READY**, with no Critical, Important, or Minor findings. The reviewer independently passed typecheck, diff check, and 9 focused unit/workerd files with 115 tests; it made no repository changes.

## Verification

- `rtk npx vitest run test/unit/members-service.test.ts test/worker/members.test.ts test/worker/phase1.test.ts` — passed, 3 files / 46 tests.
- `rtk npx vitest run test/unit/audit.test.ts test/unit/members-service.test.ts test/unit/spaces-service.test.ts test/worker/members.test.ts test/worker/spaces.test.ts test/worker/submissions.test.ts test/worker/phase1.test.ts` — audit fix round passed, 7 files / 90 tests.
- `rtk npm run typecheck` — passed.
- `rtk git diff --check` — passed.
- `rtk npm run check` — passed after fix round 1: generated types current, TypeScript clean, smoke 2/2, unit 14 files / 114 tests, worker 6 files / 73 tests, and Wrangler dry-run build successful.

The established worker suite intentionally prints negative `Invalid pending note journal` diagnostics while testing redaction/recovery and the local AI-binding warning; passing test counts and exit status are authoritative.
