# Task 2 report — route entry, role projection, and page-state reachability

## Status

Complete locally as an R0 audit, including fix round 1. The audit now drives all 21 visible-menu records and all 3 parameterized deep-link records with route-family API fixtures and page-owned observables. It probes loading, empty, retryable error, and ready for every route; unsupported states are tested as explicit gaps. All 24 capabilities remain `partial`; no business behavior was added to improve a classification.

No deployment, remote migration, production mutation, network lookup, or secret access occurred. Release and signed-browser acceptance remain separate and unproven.

## Scope and ruling

- Task 1 identities are unchanged: no capability ID, pathname, `routeId`, `parentRouteId`, or route regex was renamed.
- `knowledge-reader`, `message-thread`, and `admin-submission-detail` are audited through their owning `knowledge`, `messages`, and `admin-submissions` entries plus direct parameterized rendering.
- No duplicate global navigation entry was added for a parameterized route.
- Missing list-item/context discoverability is recorded as a gap rather than implemented in R0.
- Production changes are limited to semantic `data-*` selectors on existing elements. The pathname-derived `data-page-route-id` proof was removed; the remaining selectors expose server-versus-fallback navigation provenance and the existing forbidden state without changing navigation, authorization, requests, persistence, or page behavior.

## TDD record

### Baseline

The first sandboxed baseline run could not open Wrangler's local log or bind `127.0.0.1` (`EPERM`). The identical local-only test command was rerun in the authorized execution environment:

```sh
rtk npx vitest run test/unit/frontend-app-routes.test.ts test/unit/workspace-shell.test.tsx
```

Result: 2 files passed, 41 tests passed. Vitest emitted the repository's existing Cloudflare AI-binding warning.

### RED 1 — route-owned entry and page identity

After creating the harness and route audit, before changing production selectors:

```sh
rtk npx vitest run test/unit/frontend-workbench-maturity-routes.test.tsx
```

Result: 24/24 failed for the expected reason. Every visible route lacked `[data-route-id]`; each parameterized route also lacked a stable owner/page-route selector. This was a behavioral audit failure, not a syntax or fixture error.

### GREEN 1

After adding semantic selectors to existing sidebar, top-bar, mobile, settings, and page-shell elements, the focused suite passed 24/24.

### RED 2 — existing async state semantics

The next test injected task loading, retryable error, and empty responses. The 5 role/direct-route checks and 24 route checks passed; the 3 state checks failed because the existing shared `PageState` roots had no state identity.

### GREEN 2

After adding `data-page-state={kind}` to the existing `PageState` roots:

```sh
rtk npx vitest run test/unit/frontend-workbench-maturity-routes.test.tsx
```

Result: 1 file passed, 32 tests passed. No product state or rendering branch was added.

### Fix round 1 — exhaustive route-family proof

The earlier pathname-derived page identity and `/api/navigation` 503 fallback were rejected as self-certifying. Round 1 replaced them with:

- current 200-response server-navigation fixtures for contributor, task-enabled contributor, revoked contributor, and admin projections;
- page-owned selectors or response-owned text/IDs for ready proof;
- explicit route-family payloads for static/action, numbered-list, cursor-list, four-column board, reader/detail, and admin-configuration controllers;
- a four-state matrix for every route, with a named tested gap when a state is not supported;
- revocation assertions covering private message ID, message body, target ID, target link, thread scroll, and composer.

The first expanded RED run failed 100 cases on missing server-navigation provenance and exposed the reader test harness's DOMPurify initialization boundary. After the semantic provenance selector and focused fixture corrections, the bounded route command passed 101/101. The reader route test isolates sanitization with an identity sanitizer and therefore does not claim integrated sanitizer/browser acceptance.

The fixture also exposed a genuine `AdminAuditRoute` mismatch: the route destructures `{ generation, page }` from a controller that resolves a raw numbered page. Audit loading is proven, but empty and ready are explicit tested gaps; no controller/business fix was made.

## Route audit ledger

Legend: `entry` means a permitted current server-navigation entry was found and exercised. `ready marker` means a page-owned selector or response-owned value was observed after the route controller resolved; pathname-derived shell identity is not evidence. State notes below are runtime fixture results, not source inventory. None satisfies the complete maturity dimension by itself.

