# Unified Pagination, Shell, and Menu Verification Evidence

- Verification date: 2026-08-29 (Asia/Shanghai)
- Branch: `codex/workbench-pagination`
- Verification base HEAD: `b68388677110a85934545b2036e54903ca8b7f1e`
- Comparison base (`main`): `36245a2a85ce0e6f94ec2527fc54e9922da39f05`
- Overall result: **PASS — complete local release gate passed after Task 11 regression repairs**

## Migrations

- `0033_numbered_pagination_indexes.sql`: `77ea66256fa9ce47f8b16ed5e94d78e4656a88cfe30b6882c44670f99e20fc98`
- `0034_workspace_coming_soon_menus.sql`: `5f9ebb61b71ca34cb3299589bec3ca0aa6964fd3d68cd8dd872abaf62349d83f`
- `rtk npm run verify:m1:migrations -- --files`: exit 0; 34 migration files accepted.
- `rtk node --test scripts/formal-pagination-contract.test.mjs scripts/m1-release-contract.test.mjs`: exit 0; 25/25 tests passed.

No remote D1 migration was applied.

## Commands and Results

1. `rtk rg -n "nextCursor|onLoadMore|Load more|加载更多" frontend/pages frontend/lib src/routes src/tasks src/submissions src/assets src/duplicates src/audit src/members src/analytics src/library`
   - Exit 0. Matches are limited to documented internal/out-of-scope cursor consumers (including the knowledge activity widget) and retained translation keys; none represents one of the ten formal numbered-list pages.
2. `rtk npm run check`
   - First sandboxed attempt: exit 1 because loopback binding and Wrangler log writes were denied (`listen EPERM 127.0.0.1`). This was an environment-only failure.
   - First sandboxed-outside run: exit 1. The original Task 11 unit failures were repaired and the unit suite passed 1354/1354; the Worker suite then exposed two stale `phase1.test.ts` cursor assertions for the now-numbered `/api/submissions/mine` route.
   - Final sandboxed-outside run: exit 0. Smoke tests passed 46/46, i18n passed 13/13, static i18n passed, unit tests passed 1354/1354, Worker tests passed 404/404, production UI/build-secret/legacy checks passed, and Wrangler deploy dry-run passed.
3. `rtk npm run typecheck`: exit 0.
4. `rtk npm run test:i18n`: exit 0; 13/13 tests passed.
5. `rtk npm run verify:i18n`: exit 0; 434 keys, 55 placeholders, 6 files.
6. `rtk npm run build`: exit 0. Vite production build, build-secret scan, legacy audit, and Wrangler deploy dry-run passed. The existing large-chunk warning remains non-blocking.
7. `rtk npx vitest run test/unit/frontend-pagination.test.tsx test/unit/frontend-shell.test.tsx test/unit/frontend-app-routes.test.ts test/worker/tasks.test.ts test/worker/analytics.test.ts`: exit 0; 48/48 tests passed.
8. `rtk npx vitest run test/unit/pagination.test.ts test/unit/pagination-d1.test.ts test/worker/members.test.ts test/unit/members-service.test.ts test/unit/frontend-shell.test.tsx test/unit/frontend-responsive.test.tsx test/unit/frontend-a11y.test.tsx test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-app-routes.test.ts test/unit/frontend-navigation-data.test.ts test/worker/admin-menus.test.ts`: exit 0; 140/140 tests passed.
9. `rtk npx vitest run test/unit/frontend-pagination.test.tsx test/unit/frontend-locale-pages.test.tsx test/unit/frontend-submit-pages.test.tsx test/unit/m6-agent-trajectory.test.ts test/unit/agent-tool-runner.test.ts test/unit/frontend-menu-keyboard.test.tsx test/unit/frontend-shell.test.tsx test/unit/frontend-a11y.test.tsx`: exit 0; 56/56 tests passed.
10. `rtk npx vitest run test/worker/phase1.test.ts`: exit 0; 54/54 tests passed.

## Acceptance Results

- Numbered pagination: focused core, D1, frontend, task, and analytics acceptance tests passed.
- Per-member data isolation: focused member repository/service/Worker tests passed.
- Independent scrolling: shell, responsive, accessibility, and keyboard tests passed in the focused run.
- Route availability: app-route, navigation-data, menu, and Worker menu tests passed in the focused run.

The complete repository gate independently passed after these focused checks.

## Resolved Findings

1. `DataPagination` now normalizes missing legacy runtime metadata to valid defaults. Reader pages provide their visible item count, yielding `0 / 0` for an empty legacy page and `1 / 1` for a one-item legacy page without weakening strict API response parsing.
2. The M6 trajectory test seam now implements `searchInternal()` and asserts that every successful search receives the reloaded member ID and role. Production internal authorization scope remains unchanged.
3. The menu keyboard test now installs its Happy DOM globals and imports the large AppShell dependency graph during module setup. The actual interaction test dropped from about 5.2 seconds to 32ms under the default timeout; no timeout increase was retained.
4. The Phase 1 Worker contract now verifies numbered metadata for `/api/submissions/mine`, rejects legacy cursor parameters with `PAGE_INVALID`, and continues to assert per-member data isolation.

## Release Boundary

No push, deployment, remote migration, production smoke test, or signed browser acceptance was performed. This evidence establishes only that the complete local gate and Wrangler dry-run passed; it is not production release or signed browser-acceptance evidence.
