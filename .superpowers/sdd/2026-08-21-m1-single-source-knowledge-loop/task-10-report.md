# Task 10 implementation report

## Status

Implemented the M1 trusted-knowledge workspace locally and completed review rounds 1 and 2. Contributor and admin sessions now receive capability-driven Library, Search, Agent, My Submissions, and Review Queue journeys; administrators can preview raw and normalized source text, inspect server-produced Chunk excerpts and exact line locations, keep the originally requested publication target fixed from its exact preview summary, page through active same-Space Tags in bounded batches, publish/reject/request revision, and run bounded recovery. Library/search/reader/Agent paths preserve exact Revision and Chunk citation navigation, direct historical reads, degraded-search visibility, pagination, single-flight requests, and server-authoritative authorization.

GitHub login/logout/session cookies, automation authentication, legacy APIs, same-origin CSRF, API security headers, Durable Object naming/migration, and production configuration were not changed. No network, remote resource, deployment, database migration, or production action ran; the build command was Wrangler dry-run only.

## Files and bounded API adjustment

- Reworked `public/app.js`, `public/styles.css`, `public/index.html`, `public/navigation.js`, and the pure `public/workspace-ui.*` contracts for the M1 journeys, responsive reader/review layouts, accessible focus behavior, and route/mutation ownership.
- Extended the SPA fallback only for one-segment `/knowledge/:id` and `/admin/submissions/:id` routes; non-UI API/action-shaped paths still return 404.
- Extended the already admin-authorized review preview DTO with `rawContent` and bounded Chunk preview records (`headingPath`, absolute `startLine`/`endLine`, and a 240-code-point `excerpt`). `sourceVersion.content` remains canonical normalized Markdown. The DTO still removes content hashes and normalized storage paths, and authorization still precedes identifier decoding/resource access.
- Added pure UI/request tests, navigation tests, static asset/deep-link/security tests, and a real Workerd raw-versus-normalized review/publication regression.

## RED evidence

- Initial sandboxed Vitest attempt was blocked before product execution by Wrangler log `EPERM` and Workerd localhost `listen EPERM`. Every recorded product RED/GREEN run was rerun with local-only Workerd/log permission.
- Corrected initial UI/navigation RED: `rtk npx vitest run test/unit/workspace-ui.test.ts test/unit/navigation.test.ts` failed 15 tests with 18 passing. Missing view models, citation links, inert rendering, route states, single-flight mutation ownership, capability navigation, and labels caused the failures.
- Request/deep-link/static RED: the required three-file command failed 7 tests with 50 passing. Exact allowlisted request builders were absent, M1 reader/review deep links returned 404, and the browser did not yet call M1 APIs.
- Responsive/accessibility style RED: the same three-file command failed 1 test with 57 passing because reader, review-dialog, validation, danger-action, mobile, and reduced-motion contracts were absent.
- Authenticated drawer RED: two focused tests failed because viewport-aware closed/inert state was absent. A later five-test RED proved open/close accessible labels were also absent.
- Raw/normalized preview RED: the pure preview test and real Workerd journey each failed 1/1 because the admin preview had no raw submitted content and the client incorrectly had to reuse normalized Markdown.
- Consistent admin navigation label RED: the focused navigation test failed 1/1 while four admin destinations still used the earlier mixed-language labels.
- Review round 1 ownership/chunk RED: `rtk npx vitest run test/unit/workspace-ui.test.ts test/unit/publication-service.test.ts` failed 12 tests with 58 passing. Stale operation closures still ran, dialog actions had no invalidation controller, historical requests had no direct-path contract, targets were switchable, the browser parsed headings itself, and the preview service returned no real Chunks.
- The first combined round 1 run failed 1 test with 109 passing and exposed a separate historical navigation defect: the pure reader model used the Revision ID as the Knowledge Item ID for direct historical responses. The corrected model selects `revision.knowledgeItemId` for historical DTOs.
- Review round 2 exact-target/pagination RED: after correcting a test-fixture sort order, `rtk npx vitest run test/unit/workspace-ui.test.ts test/worker/m1-api.test.ts` failed 5 tests with 55 passing. The review still inferred its fixed target from generic first-page lists, had no cursor-preserving Tag controller, and the authorized preview DTO did not expose the exact validated target summary.
- Review round 2 accessibility RED: the focused Load-more contract failed 1/1 because no accessible pending/visible model existed for the explicit bounded pagination control.

Each RED failed on the named missing behavior rather than an assertion derived from the implementation.

## GREEN and verification evidence

