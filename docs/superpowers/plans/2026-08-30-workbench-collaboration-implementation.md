# Workbench Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver localized pagination, a coherent account/navigation shell, and mature task-backed boards, notifications, and contextual discussions with strict per-user authorization and retry-safe D1 writes.

**Architecture:** Keep tasks as the operational source of truth and project them into boards. Add D1-backed recipient-owned notifications and task/knowledge-bound discussion threads behind member-scoped services and routes, then expose all four collaboration surfaces through the canonical route registry and responsive shadcn-style shell. Required functionality uses only Workers, D1, and static assets.

**Tech Stack:** TypeScript, React, shadcn-style local UI primitives, Cloudflare Workers, D1, Vitest, Node contract tests, Wrangler dry-run

**Spec:** `docs/superpowers/specs/2026-08-30-workbench-collaboration-design.md`

## Global Constraints

- Every persisted query and mutation must derive authorization from the authenticated member; an object ID alone never grants access.
- Every list endpoint uses bounded server-side pagination and deterministic tie-break ordering.
- Retriable writes use a bounded client idempotency key plus a D1 uniqueness constraint or equivalent absolute-value semantics.
- Boards reuse tasks and never create a second task authority.
- Discussions belong to a task or knowledge item; general direct messages are out of scope.
- Required runtime services are Workers, D1, and static assets. No paid Cloudflare service or long-running process is required.
- D1 migrations are append-only. Do not rewrite migrations `0001`–`0034`.
- All visible and accessible copy has English and Simplified Chinese catalog parity.
- Preserve current seven-day session semantics and existing task status values: `todo`, `doing`, `blocked`, `done`, `canceled`.
- Do not push, deploy, apply remote migrations, read secrets, call production, or claim browser acceptance without separate authorization.

---

### Task 1: Localize the Shared Pagination Surface

**Files:**
- Modify: `frontend/lib/i18n.ts`
- Modify: `frontend/components/data-pagination.tsx`
- Modify: `frontend/components/ui/pagination.tsx`
- Modify: every `frontend/pages/**/*.tsx` caller of `DataPagination`
- Test: `test/unit/frontend-pagination.test.tsx`
- Test: `test/unit/frontend-i18n.test.ts`
- Test: `scripts/i18n-contract.test.mjs`
- Test: `scripts/formal-pagination-contract.test.mjs`

**Interfaces:**
- Consumes: `LocaleRuntime`, `frontendText`, `FrontendNumberedPage`
- Produces: locale-backed `DataPagination` labels and numbered-page accessible names with no English defaults rendered by product pages

- [ ] **Step 1: Write failing localization tests**

Add English and Chinese render cases asserting localized total, visible range, rows-per-page, previous, next, navigation label, and numbered-page labels. Add a Chinese empty-state assertion equivalent to `总计 0 · 当前显示 0–0` and reject `Total`, `Visible`, and `Rows per page` in the Chinese render.

- [ ] **Step 2: Verify RED**

Run:

```bash
rtk npm run test:unit -- test/unit/frontend-pagination.test.tsx test/unit/frontend-i18n.test.ts
rtk node --test scripts/i18n-contract.test.mjs scripts/formal-pagination-contract.test.mjs
```

Expected: FAIL because pagination defaults and page-number aria labels are hard-coded English.

- [ ] **Step 3: Add exact catalog keys and shared label mapping**

Add keys for pagination navigation, total, visible, rows per page, previous, next, page-number label, and mobile page summary. Make `DataPagination` require a locale/runtime or an explicit complete labels object; do not retain product-visible English defaults.

- [ ] **Step 4: Migrate every caller**

Pass the page locale through Knowledge, Search, My Submissions, Tasks, moderation queues, assets, members, audit, and analytics. Preserve URL/history and page-size reset semantics.

- [ ] **Step 5: Verify GREEN and static coverage**

```bash
rtk npm run test:unit -- test/unit/frontend-pagination.test.tsx test/unit/frontend-i18n.test.ts test/unit/frontend-reader-pagination-routes.test.tsx test/unit/frontend-admin-pagination-routes.test.tsx test/unit/frontend-moderation-pagination-routes.test.tsx test/unit/frontend-tasks-route.test.tsx
rtk npm run test:i18n
rtk npm run verify:i18n
rtk node --test scripts/formal-pagination-contract.test.mjs
rtk git diff --check
```

