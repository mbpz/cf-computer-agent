# M1 whole-branch final-fix report

## Status and boundary

The eight original whole-branch review findings and three follow-up Important blockers are closed in two focused local fix waves. The implementation preserves the existing M1 architecture and prior commits: source normalization remains server-authoritative, publication remains intent/recovery based, migration `0003` remains forward-only, UI authorization remains server-authoritative, and production evidence remains pending.

No network request, remote D1 read/write/export/migration, Worker upload/deploy, GitHub mutation, browser production action, rollback, or other external mutation ran. Wrangler was used only through local tests, generated-type checking, and `deploy --dry-run`. The original `final-review-package.md` remains the immutable pre-fix review snapshot; this report records the follow-up delta and evidence.

## Findings closed

1. **Normalized source byte boundary.** `parseSource` now validates the normalized Markdown UTF-8 bytes against 128 KiB and hashes the same encoded bytes. Exact raw-boundary expansion for text, Markdown, and code rejects before repository persistence. Publication independently rejects an invalid legacy SourceVersion before creating/reading a publication intent and revalidates recovery input, while accepted exact-boundary values still publish.
2. **Legacy pending migration compatibility.** `0003` begins with a fail-closed guard that aborts before its first schema change when any pre-M1 `review_pending` row exists. A real upgrade test proves atomic abort, row preservation, explicit remediation, successful retry, and zero queued-but-unpreviewable rows. The runbook captures/verifies an exact zero count and documents individual rejected-state remediation without deletion, bulk conversion, or fabricated SourceVersions.
3. **Oversized individual code lines.** Code blocks still split on complete lines when possible. A line that itself exceeds the chunk budget is now split by Unicode code points with bounded overlap, no empty/surrogate fragment, stable order/ordinal-derived IDs, and the same source line range on every fragment.
4. **Selective recovery/Tag indexes.** `0003` adds exact partial indexes `jobs_recoverable_scan(kind, available_at, id)` for recoverable states and `tags_active_page(space_id, created_at DESC, id DESC)` for active Tags. The Tag repository uses an `EXISTS` active-Space predicate so the keyset index supplies order. Real scale-shape `EXPLAIN QUERY PLAN` tests require both named indexes and reject temporary sorts/full completed-job scans.
5. **Automation request-ID evidence.** A passing one-stage `401` or `403` probe now requires `sha256-[0-9a-f]{12}`. Missing, malformed, and reflected request IDs fail both modes; status/network/redirect behavior and credential/request-ID redaction remain fail closed.
6. **Submit/Search options beyond 50.** Space, Collection, and Tag selectors share an explicit bounded 50-row controller with cursor paging, deduplication, single-flight requests, stale route/scope suppression, and accessible pending-aware Load-more buttons. No page is fetched automatically after the initial bounded page. Submit retains the control when the first page has no eligible writable Space but a cursor remains, so page 51 is reachable.
7. **Tag-exclusive evaluation.** Four fixed cases retrieve only through Tag terms. Disabling Tag indexing makes all four miss, drops Recall@5 below `0.85`, produces four per-case failures, and fails the gate. The normal 24-case report has 20 expected retrieval citations, 16 required/returned answer citations, 16 answers, 7 refusals, one denial, and zero per-case failures.
8. **Secret cleanup is release-critical.** Upload-stage success now requires both the protected secret file and dedicated directory to be absent. A removal error or remaining path fails the stage before the trap is cleared; EXIT retains a safe retry. An executable shell contract and mutation prove the protected paths cannot remain while the stage reports success.
9. **Admin Spaces route restored.** `/admin/spaces` now executes one bounded, route-owned paging controller instead of the removed `loadSpaces()` helper. It renders the current Space and per-Space Collection pages, preserves the existing Space/Collection mutation owners, and exposes explicit accessible Load-more actions with deduplication, single-flight requests, and stale-route suppression. The pure route-controller regression executes both paging levels and would fail on a missing controller function.
10. **One 256-chunk contract.** `MAX_REVISION_CHUNKS = 256` is shared by chunking, publication prevalidation, the D1 publication repository, and the permission-scoped reader. Normal publication validates 1..256 deterministic drafts before intent creation or Durable Object commit. Real D1/DO tests publish/read 256 and reject 257 with no intent, content call, revision, review, audit, or job; repository and reader defenses independently reject corrupt 257-row data. Recovery moves a legacy invalid intent to `failed_terminal`, reports one failure, and excludes it from later retry scans.
11. **Semantically empty code rejected.** Raw code containing only whitespace, including the 1,201-space oversized-line case, rejects before source persistence. The chunker drops whitespace-only code fragments and never emits an empty `searchBody`; publication independently rejects a legacy semantically empty code SourceVersion before intent/content. Pending legacy recovery terminalizes without content, revision, review, audit, or job creation.