- Pure UI/navigation first GREEN: 2 files, 33/33 tests.
- Browser route/static GREEN after responsive work: 3 files, 58/58 tests.
- Raw-versus-normalized preview GREEN: focused pure UI 1/1 and real Workerd M1 journey 1/1.
- Required final focused UI/API gate: `rtk npx vitest run test/unit/workspace-ui.test.ts test/unit/navigation.test.ts test/worker/assets.test.ts test/worker/m1-api.test.ts` passed 4 files, 71/71 tests.
- Review round 1 unit GREEN: ownership, Agent single-flight, historical routing, fixed-target, and exact-chunker preview tests passed 2 files, 70/70 tests.
- Review round 1 Workerd/static GREEN: asset/security and M1 API tests passed 2 files, 34/34 tests. The API case proves an old `shared` Revision and citation remain contributor-readable after the current Revision becomes `admin_only`, while the current detail remains a 404; target-switch attempts to another active Space or Collection return `PUBLICATION_TARGET_INVALID`.
- Review round 1 final focused gate: `rtk npx vitest run test/unit/workspace-ui.test.ts test/unit/navigation.test.ts test/unit/publication-service.test.ts test/worker/assets.test.ts test/worker/m1-api.test.ts` passed 5 files, 110/110 tests.
- Review round 2 first GREEN: exact-target, Tag page 51, stale/single-flight, error-retention, and real D1 regressions passed 3 files, 88/88 tests.
- Review round 2 final focused gate: `rtk npx vitest run test/unit/workspace-ui.test.ts test/unit/navigation.test.ts test/unit/publication-service.test.ts test/worker/assets.test.ts test/worker/m1-api.test.ts test/worker/m1-publication.test.ts` passed 6 files, 135/135 tests.
- `rtk npm run typecheck` passed.
- `rtk npm run check` passed after review round 1: generated Worker types current; TypeScript passed; smoke 8/8; unit 439/439 across 25 files; Workerd 214/214 across 12 files; Wrangler dry-run build passed.
- `rtk npm run check` passed after review round 2: generated Worker types current; TypeScript passed; smoke 8/8; unit 443/443 across 25 files; Workerd 215/215 across 12 files; Wrangler dry-run build passed.
- `rtk node --check public/app.js`, `rtk node --check public/workspace-ui.js`, and `rtk git diff --check` passed.

The full Workerd gate retains the expected invalid pending-note journal fixture diagnostics and local AI-binding warnings; the command exited zero.

## Security, ownership, and UX decisions

- Browser navigation is derived from server-issued capabilities. `knowledge:read` owns Library/Search/Agent; `knowledge:review` owns Review Queue. Role labels never create authority, and direct contributor admin API access remains server 403.
- Submission, publication, chat, and library-query builders copy only exact allowlisted fields. `Idempotency-Key` exists only in the submission header. Browser requests never accept member IDs, roles, client sources/citations, storage paths, or content hashes.
- Every excerpt, source body, raw input, normalized Markdown, AI answer, title, warning, citation label, and error reaches the DOM through `textContent`/text nodes. No data is assigned to `innerHTML`, executable Markdown/HTML is never rendered, and static tests reject executable HTML sinks.
- Search and Agent results use server-returned authorized hits only. Citation cards link to `/knowledge/:id?revision=:revisionId&chunk=:chunkId`; the reader re-fetches the authorized current or historical Revision and moves focus to the exact source location.
- Library, search results, own submissions, and review queue use bounded cursor pagination with duplicate suppression. Search reports `degraded` independently from document readability.
- Renderer-created `{generation, pathname}` owners bind every new async mutation. Operation and mutation controllers now check ownership before invoking their operation closure as well as before callbacks. Agent uses one single-flight mutation controller, disables its question and submit controls while pending, suppresses stale callbacks, and restores controls after success/error only while its renderer still owns the route. Existing member/Space/Collection mutations use the same pre-invocation guard; logout retains its independent single-flight generation guard.
- Route headings receive focus after navigation; validation summaries receive focus after form/API failures. Native review dialogs add explicit Tab containment and Escape close. Every body-appended review/recovery dialog is registered and invalidated on navigation, popstate, or logout; old confirm handlers cannot start a request, and focus returns only while the dialog's renderer still owns the route. Closed mobile navigation remains inert and hidden to accessibility APIs; desktop navigation stays exposed. All actions are native keyboard controls, and reduced-motion styling is present.
- Historical reader URLs call `/api/knowledge/:id/revisions/:revisionId` directly and use the returned `isCurrent`; they do not probe a possibly hidden current detail first. Citation links retain the Knowledge Item, Revision, and Chunk IDs from that authorized historical response.
- Admin review presents raw submitted input separately from canonical normalized Markdown, plus inert server-created Chunk excerpts and exact locations. Both preview and publication call the same `chunkDocument` helper; tests cover long-text splitting, heading-only input, fenced-code `#`, and absolute lines. The client Markdown-heading regex was removed.
- Review shows the originally requested Space/Collection as fixed text and always posts those preview-owned IDs. The already admin-authorized preview DTO obtains one bounded, redacted target summary through the same exact repository lookup used by publication validation, so a valid target outside a generic list's first page remains publishable. The DTO exposes only target ID/name/slug/status fields needed by the fixed display plus availability; it does not expose repository paths, hashes, internal Space kind/read-only state, or unrelated rows.
- Review loads active Tags only from the exact requested Space in batches of at most 50. An accessible explicit Load-more action retains the server cursor, merges and de-duplicates IDs, keeps existing selections stable, permits Tag 51 to be selected, rejects foreign-Space rows, preserves state on cursor errors, and uses renderer ownership plus a single-flight controller to suppress stale or duplicate loads. It never auto-fetches an unbounded Tag set.
- The shipped shell declares `lang="en"`, matching the predominant workspace interface language.

## Remaining concerns

- Evidence is local pure-unit/static/Workerd/D1/Durable Object evidence only. No production OAuth, Workers AI provider response, quota, remote asset, deployment, or remote browser evidence was collected.
- The accessibility behavior is covered by pure state contracts and shipped static contracts, not a live assistive-technology/browser session. A later production release gate should add remote keyboard/screen-reader evidence without weakening the current server and renderer ownership boundaries.
