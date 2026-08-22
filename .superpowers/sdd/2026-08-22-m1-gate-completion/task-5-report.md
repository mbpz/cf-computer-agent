# Task 5 report: stable search ranking, explanations, highlights, and Tags

## Status

Implemented `IDX-004`, `SRCH-002`, `SRCH-003`, `SRCH-004`, and `SRCH-007` locally. Checklist boxes remain unchecked for the Task 9 gate; only evidence text was added.

No migration, hash pin, remote resource, deployment, authentication, governance, or provider-data changes were made.

## RED/GREEN evidence

Focused RED failures were observed before each production slice:

1. `test/unit/library-service.test.ts` failed because multi-Tag filters, explicit mode, and policy version were absent.
2. `test/unit/search-policy.test.ts` failed because server presentation did not exist. Its first GREEN attempt exposed an NFKC ellipsis/code-point offset error (`60..66` became `62..68`), which was fixed by translating ranges from normalized source tokens rather than renormalizing the excerpt.
3. `test/worker/m1-library.test.ts` failed against real D1 because the old weights ranked summary/Tag/code incorrectly and Tag AND did not filter.
4. `test/unit/workspace-ui.test.ts` failed because matched-field labels, safe range segments, and repeated Tag query serialization were absent.
5. `test/worker/m1-api.test.ts` failed because repeated `tagId` query parameters were rejected.
6. Collection fail-closed RED returned a disabled Collection result; mixed legacy/new Tag input also reached the repository. Both now reject or return no rows as appropriate.
7. The 10,000-row EXPLAIN RED demonstrated SQLite's temp ORDER BY for dynamic BM25 plus metadata tie-breaks. The controller ruled to preserve exact ranking/keyset correctness and document this exception.

Focused GREEN:

```text
rtk npx vitest run test/unit/search-policy.test.ts test/unit/library-service.test.ts test/unit/workspace-ui.test.ts test/worker/m1-library.test.ts test/worker/m1-api.test.ts
5 files passed; 131 tests passed
```

Full GREEN:

```text
rtk npm run check
types:check passed
typecheck passed
smoke: 37 passed
unit: 568 passed
worker: 257 passed
dry-run build passed
```

`rtk git diff --check` also passed.

## Fixed ranking corpus and metrics

`test/fixtures/m1-search-ranking.ts` is an independent hand-labelled corpus of 30 current Revisions. It includes English, Han, code identifiers, title-only, Tag-only, summary-only, body-only, code-only, mixed-field, repeated-position, `admin_only`, disabled-Space, combining-mark/emoji/XSS-shaped, and unrelated documents.

Real D1 results:

- 3 fixed queries (`rankterm`, `权限治理`, `getUserByID`)
- 15/15 exact top-five positions
- 15/15 exact allowlisted matched-field arrays
- 15/15 exact plain-excerpt code-point highlight arrays
- policy v2 weights: title 8, summary 4, Tags 6, body 1, code 3

The existing non-vacuous M1 evaluation also remains GREEN: 20 expected retrieval citations, 16 required/returned answer citations, nonzero answer/refusal denominators, zero wrong citations, zero permission leaks, and exact citation locations.

Fence/field expectations are literal fixtures in `test/fixtures/m1-evaluation.ts`; Markdown prose, fenced code, and standalone code expectations do not call chunker/index helpers to derive expected bodies or `indexField` values.

## D1 ranking, pagination, and security

- Search joins `chunks_fts.rowid` to `chunks.rowid` and admits only active/current/indexed Revisions with a completed `index_revision` Job.
- Visibility, member role/status, active non-legacy Space, active same-Space selected Collection, active same-Space selected Tags, knowledge status, and Job status are in SQL before the ranked page is returned.
- Tag input is bounded to 1..8 raw IDs, normalized to sorted unique IDs, and requires explicit `and` or `or` plus Space. Mixed legacy/new filters reject.
- All requested Tags must independently resolve active in the requested Space. Missing, disabled, or cross-Space Tags fail closed before AND/OR membership can widen scope.
- AND uses the required indexed `revision_tags(tag_id, revision_id)` grouping with `HAVING count(DISTINCT tag_id) = ?`; OR uses the primary `(revision_id, tag_id)` lookup.
- Query/token/limit bounds remain 200 code points, 512 bytes, 32 terms, default 20, maximum 50, and `LIMIT limit + 1`. Search performs one result query and one fixed degradation query, not N+1 and not a result COUNT.
- The v2 cursor binds normalized query, member ID, role, Space, Collection, legacy Tag if present, canonical Tag IDs/mode, and policy version. Its payload strictly contains policy, score, published time, Knowledge Item ID, Revision ID, Chunk ID, and scope key. Limit is intentionally not part of the cursor scope.
- Order is BM25 ASC, `publishedAt` DESC, then Knowledge Item/Revision/Chunk IDs ASC. Real repeated-score pages prove no gaps or duplicates; query/Tag-mode/scope/canonical cursor drift rejects.

