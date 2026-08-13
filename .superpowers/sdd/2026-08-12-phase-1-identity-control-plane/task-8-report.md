# Task 8 report: role-aware knowledge workspace

## Delivered

- Replaced the single-page token UI with a persistent contributor/admin sidebar shell, responsive drawer, skip link, focus-visible styles, live regions, page loading/error/empty states, and an explicit History API route table.
- Added server-capability-driven navigation. Contributors receive six workspace routes; admins additionally receive five governance routes. Automation receives no browser navigation.
- Bootstraps `/api/session` before rendering any route. Direct admin URLs render a local 403 for non-admin members while every admin API continues to enforce authorization on the server.
- Implemented Home, Submit, Knowledge, Search, Agent, My submissions, admin dashboard, read-only pending queue with a Phase 3 notice, Members, Spaces/Collections, and Audit pages against the Phase 1 APIs.
- Removed browser token prompt/storage/header behavior. Browser requests use same-origin credentials only; dynamic API values are rendered through DOM APIs and `textContent`, never `innerHTML`.

## Tests and checks

- RED then GREEN: `rtk npx vitest run test/unit/navigation.test.ts`
- RED then GREEN: `rtk npx vitest run test/worker/assets.test.ts`
- Final full gate: `rtk npm run check`
  - 15 unit files / 117 tests passed.
  - 7 worker files / 75 tests passed.
  - smoke tests, type checks, generated types check, and Wrangler dry build passed.
- `rtk git diff --check` passed.
- `rtk rg -n "memory-token|设置令牌" public` returned no matches.
- Static public scan found no `localStorage`, `prompt(`, `authorization`, `APP_TOKEN`, or `innerHTML` references.

The worker test runner prints expected Durable Object recovery diagnostics from its intentional corrupt-journal coverage; the worker suite exits successfully.

## Fix round 1

- Added a Worker-side allowlist for all explicit workspace paths. Those paths fetch the root shell asset through the existing asset binding and retain the dynamic CSP, request ID, and other asset security headers. Unknown non-API paths still use normal asset lookup and remain 404.
- Added deep-link integration regressions for contributor routes and an admin route, preserving the unauthenticated admin API 401 check and adding an authenticated contributor 403 check through `createApp` with a member fixture.
- Added a mobile-only accessible drawer: closed navigation is inert and `aria-hidden`, opening moves focus into it, close restores focus to the toggle when needed, Escape and navigation close it, and desktop navigation remains persistently accessible.
- Submission success is now carried through route navigation as a live success notice. Route generations prevent an older async page result or error from replacing a newer route; the generation and drawer state rules have pure unit coverage.

## Fix round 1 verification

- Focused regressions: 13 tests across `navigation`, `workspace-ui`, and `assets` passed.
- Fresh `rtk npm run check` passed: 16 unit files / 120 tests, 7 worker files / 80 tests, smoke tests, generated types, type check, and dry build.

## Fix round 2

- Mutation callbacks now capture both their owning route generation and pathname before awaiting their request. Submission, member-status, Space, and Collection handlers verify ownership before every redirect, status message, refresh, or DOM-affecting error path; stale callbacks are no-ops and cannot mint a new route generation.
- Browser back/forward now closes the mobile drawer before rendering the history route.
- Added a pure regression for route/path mutation ownership.

## Fix round 2 verification

- Focused `navigation`, `workspace-ui`, and `assets` regressions: 14 tests passed.
- Fresh `rtk npm run check` passed: 16 unit files / 121 tests, 7 worker files / 80 tests, smoke tests, generated types, type check, and dry build.

## Fix round 3

- Renderer-created Submit, Members, Spaces, Collections, Search, and Agent handlers now close over an explicit `{ generation, pathname }` owner constructed from their renderer arguments. They no longer derive ownership from global state at event time.
- Route rendering marks the prior outlet inert before awaiting the next page; a successful replacement clears inert. This prevents outgoing controls from receiving pointer or focus interaction while a new page is loading.
- Added an old-render regression proving an owner created by the prior renderer is rejected after `begin()` advances to a newer route.

## Fix round 3 verification

- Focused `navigation`, `workspace-ui`, and `assets` regressions: 14 tests passed.
- Fresh `rtk npm run check` passed: 16 unit files / 121 tests, 7 worker files / 80 tests, smoke tests, generated types, type check, and dry build.
