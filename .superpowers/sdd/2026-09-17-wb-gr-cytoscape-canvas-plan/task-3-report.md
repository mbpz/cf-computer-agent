# Task 3 report: `/graph` route and navigation

## Result

Implemented the authenticated work graph route with a local query/lens shell, bounded graph states, semantic GraphCanvas fallback, and English/Chinese copy. The route defaults to the workspace graph request and keeps query/lens state in the page rather than the URL.

## Files

- `frontend/pages/graph-page.tsx`: `GraphPageState`, `GraphPage`, `GraphRoute`, local lens/query filtering, loading/error/empty/ready/truncated rendering.
- `frontend/app.tsx`: authenticated `graph` page dispatch.
- `shared/workspace-route-capabilities.ts`: ready `{ id: "graph", path: "/graph", pageKind: "graph" }` workspace capability.
- `frontend/lib/i18n.ts`: `NAV_GRAPH` plus `GRAPH_*` keys in `en` and `zh-CN`.
- `test/unit/frontend-graph-page.test.tsx`: state, bilingual, no-undefined, canvas/lens, and route capability coverage.

## Verification

- `rtk npx tsc --noEmit` — passed.
- `rtk npx vitest run test/unit/frontend-graph-page.test.tsx` — passed (6 tests).

The first sandboxed Vitest attempt was blocked by Wrangler log/listener permissions; the same focused command was rerun with the required local test permissions and passed. Wrangler emitted its existing remote AI binding warning; no AI or production operation was invoked.

## Operational boundary

No production deployment, browser acceptance, migration, secret mutation, or `SECRETS_FILE` read/upload was performed.

## Concern

The current task file ownership excludes `frontend/components/shell/app-shell.tsx` and navigation migrations. The canonical route capability and label are registered here, but adding a persistent fallback sidebar item or seeding a database menu row would require a follow-up change in those excluded areas.

## Navigation follow-up (2026-09-18)

Review findings were addressed in the authenticated navigation surfaces:

- Added `/graph` to the AppShell fallback sidebar and reused the existing `ChartLine` icon.
- Extended server navigation merging to restore the canonical graph route when a stale or incomplete menu tree omits it; `routeAccessAllowed` still gates the route through the authenticated session boundary.
- Added `NAV_GRAPH` to the menu label allowlist. No migration was created or executed; the frontend/server fallback keeps this change local and avoids copying user data.
- Added the `open-graph` command palette item with `NAV_GRAPH` and relationship keywords.
- Added regression assertions for fallback sidebar, server-tree merge, command palette, and route/menu boundaries.

Fix verification:

- `rtk npx vitest run test/unit/frontend-graph-page.test.tsx test/unit/frontend-navigation-data.test.ts test/unit/workspace-ui.test.ts test/unit/navigation.test.ts` — passed (84 tests).
- `rtk npx vitest run test/unit/frontend-graph-page.test.tsx test/unit/frontend-navigation-data.test.ts test/unit/frontend-shell.test.tsx test/unit/command-palette.test.ts test/unit/navigation.test.ts` — passed (26 tests).
- `rtk npx tsc --noEmit` — passed.
- `rtk npm run verify:i18n` — passed.
- `rtk git diff --check` — passed.

No remote D1 migration, deployment, secret mutation, or `SECRETS_FILE` read/upload was performed.