At 10,000-row scale shape, real `EXPLAIN QUERY PLAN` tests require:

- `chunks_fts` virtual-table MATCH plan
- `knowledge_items_current_revision_index_status`
- active Tag primary lookup, `revision_tags_tag_revision` for AND, and revision/tag primary lookup for OR
- selective Space/Collection predicates
- no relational full scan of `knowledge_items`

SQLite/FTS5 still reports `USE TEMP B-TREE FOR ORDER BY` because query-dependent BM25 cannot be covered together with the required `publishedAt`/ID tie-break by a static index. Replacing it with FTS rank order would violate the published deterministic tie policy. Task 10 / `OPS-015` must capture hosted D1 `rows_read` for representative selective and worst-case queries before release; this task does not check OPS or claim remote cost evidence.

## Safe explanations and UI

- `matchedFields` is server-derived, unique, allowlisted, and emitted in stable title/summary/Tags/body/code order.
- FTS `highlight()` control markers are used only as internal per-column match evidence; generated FTS text/markup is never returned.
- Excerpts are inert NFKC plain text. Highlights are at most eight half-open Unicode code-point ranges over that exact excerpt.
- Tests cover emoji, combining characters, Han overlap, underscores, case/NFKC behavior, ellipsis translation, control removal, invalid/overlapping client ranges, and literal HTML/XSS-shaped text.
- Browser rendering constructs text and `mark` nodes from validated ranges. Server excerpt text is assigned only through text nodes/`textContent`; no `innerHTML`, FTS `snippet()`, or returned HTML marker is used.

## Files

Production:

- `src/library/search-policy.ts`
- `src/library/repository.ts`
- `src/library/service.ts`
- `src/library/types.ts`
- `src/routes/library.ts`
- `public/app.js`
- `public/workspace-ui.js`
- `public/workspace-ui.d.ts`

Evidence/tests:

- `test/fixtures/m1-search-ranking.ts`
- `test/fixtures/m1-evaluation.ts`
- `test/unit/search-policy.test.ts`
- `test/unit/library-service.test.ts`
- `test/unit/workspace-ui.test.ts`
- `test/unit/cited-answer-service.test.ts` (required SearchHit fixture shape only)
- `test/worker/m1-library.test.ts`
- `test/worker/m1-api.test.ts`
- `docs/product/ai-knowledge-base-checklist.md`

## Concerns / follow-up

1. The deterministic BM25 metadata tie-break has the documented SQLite temp ORDER BY exception. Hosted `rows_read` evidence is still required under Task 10 / `OPS-015`.
2. Local Vitest/Wrangler emits the existing AI-remote-resource warning and intentional invalid-journal test stderr; the full gate exits 0.
3. No necessary index was missing from migration 0004, so the still-unapplied migration and hash pins were not modified.

## Fix round 1 addendum: isolated active corpora (C1, I1, I2)

This addendum supersedes the original report's statements that migration 0004 and its hash pins were unchanged. The still-unapplied migration now creates two authoritative six-field corpora: `chunks_fts` for admins and `chunks_fts_shared` for contributors. The reviewed 0004 SHA-256 is `ebda7d5e04fbded4a2503c28a44160325fefcaef4b354a8e25865d68f1ec81bb`; the verifier, release contract, and runbook pin the same bytes.

### RED/GREEN

Focused RED was observed before each corrective production slice:

1. Adding twelve `admin_only` matches changed a contributor hit score from `-0.000001` to `-0.0000011166306695464364` and changed the opaque cursor bytes, proving the single global corpus leaked hidden document statistics.
2. Disabling a Collection left its unfiltered result searchable and its Job/corpus rows completed/indexed; `TagsRepository.updateStatus` did not exist and stale Tag text remained searchable.
3. Running an index Job while its Collection was disabled returned `indexed` instead of remaining fail-closed `pending`.
4. Upgrade migration backfill copied disabled Tag text (`Schema`) and admitted disabled-Collection/pending-Job rows.
5. Dropping only `chunks_fts_shared` caused index failure cleanup itself to reject instead of degrading safely and releasing its lease.