| Capability | Role | Entry/direct result | Existing state surface and Task 2 gap | Classification |
| --- | --- | --- | --- | --- |
| `home` | contributor | entry + ready marker proven | Empty recent panel and ready marker are proven; loading renders ready and recent error collapses to empty, both explicit gaps | partial |
| `submit` | contributor | entry + form ready proven | pending, success/empty, and retry-by-resubmit error are runtime-probed; persistence/idempotency remain gaps | partial |
| `knowledge` | contributor | entry + response marker proven | primary loading/empty/retryable error/ready are runtime-probed; auxiliary failures remain independent or collapsed | partial |
| `search` | contributor | entry + response marker proven | queried loading/empty/retryable error/ready are runtime-probed; degraded and complete result journey remain gaps | partial |
| `agent` | contributor | entry + form ready proven | post-submit loading and retryable error are proven; no explicit empty-answer state | partial |
| `my-submissions` | contributor | entry + response marker proven | loading/empty/retryable error/ready are runtime-probed; resubmission remains incomplete | partial |
| `tasks` | contributor + task bit | entry + response marker + revoked denial proven | loading/empty/retryable error/ready are runtime-probed; mutation recovery remains separate | partial |
| `boards` | contributor + task bit | entry + response marker proven | all four column fixtures probe loading/empty/retryable error/ready; movement/rollback remains incomplete | partial |
| `settings` | contributor | account-menu entry + session marker proven | loading/empty/retryable error are explicit unsupported gaps | partial |
| `admin` | admin | server entry + quick-link marker; contributor denied | hard-coded zero metrics; loading/empty/retryable error are explicit unsupported gaps | partial |
| `admin-submissions` | admin | server entry + response marker proven | loading/empty/error/ready are runtime-probed; initial error has no retry and list-to-detail remains incomplete | partial |
| `admin-duplicates` | admin | server entry + response marker proven | loading/empty/error/ready are runtime-probed; initial error has no retry and decision convergence remains a gap | partial |
| `admin-assets` | admin | server entry + response marker proven | loading/empty/error/ready are runtime-probed; initial error has no retry and full recovery remains incomplete | partial |
| `admin-members` | admin | server entry + response marker proven | loading/empty/error/ready are runtime-probed; initial error has no retry and cache invalidation remains incomplete | partial |
| `admin-roles` | admin | server entry + response marker proven | loading/empty/error/ready are runtime-probed; initial error has no retry | partial |
| `admin-menus` | admin | server entry + response marker proven | loading/empty/error/ready are runtime-probed; initial error has no retry and cross-session invalidation is unproven | partial |
| `admin-spaces` | admin | server entry + response marker proven | loading/empty/error/ready are runtime-probed; initial error has no retry and archive impact remains incomplete | partial |
| `admin-audit` | admin | server entry proven; ready not proven | loading is proven; controller result destructuring prevents empty/ready, and initial error has no retry | partial |
| `admin-analytics` | admin | server entry + response marker proven | loading/empty/error/ready are runtime-probed; initial error has no retry and range/pagination remains incomplete | partial |
| `notifications` | contributor | server entry + response marker proven | loading/empty/retryable error/ready are runtime-probed; revoked targets/top-bar convergence remain gaps | partial |
| `messages` | contributor | server entry + response marker proven | loading/empty/retryable error/ready are runtime-probed; contextual discovery and explicit revoked presentation remain gaps | partial |
| `knowledge-reader` | contributor | owning entry + direct response marker proven; no duplicate entry | loading/error/ready are proven under isolated sanitizer; empty and list-to-reader/integrated-sanitizer journeys remain gaps | partial |
| `message-thread` | contributor | owning entry + direct private-message marker proven; no duplicate entry | all four states are probed; 403 removes every private marker but still renders generic retryable error | partial |
| `admin-submission-detail` | admin | owning entry + direct response title proven; no duplicate entry | loading/error/ready are probed; missing preview is error rather than empty and has no retry | partial |

## Role and authorization observations

- Anonymous `/admin` renders Login and never mounts the workbench shell.
- The ordinary contributor fixture has no administration entries and receives the shell's forbidden state for direct `/admin` navigation.
- The admin fixture sees all ten administration route entries.
- Removing the task permission bit removes the task entry and produces forbidden on direct `/tasks` navigation.
- A context-authorized 403 from both message-thread endpoints removes the private message ID/body, private target ID/link, thread scroll, and composer.
- The frontend route gate is capability/permission based, not an independent `member.role === "admin"` check. The audited ordinary contributor projection is denied, but a malformed contributor session carrying elevated admin bits is not independently proven safe in this task. Backend session/navigation projection remains part of the authority boundary and this is retained as a gap.
- The App journeys now require a successfully parsed current server-navigation fixture and assert `data-navigation-source="server"`. This proves local permitted/denied projection against those fixtures; backend-generated and signed-session projection remain separate gaps.