- [ ] **Step 6: Commit**

```bash
rtk git add frontend test/unit scripts
rtk git commit -m "feat: localize shared pagination"
```

---

### Task 2: Move Account Actions into the Navigation Footer

**Files:**
- Modify: `frontend/components/shell/app-shell.tsx`
- Modify: `frontend/lib/i18n.ts`
- Modify: `frontend/lib/navigation-data.ts`
- Modify: `shared/workspace-route-capabilities.ts`
- Modify: `frontend/app-routes.ts`
- Modify: `src/authorization/menu-tree.ts`
- Modify: `migrations/0034_workspace_coming_soon_menus.sql` only through a new migration, never directly
- Create: `migrations/0035_workbench_collaboration_menus.sql`
- Test: `test/unit/frontend-app-shell.test.tsx` if present, otherwise the existing shell contract file
- Test: `test/unit/frontend-navigation-data.test.ts`
- Test: `test/unit/navigation.test.ts`
- Test: `test/worker/admin-menus.test.ts`
- Test: `scripts/frontend-app-contract.test.mjs`

**Interfaces:**
- Consumes: canonical `WORKSPACE_ROUTE_CAPABILITIES`, optional server navigation tree, session/logout/theme/locale runtime
- Produces: `mergeRequiredWorkspaceNavigation(serverTree, session)` and a shared desktop/mobile account action model

- [ ] **Step 1: Write failing shell and navigation contracts**

Assert the top-right region contains language selection but no account/settings/logout controls; desktop sidebar footer and mobile Sheet contain identity, role, settings, theme, logout pending/error states. Assert no `SHELL_FREE_TIER_LABEL` key or rendered copy remains. Assert required entries `tasks`, `boards`, `notifications`, and `messages` survive a stale server tree while settings is absent from primary navigation.

- [ ] **Step 2: Verify RED**

```bash
rtk npm run test:unit -- test/unit/frontend-navigation-data.test.ts test/unit/navigation.test.ts
rtk node --test scripts/frontend-app-contract.test.mjs
```

- [ ] **Step 3: Implement deterministic navigation merge**

Merge required collaboration entries from the canonical registry after parsing server navigation. Preserve capability filtering and admin configuration for optional/admin items; never trust a stale server tree to remove required collaboration routes.

- [ ] **Step 4: Implement responsive account footer**

Extract a focused account-controls component if `app-shell.tsx` would otherwise duplicate desktop/mobile logic. Keep the nav list independently scrollable, footer fixed, and content independently scrollable. Remove the free-tier copy/key.

- [ ] **Step 5: Add migration 0035 for menu readiness and ordering**

Upsert deterministic first-level positions for Tasks, Boards, Notifications, and Messages without deleting user/admin menu records. Preserve idempotent forward migration behavior and update the migration verifier allowlist/hash contract.

- [ ] **Step 6: Verify GREEN**

```bash
rtk npm run test:unit -- test/unit/frontend-navigation-data.test.ts test/unit/navigation.test.ts
rtk npm run test:worker -- test/worker/admin-menus.test.ts test/worker/migrations.test.ts
rtk node --test scripts/frontend-app-contract.test.mjs scripts/i18n-contract.test.mjs
rtk git diff --check
```

- [ ] **Step 7: Commit**

```bash
rtk git add frontend shared src migrations test scripts
rtk git commit -m "feat: consolidate workbench navigation"
```

---

### Task 3: Audit and Harden the Existing Task Vertical

**Files:**
- Modify only if a failing maturity test proves a gap: `src/tasks/types.ts`, `src/tasks/repository.ts`, `src/tasks/service.ts`, `src/routes/tasks.ts`
- Modify only if needed: `frontend/lib/tasks-data.ts`, `frontend/pages/tasks/*`, `frontend/app.tsx`
- Test: `test/unit/tasks-service.test.ts`
- Test: `test/unit/frontend-tasks-data.test.ts`
- Test: `test/unit/frontend-tasks-page.test.tsx`
- Test: `test/unit/frontend-tasks-route.test.tsx`
- Test: `test/worker/tasks.test.ts`