Focused GREEN:

```text
rtk npx vitest run test/worker/m1-library.test.ts test/worker/m1-publication.test.ts test/worker/spaces.test.ts test/worker/migrations.test.ts test/worker/m1-api.test.ts
5 files passed; 111 tests passed

rtk npm run verify:m1:migrations -- --files
[pass] migration-files count=4
```

Final GREEN after the additional corpus-failure, concurrency, and rollback probes:

```text
rtk npm run check
types:check passed
typecheck passed
smoke: 37 passed
unit: 568 passed
worker: 264 passed
dry-run build passed

rtk git diff --check
passed
```

### Isolation and active-state evidence

- Contributor queries run only against `chunks_fts_shared`; admin queries run against `chunks_fts`. The SQL still cross-checks the caller-claimed role against the active D1 member row before returning ranked data.
- The hidden-influence probe captures the entire contributor page before and after twelve admin-only inserts. Score, order, result fields, and cursor bytes are exactly equal; the admin result set changes and includes the new rows.
- Both migration backfill and the live writer admit only current active Knowledge Items in active non-legacy Spaces, active Collections when present, `indexed` state, and completed current index Jobs. Migration Tag text is rebuilt only from active authoritative Tags, never copied from stale chunk text.
- Space and Collection status transitions atomically delete both corpora, mark affected current items `pending`, and reset their existing index Jobs to bounded recovery. Tag status transitions use the direct repository invalidation/rebuild primitive with the same fail-closed state change. Reactivation remains nonsearchable until the bounded Job worker completes.
- The writer claim and its atomic replacement guard both re-check current Space/Collection state. A controlled race pauses replacement, disables the Collection, then proves the stale indexer returns `pending` with zero corpus rows. An injected duplicate audit proves failed Space status mutation rolls back metadata, Job state, and both corpora together.
- Task 4 trash/stale-revision cleanup remains claimable even when the active-target predicate does not apply. Failure cleanup discovers which isolated corpus tables exist, removes every available row under the lease, degrades safely, and releases the lease if either corpus is unavailable.

### Production-shaped D1 scale and plans

The former 10,000-row `knowledge_items`-only decoy was replaced with 10,000 linked Submissions, Sources, SourceVersions, current Revisions, Knowledge Items, Chunks, Jobs, revision Tags, and authoritative FTS rows. The fixed distribution includes shared/admin-only visibility, active/trashed items, completed/pending Jobs, active/disabled Collections, two Spaces, active/disabled Tags, body/code fields, and AND/OR membership.

Real D1 assertions cover both corpora and require:

- `SCAN chunks_fts_shared VIRTUAL TABLE INDEX` for contributor MATCH and `SCAN chunks_fts VIRTUAL TABLE INDEX` for admin MATCH;
- `knowledge_items_current_revision_index_status`, `revision_tags_tag_revision`, and Tag/revision primary indexes where applicable;
- `knowledge_items_collection_reindex` for set-based Collection invalidation without a relational scan;
- no full relational scan of Knowledge Items, Revisions, Chunks, Jobs, Spaces, Collections, Tags, or revision Tags;
- strict 50-result pages backed by `LIMIT 51`, a second gap-free page, and 100 unique chunk IDs;
- the controller-approved `USE TEMP B-TREE FOR ORDER BY` only for query-dependent BM25 plus deterministic publication/ID ties.

No `COUNT`, N+1 fetch, unbounded result page, or remote operation was added. Hosted D1 `rows_read` remains mandatory Task 10 / `OPS-015` evidence for representative selective and worst-case queries; this fix does not check OPS or claim that evidence.

### Files and remaining concern

Production/contracts: `migrations/0004_m1_gate_completion.sql`, `src/library/repository.ts`, `src/publication/repository.ts`, `src/spaces/repository.ts`, `src/tags/repository.ts`, `scripts/verify-m1-migrations.mjs`, `scripts/m1-release-contract.test.mjs`, `docs/operations/m1-release.md`.

Evidence: `test/worker/m1-library.test.ts`, `test/worker/m1-publication.test.ts`, `test/worker/migrations.test.ts`, and this report.

The only remaining search-plan concern is the explicitly accepted dynamic BM25 ORDER BY temp B-tree. Hosted `rows_read` evidence is still required before release.
