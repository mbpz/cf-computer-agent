# Task 9 — fixed local M1 acceptance candidate

## Result and boundary

The provider-free local/Workerd gate proves the 23 implementation atoms in the approved M1 completion scope. Checklist totals: **76 P0/M1 atoms = 75 checked + 1 unchecked**. `GATE-M1` is one additional unchecked gate, so **2 items are unchecked including the gate**.

This is **M1 implementation complete; remote verification pending**. No remote command, migration, upload, deployment, browser journey, provider request, or production evidence mutation was performed.

## Fixed evaluation denominators

- Parser: 34 independent byte/metadata cases, derived directly from `m1ParserCases` with a drift regression.
- Retrieval: 24 labelled cases; 20 required retrieval citations.
- Answer/refusal/denial: 16 / 7 / 1.
- Languages: 8 Chinese/English risk-surface cases.
- Citations: 16 required and 16 returned; precision, recall, and location rate all 1; zero wrong citations and zero permission leaks.
- Authorization/ranking/rendering: 8 download authorization cases, 4 ranking cases, and 5 highlight-safety cases.
- Behavior mutations: 28 named witnesses, each with one independent literal baseline and one mutated input/policy/state; every mutant fails its exact feature ID and zero/missing witnesses fail closed.
- Atom outcomes: 23 local passed; one remote-only atom pending.

The synthetic boolean witness manifest was removed. `test:m1` directly executes the relevant production functions through focused unit and real D1/FTS5/DO Workerd suites. The behavior-level matrix invokes public decoder/parser/index/search/service/renderer/i18n paths and covers fatal decoding, code metadata, governance intent/target/visibility/resubmission, every FTS field, current/index state, ranking/presentation, Tag modes, Markdown sanitization, Revision/download visibility, every chat scope, confidence/refusal, status filtering, and translation keys. Its executable release contract requires the matrix plus the audit, index-document, search-policy, Markdown-renderer, and evidence-confidence suites and proves omission of each one fails independently. This is local acceptance evidence, not a production claim.

## Deferred-minor reconciliation

- Direct HTTP accepts normalized Markdown of exactly 128 KiB from a byte-safe multibyte UTF-8 payload and rejects the one-byte-over case.
- `SourcesRepository` rejects null, malformed, non-lowercase, or non-64-hex M1-v2 source identity before preparing D1 SQL; legacy M1-v1 null identity remains supported.
- List and both ranked/stable search cursor IDs use the bounded canonical resource-ID grammar; oversized, control-containing, and malformed-surrogate regressions fail closed.
- The independent fence/field fixture remains covered by the Task 5 evaluation corpus.
- Task 8 already resolved prototype-safe translation catalog lookup.

## Checklist reconciliation

One current P0/M1 atom remains unchecked:

- `OPS-015`.

It requires reviewed production `rows_read`/`rows_written` rows for bounded list/search/review/Tag/recovery operations. Local indexes, query plans, and tests do not substitute for that evidence. `GATE-M1` remains unchecked until Task 10 completes every authorized remote row and independent review.

## Verification evidence

- `rtk npm run test:m1`: PASS after fix round 2 — 30 operations contracts, 13 i18n contracts, and 21 Vitest files / 561 tests; migration/docs/i18n verifiers passed first.
- `rtk npm run verify:m1:migrations -- --files`: PASS — four exact reviewed files, including unchanged `0004` SHA-256 `ebda7d5e04fbded4a2503c28a44160325fefcaef4b354a8e25865d68f1ec81bb`.
- `rtk npm run verify:m1:docs`: PASS — 14 executable evidence blocks; 76 atoms = 75 checked + 1 unchecked; gate unchecked.
- `rtk npm run verify:i18n`: PASS — 349 keys, 45 placeholders, six checked UI files, TypeScript AST and DOM hard-copy gate.
- `rtk npm run check`: PASS after fix round 2 — 38 smoke/contracts, 620 unit tests, 289 Workerd tests, generated types, TypeScript, vendored dependency digests, and Wrangler dry-run build.
- `rtk npm audit --omit=dev --offline`: PASS — zero runtime vulnerabilities.
- `rtk git diff --check`: PASS.

The Workerd run emitted the pre-existing deliberate invalid-journal fail-closed diagnostics and local AI-binding warnings; all commands exited zero. Runtime dependency audit uses the offline lockfile and makes no registry request.

## Fix round 1

- RED: the executable release contract failed when it first required `test/unit/audit.test.ts`; the prior `test:m1` command omitted all five newly required direct production suites.
- Removed the synthetic boolean acceptance witness and its self-fulfilling mutation test.
- Parser cardinality now comes directly from `m1ParserCases`; the regression requires the current independent fixture length of 34, so fixture drift cannot leave a stale evaluation denominator silently green.
- `test:m1` now directly runs audit, index-document, search-policy, Markdown-renderer, and evidence-confidence suites. Its release contract tokenizes the command and independently proves omission of each required suite fails.
- Focused GREEN: 23 release-contract tests and six Vitest files / 82 tests.
- Complete GREEN: 30 operations contracts, 13 i18n contracts, 20 Vitest files / 551 tests; full repository counts are recorded above.

## Fix round 2 — behavior-level mutation witnesses

- RED: the prior acceptance gate only proved named suite presence; it had no reusable witness runner requiring a literal baseline, independently mutated behavior, exact feature failure, nonempty reason, and nonzero cardinality.
- Added `test/fixtures/m1-mutation-matrix.ts` and 28 production-shaped witnesses in `test/unit/m1-mutation-matrix.test.ts`.
- The matrix uses public production functions/services rather than source-text matching or synthetic completion booleans. Each mutant is reported by its exact feature ID; duplicate IDs, zero witnesses/results, missing failures, cross-feature failures, and missing reasons fail closed.
- `test:m1` and its omission mutation contract now require the matrix directly.
- Complete GREEN: 30 operations contracts, 13 i18n contracts, and 21 Vitest files / 561 tests.