**Interfaces:**
- Consumes: member principal, `TasksService`, numbered-page request, absolute status/progress mutations
- Produces: a documented task contract safe for board projection and collaboration events

- [ ] **Step 1: Add a task maturity matrix to the tests/report**

Prove member isolation, complete numbered pagination, deterministic ordering, create replay, status replay, invalid transitions, stale response protection, bounded filters, tags, knowledge links, deletion replay behavior, loading/error/empty UI, and route visibility.

- [ ] **Step 2: Run focused task suites and record actual gaps**

```bash
rtk npm run test:unit -- test/unit/tasks-service.test.ts test/unit/frontend-tasks-data.test.ts test/unit/frontend-tasks-page.test.tsx test/unit/frontend-tasks-route.test.tsx
rtk npm run test:worker -- test/worker/tasks.test.ts
```

- [ ] **Step 3: For each real gap, perform one RED/GREEN cycle**

Do not refactor passing task behavior. Preserve member-scoped repository predicates and absolute-value idempotency.

- [ ] **Step 4: Expose a reusable board query/status interface**

Prefer existing `TasksService.list` and `setStatus`. Add an interface only if the board needs a tested multi-column query abstraction; do not duplicate repository logic.

- [ ] **Step 5: Verify and commit**

```bash
rtk npm run test:unit -- test/unit/tasks-service.test.ts test/unit/frontend-tasks-data.test.ts test/unit/frontend-tasks-page.test.tsx test/unit/frontend-tasks-route.test.tsx
rtk npm run test:worker -- test/worker/tasks.test.ts
rtk git diff --check
rtk git add src/tasks src/routes/tasks.ts frontend/lib/tasks-data.ts frontend/pages/tasks frontend/app.tsx test
rtk git commit -m "test: harden task collaboration contract"
```

---

### Task 4: Deliver the Task-Backed Board

**Files:**
- Modify: `shared/workspace-route-capabilities.ts`
- Modify: `frontend/app-routes.ts`
- Modify: `frontend/app.tsx`
- Create: `frontend/pages/boards/boards-page.tsx`
- Create: `frontend/pages/boards/board-model.ts`
- Create: `frontend/lib/boards-data.ts` only if a thin task-data adapter materially clarifies the interface
- Modify: `frontend/lib/i18n.ts`
- Test: `test/unit/frontend-boards-page.test.tsx`
- Test: `test/unit/frontend-boards-route.test.tsx`
- Test: `test/unit/frontend-app-routes.test.ts`
- Test: `test/worker/tasks.test.ts`

**Interfaces:**
- Consumes: `loadTasks(filters, pagination)`, `setTaskStatus(id, status)`, existing task DTO/status transition contract
- Produces: ready `/boards` route with four bounded columns: `todo`, `doing`, `blocked`, `done`

- [ ] **Step 1: Write failing board model and page tests**

Cover four canonical columns, exclusion/filtering of canceled tasks, independent column pagination, localized empty/error/loading states, keyboard status actions, optimistic rollback, and stale-response rejection.

- [ ] **Step 2: Verify RED**

```bash
rtk npm run test:unit -- test/unit/frontend-boards-page.test.tsx test/unit/frontend-boards-route.test.tsx test/unit/frontend-app-routes.test.ts
```

- [ ] **Step 3: Implement the minimal board projection**

Fetch each visible column with `status` plus bounded page/pageSize. Use buttons/select actions as the accessible baseline. Optional drag-and-drop must call the same status action and cannot be the only control.

- [ ] **Step 4: Promote `/boards` to ready only after the page is wired**

Update route registry, app route switch, menu availability, localization, and asset/build route contract in one commit.

- [ ] **Step 5: Verify GREEN and task isolation regression**

```bash
rtk npm run test:unit -- test/unit/frontend-boards-page.test.tsx test/unit/frontend-boards-route.test.tsx test/unit/frontend-app-routes.test.ts test/unit/frontend-tasks-data.test.ts
rtk npm run test:worker -- test/worker/tasks.test.ts test/worker/admin-menus.test.ts
rtk npm run verify:i18n
rtk git diff --check
```

- [ ] **Step 6: Commit**

