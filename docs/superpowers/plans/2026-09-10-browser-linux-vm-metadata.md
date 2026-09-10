# Browser Linux VM private metadata — implementation plan

> **For agentic workers:** Use superpowers:executing-plans, sequentially on the current branch. No subagents.

**Goal:** Implement a locally testable create/list/detail API for personal and temporary environment metadata, with member isolation and atomic creation receipts.

**Architecture:** Existing authenticated Worker routes derive the owner from the principal. D1 stores only metadata and bounded creation receipts; a transaction creates both together. The browser remains the execution host; these APIs neither start Linux nor report it as running.

**Tech Stack:** Existing TypeScript, Workers, D1, Vitest/Workerd. No new binding, paid service or dependency.

**Spec:** `docs/superpowers/specs/2026-09-09-browser-linux-vm-design.md`, sections 3, 6, 9 and VM-007–010.

## Global constraints and sequencing

- This is an independent G1a subset, not a waiver of G0. The parent plan's runtime-dependent work and formal-page integration remain gated on G0. External download diagnosis does not block local metadata tests.
- Owner is always the authenticated member. Another member's environment/task is indistinguishable from a missing one.
- Types `personal` and `temporary`; no desktop, cloud VM or remote command execution.
- Full numbered pagination uses existing 20/50/100 sizes and bounded offsets; totals are owner-scoped, sorting is `created_at DESC, id DESC`.
- New `workspace.vm` bit 21; `workspace.tasks` does not imply it. No new default role grants or navigation entries before readiness review.
- Stable `operationId` binds owner, operation kind, normalized request digest and server-generated target ID. Same request returns the original result; different content conflicts. Receipt and row commit together.
- Only local code/tests; no migration of deployed databases, deployment, push, secrets or VM UI activation.

## Task 1: create/list/detail vertical slice

**Files:** Create `shared/environments.ts`, `src/environments/repository.ts`, `src/environments/service.ts`, `src/routes/environments.ts`, `migrations/0047_browser_environments.sql`, `test/worker/environments.test.ts`. Modify `src/app.ts`, `src/authorization/permission-bitmap.ts`, `src/authorization/policy.ts`.

**Interfaces:** `EnvironmentMetadata` has `id, memberId, name, type, taskId, version, createdAt, updatedAt`; no live runtime state. `EnvironmentsService.create(memberId, body): Promise<{ environment: EnvironmentMetadata }>`; `list(memberId, {page,pageSize,type?}): Promise<NumberedPage<EnvironmentMetadata>>`; `get(memberId,id): Promise<EnvironmentMetadata>`. POST accepts only `operationId, name, type, taskId?`. GET collection accepts only `page,pageSize,type`. Detail GET accepts no query. `routeEnvironmentsApi(request,url,context,principal,{environments})` follows existing routes.

- [x] Write HTTP/D1 behavior tests before implementation: both types; anonymous/denied/CSRF; forged owner; IDOR; own/missing/foreign task; concurrent same/different-content operation replay; receipt rollback on failed entity write; strict and owner-scoped pagination with tied timestamps.

```ts
const first = await api('/api/environments', sessionA, {
  method: 'POST', body: JSON.stringify({operationId:'create-1', name:'研究', type:'personal'})
});
expect(first.status).toBe(201);
const replay = await api('/api/environments', sessionA, {
  method: 'POST', body: JSON.stringify({operationId:'create-1', name:'研究', type:'personal'})
});
expect(await replay.json()).toEqual(await first.json());
```

- [x] Run `rtk proxy npx vitest run test/worker/environments.test.ts`; confirm missing endpoint fails expected HTTP assertions (not missing import).
- [x] Add metadata and creation-receipt tables; member foreign keys; nullable task foreign key with `ON DELETE SET NULL`. Type/name/version checks. Indexed owner/type pagination. Reserve bit 21 without widening fallback/default grants.
- [x] Implement normalized validation and digest. Creation uses one D1 batch: insert receipt conditionally on an owned task; insert metadata only for this attempt's receipt target; select receipt. On conflict compare request hash. On task rejection write neither. SQL failure rolls back both.

