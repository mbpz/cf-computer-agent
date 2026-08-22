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