```bash
rtk git add shared frontend test
rtk git commit -m "feat: add task-backed boards"
```

---

### Task 5: Add Notification Storage and Domain Services

**Files:**
- Create: `migrations/0036_workbench_notifications.sql`
- Create: `src/notifications/types.ts`
- Create: `src/notifications/repository.ts`
- Create: `src/notifications/service.ts`
- Modify: `src/config.ts`
- Modify: `src/tasks/service.ts`
- Test: `test/unit/notifications-service.test.ts`
- Test: `test/worker/notifications.test.ts`
- Test: `test/worker/migrations.test.ts`
- Modify: `scripts/verify-m1-migrations.mjs`

**Interfaces:**
- Produces: `NotificationsService.list(memberId, filters, page)`, `summary(memberId)`, `markRead(memberId, id)`, `markManyRead(memberId, boundedFilter)`, and `emit(event)`
- Consumes later: notification HTTP route and frontend inbox

- [ ] **Step 1: Write failing migration/repository tests**

Assert recipient indexes, deterministic `(created_at DESC, id DESC)` pagination, unique `(recipient_member_id, deduplication_key)`, bounded payload/body fields, and no cross-member reads/updates.

- [ ] **Step 2: Verify RED**

```bash
rtk npm run test:worker -- test/worker/migrations.test.ts test/worker/notifications.test.ts
```

- [ ] **Step 3: Implement the migration and repository**

Use D1 prepared statements, member predicates on every query, `INSERT OR IGNORE` for event replay, and exact query-plan tests for list/unread paths.

- [ ] **Step 4: Write failing service behavior tests**

Cover event normalization, unauthorized target suppression, duplicate event replay, unread count, one-read replay, bounded bulk read, and lazy due-event materialization.

- [ ] **Step 5: Implement the service and task event integration**

Inject a narrow notification sink into `TasksService`; emit only after a real state transition. Replaying the same absolute status must not create another event.

- [ ] **Step 6: Verify GREEN**

```bash
rtk npm run test:unit -- test/unit/notifications-service.test.ts test/unit/tasks-service.test.ts
rtk npm run test:worker -- test/worker/notifications.test.ts test/worker/tasks.test.ts test/worker/migrations.test.ts
rtk git diff --check
```

- [ ] **Step 7: Commit**

```bash
rtk git add migrations src/notifications src/tasks src/config.ts test scripts
rtk git commit -m "feat: add idempotent notifications"
```

---

### Task 6: Deliver the Notification API and Inbox

**Files:**
- Create: `src/routes/notifications.ts`
- Modify: `src/app.ts`
- Create: `frontend/lib/notifications-data.ts`
- Create: `frontend/pages/notifications/notifications-page.tsx`
- Create: `frontend/pages/notifications/notification-model.ts`
- Modify: `frontend/app.tsx`
- Modify: `frontend/app-routes.ts`
- Modify: `shared/workspace-route-capabilities.ts`
- Modify: `frontend/lib/i18n.ts`
- Test: `test/worker/notifications.test.ts`
- Test: `test/unit/frontend-notifications-data.test.ts`
- Test: `test/unit/frontend-notifications-page.test.tsx`
- Test: `test/unit/frontend-notifications-route.test.tsx`

**Interfaces:**
- HTTP: `GET /api/notifications`, `GET /api/notifications/summary`, `POST /api/notifications/:id/read`, `POST /api/notifications/read`
- UI: ready `/notifications` route with read/type filters, complete pagination, unread semantics, mark-one and bounded mark-visible actions

- [ ] **Step 1: Write failing HTTP contract tests**

Cover strict query/body keys, member-only access, malformed pagination/filter rejection, cross-user 404 behavior, replay-safe reads, bounded bulk operation, and canonical envelopes.

- [ ] **Step 2: Implement and verify the route**

```bash
rtk npm run test:worker -- test/worker/notifications.test.ts
```

- [ ] **Step 3: Write failing frontend parser/page/route tests**

Cover malformed row rejection, localized unread/read labels, deep-link safety, loading/error/empty states, URL/history restoration, page reset after filters, and stale request cancellation.

- [ ] **Step 4: Implement the inbox and promote the route to ready**

