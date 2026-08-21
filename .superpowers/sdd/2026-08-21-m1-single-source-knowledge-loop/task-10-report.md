# Task 10 implementation report

## Status

Implemented the M1 trusted-knowledge workspace locally. Contributor and admin sessions now receive capability-driven Library, Search, Agent, My Submissions, and Review Queue journeys; administrators can preview raw and normalized source text, inspect heading/line locations and warnings, select active publication metadata, publish/reject/request revision, and run bounded recovery. Library/search/reader/Agent paths preserve exact Revision and Chunk citation navigation, historical reads, degraded-search visibility, pagination, and server-authoritative authorization.

GitHub login/logout/session cookies, automation authentication, legacy APIs, same-origin CSRF, API security headers, Durable Object naming/migration, and production configuration were not changed. No network, remote resource, deployment, database migration, or production action ran; the build command was Wrangler dry-run only.

## Files and bounded API adjustment

- Reworked `public/app.js`, `public/styles.css`, `public/index.html`, `public/navigation.js`, and the pure `public/workspace-ui.*` contracts for the M1 journeys, responsive reader/review layouts, accessible focus behavior, and route/mutation ownership.
- Extended the SPA fallback only for one-segment `/knowledge/:id` and `/admin/submissions/:id` routes; non-UI API/action-shaped paths still return 404.
- Extended the already admin-authorized review preview DTO with `rawContent`. `sourceVersion.content` remains canonical normalized Markdown. The DTO still removes content hashes and normalized storage paths, and authorization still precedes identifier decoding/resource access.
- Added pure UI/request tests, navigation tests, static asset/deep-link/security tests, and a real Workerd raw-versus-normalized review/publication regression.

## RED evidence

- Initial sandboxed Vitest attempt was blocked before product execution by Wrangler log `EPERM` and Workerd localhost `listen EPERM`. Every recorded product RED/GREEN run was rerun with local-only Workerd/log permission.
- Corrected initial UI/navigation RED: `rtk npx vitest run test/unit/workspace-ui.test.ts test/unit/navigation.test.ts` failed 15 tests with 18 passing. Missing view models, citation links, inert rendering, route states, single-flight mutation ownership, capability navigation, and labels caused the failures.
- Request/deep-link/static RED: the required three-file command failed 7 tests with 50 passing. Exact allowlisted request builders were absent, M1 reader/review deep links returned 404, and the browser did not yet call M1 APIs.
- Responsive/accessibility style RED: the same three-file command failed 1 test with 57 passing because reader, review-dialog, validation, danger-action, mobile, and reduced-motion contracts were absent.
- Authenticated drawer RED: two focused tests failed because viewport-aware closed/inert state was absent. A later five-test RED proved open/close accessible labels were also absent.
- Raw/normalized preview RED: the pure preview test and real Workerd journey each failed 1/1 because the admin preview had no raw submitted content and the client incorrectly had to reuse normalized Markdown.
- Consistent admin navigation label RED: the focused navigation test failed 1/1 while four admin destinations still used the earlier mixed-language labels.

Each RED failed on the named missing behavior rather than an assertion derived from the implementation.

## GREEN and verification evidence

- Pure UI/navigation first GREEN: 2 files, 33/33 tests.
- Browser route/static GREEN after responsive work: 3 files, 58/58 tests.
- Raw-versus-normalized preview GREEN: focused pure UI 1/1 and real Workerd M1 journey 1/1.
- Required final focused UI/API gate: `rtk npx vitest run test/unit/workspace-ui.test.ts test/unit/navigation.test.ts test/worker/assets.test.ts test/worker/m1-api.test.ts` passed 4 files, 71/71 tests.
- `rtk npm run typecheck` passed.
- `rtk npm run check` passed: generated Worker types current; TypeScript passed; smoke 8/8; unit 425/425 across 25 files; Workerd 213/213 across 12 files; Wrangler dry-run build passed.
- `rtk node --check public/app.js`, `rtk node --check public/workspace-ui.js`, and `rtk git diff --check` passed.

The full Workerd gate retains the expected invalid pending-note journal fixture diagnostics and local AI-binding warnings; the command exited zero.

## Security, ownership, and UX decisions

- Browser navigation is derived from server-issued capabilities. `knowledge:read` owns Library/Search/Agent; `knowledge:review` owns Review Queue. Role labels never create authority, and direct contributor admin API access remains server 403.
- Submission, publication, chat, and library-query builders copy only exact allowlisted fields. `Idempotency-Key` exists only in the submission header. Browser requests never accept member IDs, roles, client sources/citations, storage paths, or content hashes.
- Every excerpt, source body, raw input, normalized Markdown, AI answer, title, warning, citation label, and error reaches the DOM through `textContent`/text nodes. No data is assigned to `innerHTML`, executable Markdown/HTML is never rendered, and static tests reject executable HTML sinks.
- Search and Agent results use server-returned authorized hits only. Citation cards link to `/knowledge/:id?revision=:revisionId&chunk=:chunkId`; the reader re-fetches the authorized current or historical Revision and moves focus to the exact source location.
- Library, search results, own submissions, and review queue use bounded cursor pagination with duplicate suppression. Search reports `degraded` independently from document readability.
- Renderer-created `{generation, pathname}` owners bind every new async mutation. Single-flight controllers suppress double submits and late success/error callbacks after navigation. Existing member/Space/Collection mutations were moved onto the same guard; logout retains its independent single-flight generation guard.
- Route headings receive focus after navigation; validation summaries receive focus after form/API failures. Native review dialogs add explicit Tab containment, Escape close, and focus return. Closed mobile navigation remains inert and hidden to accessibility APIs; desktop navigation stays exposed. All actions are native keyboard controls, and reduced-motion styling is present.
- Admin review presents raw submitted input separately from canonical normalized Markdown, plus inert heading/line preview and warnings. Publication selectors contain only active shared Spaces, active Collections, and active Tags; the server remains the final target validator.

## Remaining concerns

- Evidence is local pure-unit/static/Workerd/D1/Durable Object evidence only. No production OAuth, Workers AI provider response, quota, remote asset, deployment, or remote browser evidence was collected.
- The accessibility behavior is covered by pure state contracts and shipped static contracts, not a live assistive-technology/browser session. A later production release gate should add remote keyboard/screen-reader evidence without weakening the current server and renderer ownership boundaries.