```sql
INSERT INTO environment_create_receipts (...)
SELECT ... WHERE ? IS NULL OR EXISTS (SELECT 1 FROM tasks WHERE member_id = ? AND id = ?)
ON CONFLICT(member_id, operation_id) DO NOTHING;
-- Metadata insertion is conditional on the freshly generated target in that receipt.
```

- [x] Mount guarded API, reuse global session/origin protection and JSON error `retryable`. Reject unknown/duplicate query fields and body fields. Never accept a client owner.
- [x] Rerun new tests and typecheck; correct failures without weakening assertions.

## Task 2: integration regression and acceptance record

**Files:** Modify this checklist and parent `docs/superpowers/plans/2026-09-09-browser-linux-vm.md`.

- [x] Run focused new API tests plus existing tasks/permission/authorization regressions.
- [x] Run `rtk proxy npm run typecheck` and `rtk proxy git diff --check`; separately check new files since they are untracked.
- [x] Record exact passing/failing results, no claim of browser or production acceptance.
- [x] Keep remaining G1a explicit: PATCH/version conflicts; DELETE/tombstone/device cleanup; paginated operation facts/generation; role/menu readiness integration. Existing parent G1b–G5 keep encryption, locks, lifecycle, networking, files/import and shadcn UI.

## Local evidence — 2026-09-10

- RED: initial 33 HTTP/D1 tests failed with the missing endpoint/schema; primary creation assertions observed HTTP 404 instead of 201. No mock endpoint or mock database.
- GREEN: corrected integration signatures for existing pagination/config helpers; original 33 tests passed. Added valid automation-identity rejection and member-disable coverage. Disabled members use the existing `403 MEMBER_DISABLED` contract, not `401`.
- Final focused run: **10 files, 175 tests passed**, including **35 environment tests**, existing tasks, admin roles, session, app, permission bitmap/projection, principal and both pagination suites. Command: `rtk proxy npx vitest run test/worker/environments.test.ts test/worker/tasks.test.ts test/worker/admin-roles.test.ts test/worker/session.test.ts test/worker/app.test.ts test/unit/permission-bitmap.test.ts test/unit/session-permission-projection.test.ts test/unit/principal.test.ts test/unit/pagination.test.ts test/unit/pagination-d1.test.ts --silent=passed-only`.
- During regression, the four existing admin-role tests returned 401 because their sessions were issued on fixed `2026-08-26` while validation used real time. Updated only their session-creation fixture clock in `test/worker/admin-roles.test.ts`; production session lifetime/authentication are unchanged. The same four tests then passed.
- `rtk proxy npm run typecheck`: passed. The test harness emitted its existing AI-binding configuration warning; this batch's metadata tests do not invoke AI. The app's deliberately corrupt journal case emitted the expected runtime error and its assertions passed. No claim of an entirely warning-free run.
- Migration `0038` was applied only in disposable test databases. No default roles, menu entries or production configuration were changed. No Git commit/push or deployment performed.
- Remaining product gaps: all mutation/history/lifecycle/key/network/file/UI acceptance outside this slice, per-member metadata/receipt capacity policy before rollout, and G0 itself. Initial version fields do not yet imply implemented CAS updates. Creation receipts bind only this operation family; later mutation routes must preserve the spec's operation-kind conflict contract.

## Self-review

This plan covers only the independent creation/read subset of VM-007–010; none of those acceptance rows is complete solely from this batch. Runtime assets/licenses, G0 public TLS/package/Git/browser recovery, key management, account lifecycle and formal UI remain open. No deployment acceptance is implied. Execution is inline as already selected; no extra execution-choice prompt or automatic commit.

## Task 3: versioned mutations and metadata history

**Files:** Add `migrations/0048_browser_environment_operations.sql`; extend the shared environment contracts, repository, service, routes and HTTP/D1 tests above. No runtime or page activation.

**Contract:** PATCH accepts only `operationId, version, name?, taskId?` with at least one changed field; type/owner are immutable. DELETE accepts only `operationId, version`. Both return 200 with the original receipt on an identical retry, even after later changes/deletion. A new operation with stale version returns `409 ENVIRONMENT_VERSION_CONFLICT`; missing/foreign/deleted targets return 404. Reusing an operation ID across kinds or targets returns `409 ENVIRONMENT_OPERATION_CONFLICT`. Failed validation/CAS does not consume the operation ID.