Use shared pagination and existing API error normalization. Do not compute totals from visible rows.

- [ ] **Step 5: Verify GREEN**

```bash
rtk npm run test:unit -- test/unit/frontend-notifications-data.test.ts test/unit/frontend-notifications-page.test.tsx test/unit/frontend-notifications-route.test.tsx test/unit/frontend-app-routes.test.ts
rtk npm run test:worker -- test/worker/notifications.test.ts test/worker/app.test.ts
rtk npm run verify:i18n
rtk git diff --check
```

- [ ] **Step 6: Commit**

```bash
rtk git add src/routes/notifications.ts src/app.ts frontend shared test
rtk git commit -m "feat: deliver notification inbox"
```

---

### Task 7: Add Contextual Discussion Storage and Authorization

**Files:**
- Create: `migrations/0037_workbench_discussions.sql`
- Create: `src/discussions/types.ts`
- Create: `src/discussions/repository.ts`
- Create: `src/discussions/authorization.ts`
- Create: `src/discussions/service.ts`
- Modify: `src/config.ts`
- Test: `test/unit/discussions-service.test.ts`
- Test: `test/worker/discussions.test.ts`
- Test: `test/worker/migrations.test.ts`
- Modify: `scripts/verify-m1-migrations.mjs`

**Interfaces:**
- Produces: `DiscussionsService.listThreads`, `getThread`, `listMessages`, `sendMessage`, and target authorization for `task | knowledge`
- Consumes: member-scoped task lookup, existing knowledge visibility policy/repository, notification event sink

- [ ] **Step 1: Write failing schema and query-plan tests**

Assert one thread per context, unique thread sequence, unique author/client key, participant indexes, bounded body/client-key sizes, stable ordering, and no unindexed member/thread scans.

- [ ] **Step 2: Verify RED**

```bash
rtk npm run test:worker -- test/worker/migrations.test.ts test/worker/discussions.test.ts
```

- [ ] **Step 3: Implement migration and repository**

Allocate message sequence transactionally using D1 batch/guarded update. A retry with the same author/client key returns the existing message and cannot advance sequence twice.

- [ ] **Step 4: Write failing authorization/service tests**

Cover owned task context, visible knowledge context, unauthorized/missing target nondisclosure, authorization recheck after visibility loss, thread-list pagination, message pagination under concurrent inserts, reply validation, eligible mentions, and duplicate send replay.

- [ ] **Step 5: Implement service and notification integration**

Separate target authorization from repository persistence. Emit mention/reply notifications with recipient/event deduplication keys only after the message exists.

- [ ] **Step 6: Verify GREEN**

```bash
rtk npm run test:unit -- test/unit/discussions-service.test.ts test/unit/notifications-service.test.ts
rtk npm run test:worker -- test/worker/discussions.test.ts test/worker/notifications.test.ts test/worker/migrations.test.ts
rtk git diff --check
```

- [ ] **Step 7: Commit**

```bash
rtk git add migrations src/discussions src/config.ts test scripts
rtk git commit -m "feat: add contextual discussions"
```

---

### Task 8: Deliver the Discussion API and Messages UI

**Files:**
- Create: `src/routes/discussions.ts`
- Modify: `src/app.ts`
- Create: `frontend/lib/discussions-data.ts`
- Create: `frontend/pages/messages/messages-page.tsx`
- Create: `frontend/pages/messages/thread-page.tsx`
- Create: `frontend/pages/messages/discussion-model.ts`
- Modify: `frontend/app.tsx`
- Modify: `frontend/app-routes.ts`
- Modify: `frontend/lib/workspace-location.ts`
- Modify: `shared/workspace-route-capabilities.ts`
- Modify: `frontend/lib/i18n.ts`
- Test: `test/worker/discussions.test.ts`
- Test: `test/unit/frontend-discussions-data.test.ts`
- Test: `test/unit/frontend-messages-page.test.tsx`
- Test: `test/unit/frontend-discussion-route.test.tsx`

**Interfaces:**
- HTTP: context thread create/get, paginated thread list, paginated message list, idempotent message send
- UI: ready `/messages` and `/messages/:threadId`, contextual deep links from task/knowledge surfaces

