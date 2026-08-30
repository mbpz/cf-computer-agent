# Workbench Collaboration Task 4 Report

## Status

Implemented the task-backed `/boards` route as a ready workspace surface. The board is a projection of the existing member-scoped task API; no board table, repository, or duplicate task authority was added.

## RED / GREEN

- Initial RED: the brief unit command failed because `board-model`, `BoardsPage`, and `BoardsRoute` did not exist; `/boards` still resolved to `coming-soon`; navigation still exposed the old availability/permission contract. The run reported 7 expected Task 4 failures while 1,361 unrelated unit tests passed.
- First GREEN: the focused board model/page/route tests passed 8/8 after the minimal projection was wired, before the route registry was promoted to ready.
- Readiness contract RED: the Worker gate exposed two stale expectations after promotion: Boards was still asserted as coming soon in admin menu output, and a historical menu seed test incorrectly equated all seeded paths with current coming-soon paths.
- Readiness contract GREEN: menu output now asserts Boards ready, and the migration contract preserves historical registered seeds while requiring every currently coming-soon path to remain seeded.
- Self-review RED: a StrictMode regression test reproduced `NUMBERED_REQUEST_CONTROLLER_DISPOSED` because render-owned request controllers were permanently disposed by the development effect cycle.
- Self-review GREEN: each column effect now owns and disposes its own request controller; the StrictMode route test passes.

## Interfaces and behavior

- Reads: `loadTasks({ status }, { page, pageSize })` through one independent request controller per `todo`, `doing`, `blocked`, and `done` column.
- Writes: `setTaskStatus(id, status)` using the existing task transition and idempotency contract.
- Authority and isolation: unchanged task API ownership checks and `workspace.tasks` route permission; Boards adds no storage or server authority.
- Pagination: bounded `20 | 50 | 100` page sizes with independent URL state (`todoPage`, `doingPage`, and corresponding page-size keys). A column request aborts and rejects stale generations without reloading unaffected columns.
- Status actions: native keyboard-operable selects expose only legal non-canceled transitions. Drag-and-drop is intentionally not implemented.
- Optimism: moves update visible source/target columns immediately, roll back exactly on mutation failure, and refresh the affected columns after success.
- States: loading, initial error, retained-data error, empty, retry, pagination, and mutation failure copy are backed by English and Simplified Chinese catalogs.
- Canceled tasks: never queried as a primary column and are defensively filtered from visible board items.

## Files

- Added `frontend/pages/boards/board-model.ts`.
- Added `frontend/pages/boards/boards-page.tsx`.
- Added `test/unit/frontend-boards-page.test.tsx`.
- Added `test/unit/frontend-boards-route.test.tsx`.
- Updated `frontend/app.tsx`, `frontend/lib/i18n.ts`, and `shared/workspace-route-capabilities.ts`.
- Updated route, navigation, menu, and historical migration contract tests.
- No `frontend/lib/boards-data.ts`, D1 migration, board table, task repository, or task API implementation was added.

## Commit

- This report ships in the scoped commit `feat: add task-backed boards`.

## Verification

- `rtk npm run test:unit -- test/unit/frontend-boards-page.test.tsx test/unit/frontend-boards-route.test.tsx test/unit/frontend-app-routes.test.ts test/unit/frontend-tasks-data.test.ts`
- `rtk npm run test:worker -- test/worker/tasks.test.ts test/worker/admin-menus.test.ts`
- `rtk npm run verify:i18n`
- `rtk npm run typecheck`
- `rtk git diff --check`

## Concerns

- Browser acceptance and production deployment were not authorized or performed; evidence is local automated verification and the production UI asset build exercised by the Worker gate.
- Vite continues to report the existing JavaScript chunk-size warning above 500 kB. Task 4 does not add code splitting.
- Worker tests emit expected diagnostics from existing failure-path fixtures (missing workspace revision and invalid pending journal) while exiting successfully.