**Atomicity:** Migrate existing create receipts to a unified operation ledger preserving stored responses. A fresh per-attempt claim gates the entity mutation, so returning an old receipt cannot write again. Receipt creation, entity mutation and deletion tombstone run in one D1 batch. Successful delete physically removes mutable metadata and leaves `(member, environment, version, deletedAt)` tombstone until account deletion. This does not claim device cleanup. Task deletion detaches the association and increments the environment version, preventing a stale editor from silently overwriting it.

**History:** GET `/:id/operations` exposes only successful metadata facts `{sequence, operationId, kind, environmentId, createdAt}`, ordered descending by immutable event sequence; 20/50/100 strict numbered pagination. No request/response bodies, names, commands, key material or live runtime status. Deleted/foreign history remains unavailable. Local lifecycle event reporting and tombstone synchronization APIs remain a separate slice.

- [x] Add and observe failing tests for rename/task updates, stale and concurrent CAS, cross-kind/target ID reuse, exact retry after later changes, delete retry/tombstone/privacy, rollback, task deletion version changes and isolated strict history pagination.
- [x] Implement additive migration and unified transactional receipt handling; preserve creation behavior and old migration data.
- [x] Implement guarded routes/validation; reject unknown fields and unsafe versions; no type/owner changes.
- [x] Run metadata and existing auth/task/pagination regressions, typecheck and whitespace checks; record evidence.
- [x] Retain open G0, local lifecycle fact reporting, tombstone sync, quotas, encryption, runtime and full UI acceptance.

### Task 3 local evidence — 2026-09-10

- RED: 56 environment cases ran at 12:27; 22 expected failures, 34 passed. Missing PATCH/DELETE produced 405 instead of success/conflict/validation responses; linked-task deletion left version 1 instead of 2.
- GREEN: 56 environment tests passed after the implementation. Typecheck identified an untyped D1 history result; supplied the query result type, then typecheck passed.
- Extended regression at 12:33:58: **10 files, 199 tests passed** (59 environment tests plus 140 existing tests). The command is the same ten-file focused command recorded above. Additional checks preserve an actual `0038` creation receipt across `0039`, compete edit/delete, and reject different concurrent update contents under one operation ID. Rollback tests assert both no new receipt and no tombstone after an injected entity failure.
- `npm run typecheck` passed. Existing AI-binding warnings and the app's deliberate corrupt-journal test exception remain as previously described; no VM test calls AI. No full build or production/browser acceptance is claimed.
- `0039` migrates receipts into one member/operation namespace, assigns stable event sequences, adds minimal deletion tombstones and invalidates stale versions on task detachment. Only disposable local databases were migrated.
- Completed metadata capabilities: create/read/list, versioned name/task edits, versioned idempotent deletion, and private numbered metadata history. Deleted target history is not accessible; historical successful mutation retries return their stored result without resurrecting metadata.
- Still open: POST lifecycle facts with generation/event deduplication; tombstone discovery/device cleanup; quotas; route/menu readiness; key authorization/encryption; runtime/locks/logout; controlled production networking and G0; file/import/UI/full acceptance. History currently describes successful metadata API operations, not a complete local-runtime audit trail or an event for automatic task detachment.
- No commit, push, deployment, default permission grants or new dependencies in Task 3.

## Task 4: reported lifecycle facts and local deletion reconciliation

**Files:** Add migration `0049_browser_environment_lifecycle.sql`, extend environment contracts/service/routes/repository and HTTP tests; add a standalone browser cleanup coordinator and unit tests. Formal page/runtime wiring remains behind G0.

**Event contract:** POST `/:id/operations` accepts only `{eventId, runtimeId, generation, eventIndex, event}`. `eventId` is also the stable operation ID in the existing member-wide namespace (no second independent deduplication key). `runtimeId` identifies a controller incarnation, not a user/device identity or permission. `generation` and `eventIndex` are positive safe integers. Events are `started, restored, paused, resumed, checkpoint_saved, stopped, failed`. Persist only these bounded fields plus server receipt time, not commands, output, errors or secrets. Return `{event:{environmentId,eventId,runtimeId,generation,eventIndex,event,receivedAt}}`, status 200 including identical replays. This is a client-reported fact, not verified state or a remote control API.