- [ ] **Step 1: Write failing HTTP tests**

Cover strict context/body parsing, same-origin member access, task and knowledge authorization, nondisclosing 404, stable pagination, reply/mention validation, and idempotent replay response.

- [ ] **Step 2: Implement and verify the API route**

```bash
rtk npm run test:worker -- test/worker/discussions.test.ts
```

- [ ] **Step 3: Write failing frontend parser and journey tests**

Cover thread list and history pagination, malformed DTO rejection, composer duplicate-submit prevention, pending/error recovery, reply context, mention display, empty/loading/error states, deep links, history restoration, and stale response cancellation.

- [ ] **Step 4: Implement the contextual messages UI**

Keep the main content compact and independently scrollable. The composer remains keyboard accessible and does not require WebSockets; refresh/send responses reconcile deterministically.

- [ ] **Step 5: Promote `/messages` to ready and add context entry actions**

Add task and knowledge actions that open/create the authorized contextual thread. Do not add a free-form recipient picker.

- [ ] **Step 6: Verify GREEN**

```bash
rtk npm run test:unit -- test/unit/frontend-discussions-data.test.ts test/unit/frontend-messages-page.test.tsx test/unit/frontend-discussion-route.test.tsx test/unit/frontend-app-routes.test.ts
rtk npm run test:worker -- test/worker/discussions.test.ts test/worker/notifications.test.ts test/worker/app.test.ts
rtk npm run verify:i18n
rtk git diff --check
```

- [ ] **Step 7: Commit**

```bash
rtk git add src/routes/discussions.ts src/app.ts frontend shared test
rtk git commit -m "feat: deliver contextual discussions"
```

---

### Task 9: Reconcile Documentation and Run Final Acceptance

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/product/delivery-status-ledger.md`
- Modify: `docs/product/ai-knowledge-base-checklist.md`
- Modify: `docs/product/shadcn-ui-frontend-checklist.md`
- Create: `docs/operations/evidence/2026-08-30-workbench-collaboration.md`
- Modify: `scripts/delivery-status-contract.test.mjs` only for new structured route/domain assertions

**Interfaces:**
- Consumes: exact commits and test evidence from Tasks 1–8
- Produces: synchronized current status without claiming push, release, migration, or browser acceptance

- [ ] **Step 1: Add failing delivery-contract assertions**

Require route readiness, ledger atoms, checklist ownership, migration references, per-user isolation, idempotency, and pagination evidence for Tasks, Boards, Notifications, and Messages.

- [ ] **Step 2: Update canonical documentation from actual evidence**

Mark implementation/verification only where the corresponding focused and full gates pass. Keep release/acceptance pending unless separately authorized evidence exists.

- [ ] **Step 3: Run focused final gates**

```bash
rtk npm run verify:delivery-status
rtk npm run verify:i18n
rtk npm run test:unit -- test/unit/frontend-pagination.test.tsx test/unit/frontend-boards-page.test.tsx test/unit/frontend-notifications-page.test.tsx test/unit/frontend-messages-page.test.tsx
rtk npm run test:worker -- test/worker/tasks.test.ts test/worker/notifications.test.ts test/worker/discussions.test.ts test/worker/migrations.test.ts
```

- [ ] **Step 4: Run the complete gate on the exact final tree**

```bash
rtk npm run check
rtk git diff --check
rtk git status --short
```

Expected: all tests and build/dry-run pass. Existing intentional error-path logs and Cloudflare AI/chunk-size warnings must be documented separately from failures.

- [ ] **Step 5: Record boundaries and commit**

The evidence document must explicitly state whether push, deploy, remote migrations, production requests, secrets, and signed browser acceptance were performed.

```bash
rtk git add README.md ROADMAP.md docs scripts/delivery-status-contract.test.mjs
rtk git commit -m "docs: reconcile workbench collaboration delivery"
```

---

## Final review gates

- Every task receives a spec-compliance review and a code-quality review before the next task starts.
- Migration tasks receive an additional isolation/idempotency/query-plan review.
- After Task 9, review the whole branch against the spec, then rerun `npm run check` if any tracked file changes.
- Integration into `main`, push/PR, deployment, remote migration, and browser acceptance are separate user choices after the branch is green.
