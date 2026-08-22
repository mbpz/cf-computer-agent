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
- Atom outcomes: 23 local passed; one remote-only atom pending.

The synthetic boolean witness manifest was removed. `test:m1` directly executes the relevant production functions through focused unit and real D1/FTS5/DO Workerd suites. Its executable release contract requires the audit, index-document, search-policy, Markdown-renderer, and evidence-confidence suites and proves omission of each one fails independently.

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

- `rtk npm run test:m1`: PASS after fix round 1 — 30 operations contracts, 13 i18n contracts, and 20 Vitest files / 551 tests; migration/docs/i18n verifiers passed first.
- `rtk npm run verify:m1:migrations -- --files`: PASS — four exact reviewed files, including unchanged `0004` SHA-256 `ebda7d5e04fbded4a2503c28a44160325fefcaef4b354a8e25865d68f1ec81bb`.
- `rtk npm run verify:m1:docs`: PASS — 14 executable evidence blocks; 76 atoms = 75 checked + 1 unchecked; gate unchecked.
- `rtk npm run verify:i18n`: PASS — 349 keys, 45 placeholders, six checked UI files, TypeScript AST and DOM hard-copy gate.
- `rtk npm run check`: PASS after fix round 1 — 38 smoke/contracts, 610 unit tests, 289 Workerd tests, generated types, TypeScript, vendored dependency digests, and Wrangler dry-run build.
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