## TDD evidence

Each finding had a behavior-level RED before its implementation:

- normalized-size focused RED: 5 failures with 64 existing passes; expansion cases were accepted and publication created an intent;
- migration guard RED: 1 failure with 4 existing migration passes; `0003` accepted a legacy pending row;
- oversized-code-line RED: 1 failure with 12 existing chunker passes; the line remained over budget;
- selective-index RED: structural index assertions failed and the real Job plan reported `SCAN jobs` plus `USE TEMP B-TREE`;
- automation-ID RED: malformed request IDs still emitted a pass result;
- option-pagination RED: 5 failures with 48 existing UI passes because the bounded controller/accessibility model did not exist;
- Tag-exclusive RED: only three cases were Tag-labelled and removing Tag indexing did not fail the metric/per-case gate;
- cleanup RED: the executable contract observed exit status zero while the protected file and directory remained.
- follow-up route RED: the executable pure route test failed because `createAdminSpacesRouteController` did not exist, matching the production `loadSpaces is not defined` path;
- follow-up chunk/content RED: unit tests failed because the shared limit module was absent, whitespace code resolved successfully, 257/empty publications reached intent and content, and recovery remained `pending_content`;
- follow-up D1/DO RED: five real integration cases failed because 257 chunks published, whitespace reached finalization, invalid recovery invoked content, and the repository accepted 257 drafts.

Focused GREEN evidence:

- final focused unit regressions: 4 files / 131 tests;
- real publication/migration regressions: 2 files / 32 tests;
- permission-scoped reader boundary: 1 file / 22 tests;
- final UI/static paging regression: 2 files / 76 tests;
- automation, migration, runbook, cleanup, and mutation contracts: 28 / 28 tests;
- migration file verifier: 3 files, pass;
- document verifier: 14 exact evidence blocks and `76 = 53 + 23` atom truth plus one unchecked gate, pass.

## Migration and documentation reconciliation

Reviewed migration hashes for this candidate:

- `0001_phase1_control_plane.sql`: `3218f4f3d7a285eb3ee9a4f3a07efa6136c350cc3956564759dbed18f180a929`;
- `0002_github_auth.sql`: `b7dd6aac5cfa4f38aac8b242a3d06d787ec202ec64d09ae4ae3d8ec68d384fc1`;
- `0003_m1_knowledge_loop.sql`: `cfbccb43485043ad2d125f0e6b8238b1e311c18abe12ddeb6bcc8b79e4bb74a3`.

The plan, checklist, release runbook, evidence template, verifier pins, and Task 11 report now agree on normalized-byte acceptance, long-line chunking, the 256-chunk and terminal-intent schema, legacy pending preflight, selective indexes, 14 evidence commands, evaluator denominators, request-ID format, bounded option paging, and cleanup failure semantics. Checklist totals did not change: 53 of 76 P0/M1 atoms are checked, 23 atoms remain unchecked, and `GATE-M1` remains separately unchecked.

## Final local verification

- `rtk npm run test:m1`: operational contracts 28 / 28; Vitest 12 files / 290 tests, passed.
- `rtk npm run typecheck`: passed.
- `rtk npm run check`: generated types current; TypeScript passed; smoke/operational contracts 36 / 36; unit 471 / 471 across 26 files; Workerd 224 / 224 across 12 files; Wrangler `deploy --dry-run` passed with the unchanged `KNOWLEDGE`, `DB`, `AI`, and `ASSETS` binding set.
- `rtk npm audit --omit=dev --offline`: `found 0 vulnerabilities`.
- JS syntax checks for the browser and operational scripts: passed.
- `rtk npm run verify:m1:migrations -- --files`: `[pass] migration-files count=3`.
- `rtk npm run verify:m1:docs`: `[pass] m1-runbook evidence_blocks=14`; checklist/report truth passed.
- `rtk git diff --check`: passed.
- secret-pattern scan for common GitHub/OpenAI/AWS/private-key forms: no matches.

Expected local Workerd diagnostics remain unchanged: the deliberate invalid pending-note journal fixture logs its failure and the local AI binding warns about remote capability, but no Workers AI/provider call occurs and the gate exits zero.

The correct product/release statement remains: **M1 local acceptance pending; remote verification pending.**