## Files changed

- `test/helpers/authenticated-app-harness.tsx` — reusable Happy DOM App lifecycle with explicit role, permission-mask, session, fetch, and cleanup ownership.
- `test/helpers/workbench-maturity-route-fixtures.ts` — current server projections plus exhaustive route-family loading/empty/error/ready payloads and private revocation markers.
- `test/unit/frontend-workbench-maturity-routes.test.tsx` — 24-by-4 runtime matrix, owner-entry checks, current server projection, forbidden routes, and complete private-marker revocation assertions.
- `frontend/components/shell/app-shell.tsx` — removes pathname-derived page identity and adds semantic navigation provenance/forbidden selectors only.
- `frontend/components/ui/page-state.tsx` — semantic state-kind selector only.
- `shared/workbench-maturity-capabilities.ts` — Task 2 test evidence and route-specific truthful gaps for all 24 records.
- `.superpowers/sdd/2026-08-31-workbench-product-maturity-r0-audit/task-2-report.md` — this report; `.superpowers/` remains ignored by repository policy.

## Verification

Fresh pre-report checks:

```sh
rtk npm run verify:workbench-maturity
rtk npm run typecheck
rtk git diff --check
```

Results: maturity contract 3/3 passed; TypeScript exited 0; whitespace check exited 0.

Original Task 2 focused gate (superseded by round 1):

```sh
rtk npx vitest run test/unit/frontend-workbench-maturity-routes.test.tsx test/unit/frontend-app-routes.test.ts test/unit/workspace-shell.test.tsx
```

Result: 3 files passed, 73 tests passed.

Full local test gate:

```sh
rtk npm test
```

Result: exit 0; smoke 48/48, i18n 13/13, delivery status 27/27, unit 178 files/1498 tests, worker 28 files/457 tests, and the required UI build passed. The worker suite emitted expected failure-path exception diagnostics; Vitest emitted the existing Cloudflare AI-binding warning and Vite emitted the existing large-chunk warning.

Fresh post-suite checks repeated `rtk npm run typecheck`, `rtk npm run verify:workbench-maturity`, and `rtk git diff --check`; all exited 0.

### Fix round 1 verification

Per the fix-round instruction, no full repository suite was run. The single bounded route-audit command was:

```sh
rtk npx vitest run test/unit/frontend-workbench-maturity-routes.test.tsx
```

Result: 1 file passed, 101 tests passed in 10.10 seconds. Vitest emitted the existing Cloudflare AI-binding warning; these fixtures made no remote AI request.

Fresh contract/type checks after the report and manifest corrections:

```sh
rtk npm run verify:workbench-maturity
rtk npm run typecheck
rtk git diff --check
```

Results: maturity contract 3/3 passed; TypeScript exited 0; whitespace validation exited 0.

## Concerns carried forward

1. All records remain `partial`; Task 2 proves local entry/route evidence, not complete user goals, deployment, or signed-browser acceptance.
2. Current server-navigation fixtures prove local frontend projection, but backend-generated/signed-session projection and signed browser evidence remain unproven.
3. Admin exclusion is not an independent frontend role invariant when a malformed session contains elevated capability bits.
4. Parameterized discoverability is not proven from a populated owning list/context; no duplicate global entries were invented.
5. Message-thread context revocation removes all audited private markers, but the UI conflates forbidden with retryable load failure.
8. `AdminAuditRoute` cannot render fixture-proven empty or ready because it destructures an incompatible controller result; this remains a manifest gap rather than an audit-round behavior fix.
6. Home and administration dashboard routes render placeholder/synthetic ready data and must not be promoted to mature.
7. The Cloudflare AI-binding warning remains present in local Vitest output; no remote AI request was made by these tests.

## Commit

- `963d12e test: audit workbench route maturity`
- Fix round 1 report and tracked audit corrections are committed together; the handoff records the resulting commit ID.

The report is normally ignored by repository policy; fix round 1 force-adds this required audit artifact so the appended evidence is preserved with the audit changes.