**Ordering:** Within `(member, environment, runtimeId)`, accept a higher generation or a higher event index in the same generation, atomically with the shared receipt. Reject stale/duplicate positions under a different event ID with `409 ENVIRONMENT_EVENT_STALE`. Different controller incarnations have separate heads. Missing intermediate events are permitted: a report is not proof of a full lifecycle, and offline reporting may begin with a stop/failure. Retrying an accepted event returns the original receipt even after newer events or deletion, without moving the head. Temporary environments reject `checkpoint_saved`; neither type changes metadata version/status on reports. History exposes bounded lifecycle details with explicit `source: browser_report`; ordinary metadata rows keep their existing shape.

**Deletion discovery:** GET `/api/environments/tombstones` returns current-member `{environmentId,version,deletedAt}` rows, strictly numbered 20/50/100, ascending immutable deletion sequence. Existing tombstones are migrated before new ones; append-only ordering avoids offset shifts during a traversal. No API to remove tombstones during account lifetime. This is discovery, not proof of actual device erasure.

**Cleanup coordinator:** An account/epoch-bound, cancellable sequential traversal invokes an injected local storage adapter only for returned owned environment IDs. Await complete local removal before advancing; missing data is idempotent; stop on deletion failure or account change, retry a later traversal from page 1. Never erase storage merely because environment GET/list failed. The actual encrypted store and logout/runtime lock integration remain separately required.

- [x] Observe missing event/tombstone endpoint failures; test auth/CSRF, body validation, same/different event replay, concurrent positions, generations/incarnations, rollback, temporary save rejection, stale reports, and history privacy.
- [x] Implement additive migration and atomic receipt/head writes; preserve metadata and deletion receipts.
- [x] Test owner-scoped append-stable tombstone pagination and migration preservation.
- [x] Write failing cleanup coordinator tests; implement cancellation/account boundaries, retry and bounded pagination checks without claiming a mounted storage integration.
- [x] Run metadata/auth/tasks/pagination and coordinator regressions; typecheck; update parent evidence. Leave quotas, G0, keys, full runtime/files/UI acceptance open.

### Task 4 local evidence — 2026-09-10

- Endpoint RED at 12:43:50: 29 failures and 59 passes; missing event POST returned 405, tombstones returned 404, and the rollback case also encountered the not-yet-created runtime-head table. Endpoint GREEN at 12:46:38: 88 passed.
- Coordinator initial run at 12:53:08 failed during collection because the implementation module did not exist (not a behavioral assertion RED). Implementation then passed 18 tests; three additional tests cover duplicate later pages, decreasing totals and pre-cancelled sessions. These use an injected local adapter, not OPFS/IndexedDB or actual encrypted files.
- Final focused regression at 12:58:11: **11 files, 250 tests passed** (89 environment HTTP/D1, 21 coordinator, 140 existing related tests). Command: `npx vitest run test/worker/environments.test.ts test/unit/environment-deletion-reconciler.test.ts test/worker/tasks.test.ts test/worker/admin-roles.test.ts test/worker/session.test.ts test/worker/app.test.ts test/unit/permission-bitmap.test.ts test/unit/session-permission-projection.test.ts test/unit/principal.test.ts test/unit/pagination.test.ts test/unit/pagination-d1.test.ts --silent=passed-only`.
- `npm run typecheck` passed. Test output retains the existing AI-binding warning and deliberate corrupt-journal test diagnostics; this is not a warning-free full-suite or production acceptance claim.
- Explicit migration checks preserve all old update/delete receipt columns and sequence IDs, as well as tombstone version/time and deterministic initial ordering. New tombstones append by sequence even if their timestamp is older. Only disposable local databases were migrated.
- Cleanup validates the complete page before any deletion, snapshots origin/member/epoch, passes cancellation and a just-before-write guard to the adapter, and retries from page 1 after failure. `removed` counts acknowledged idempotent removals, including already-absent copies; it does not prove physical byte erasure. A traversal handles at most 10,000 markers, then fails visibly rather than reporting false completion. Capacity policy and a larger-history strategy remain open.
- G0 remains unpassed. Formal runtime wiring, actual encrypted persistence, logout/lock integration, resource quotas, permission/menu activation, full browser/mobile tests and deployment remain outstanding. No commit, push, deployment or live database migration was performed.
