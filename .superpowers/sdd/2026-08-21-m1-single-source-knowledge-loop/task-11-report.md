# Task 11 implementation report

## Status

Task 11's local evaluation, release-operation, and evidence-template scope is implemented and verified locally. The fixed M1 evaluator uses 24 hand-labelled cases and calls the real `LibraryService` normalization/authorization/citation-ID contracts plus the real `CitedAnswerService` grounding contract. D1 retrieval and Workers AI are replaced only at their ports by deterministic in-memory adapters; the evaluator contains no `fetch`, credential, process environment, clock, randomness, account, or provider dependency.

No network call, remote D1 query/export/migration, Worker upload/deploy, GitHub mutation, Cloudflare mutation, production smoke, browser OAuth action, or rollback action ran. Wrangler was invoked only for generated-type checking, dry-run build, and local `versions view`/`versions deploy` help inspection. The dependency audit was deliberately run with `--offline` to honor the no-network instruction.

Task 11 does **not** make `GATE-M1` complete. Checklist totals: **76 P0/M1 atoms = 53 checked + 23 unchecked**. `GATE-M1` is one additional unchecked gate, so **24 items are unchecked including the gate**. `PAR-001`, `CHAT-008`, `EVAL-001`, and `EVAL-002` are explicitly unchecked because the exact fatal UTF-8, semantic low-score threshold, and independent parser-matrix contracts do not exist. The correct current product status is **M1 local acceptance pending; remote verification pending.**

Scoped commits:

- base Task 11: `3e100971e6850eac5a0484df2321c14b46535e47` (`test: gate the M1 knowledge loop`);
- review-round hardening: `010142004036139b38b2512098a224035680c221` (`fix: harden M1 release evidence gates`);
- review-round 2 executable-document and count-truth hardening: `1f44cfe26be8665e583cf29ca70bbb477216b58b` (`fix: make M1 document gates executable`);
- review-round 3 exact evidence-block and continuation hardening: `21992851ded782784dcc166d4c42d7c074ff658e` (`fix: harden M1 evidence command ordering`);
- review-round 4 CommonMark, token-continuation, and version-ID hardening: this scoped follow-up commit.

## Files

- Added `test/fixtures/m1-evaluation.ts`: fixed corpus, 24 labelled query cases, deterministic permission-scoped retrieval adapter, provider fake, citation readback, metric calculation, and per-case outcomes.
- Added `test/unit/m1-evaluation.test.ts`: corpus coverage, Recall@5/citation precision/recall/location/permission gates, positive denominator checks, exact per-case answer/refusal/citation/location assertions, zero-answer regression, and explicit degraded/no-result/partial-match-refusal/disabled/admin-only/injection outcomes.
- Added `scripts/automation-probe.mjs` and `scripts/automation-probe.test.mjs`: separately invokable, exact one-request invalid-signature health `401` and fresh valid-signature M1 admin `403` stages, their ordered combined mode, redirect/network/status fail-closed behavior, and secret/request-ID redaction.
- Added `scripts/verify-m1-migrations.mjs` and `scripts/m1-release-contract.test.mjs`: pinned SHA-256 verification and exact Wrangler `d1_migrations` pre/post ledger contracts.
- Added `scripts/verify-m1-docs.mjs`: exact named single-line evidence-block validation, CommonMark fence structure, shell-accurate continuation removal for forbidden-command scanning, and derived checklist/report truth validation. HTML comments, shell comments, prose, nested fences, heredoc bodies, continued arguments, and non-`bash`/`zsh` fences cannot satisfy evidence requirements.
- Added `docs/operations/m1-release.md`: exact D1 export → local gate → `0003` inspection/apply → complete-secret upload → exact-version inspection/deploy → OAuth/M1/bad-automation/cross-activation/cost evidence → forward-compatible rollback sequence.
- Added `docs/operations/evidence/m1-release-template.md`: entirely unchecked production evidence record with version/request-ID, D1 cost, current free-tier, recovery, and rollback placeholders.
- Added `test:m1`, `test:ops:m1`, `probe:automation`, the two single-stage probe commands, `verify:m1:migrations`, and `verify:m1:docs` in `package.json`; the global `check` runs the automation/migration/document contract tests through `test:smoke` and the evaluator through `test:unit`.
- Updated `README.md`, `ROADMAP.md`, and `docs/product/ai-knowledge-base-checklist.md` with local-only status, release links, and acceptance truth.

GitHub OAuth/session behavior, signed automation code, `KnowledgeBase`, Durable Object migration tag `v1`, migrations, production bindings/routes, smoke implementation, and production deployment guidance were preserved.

## TDD evidence

### RED

The evaluation contract test was written before the fixture/harness.

- First sandboxed command: `rtk npx vitest run test/unit/m1-evaluation.test.ts` was blocked before product execution by Wrangler log `EPERM` and Workerd `listen EPERM` on localhost.
- The same local-only command rerun with localhost/log permission failed exactly as intended:
  - 1 failed suite, 0 collected tests;
  - `Cannot find module '../fixtures/m1-evaluation'`;
  - the harness module did not exist.

This was the missing-feature RED, not a syntax or assertion failure.

### GREEN

- Initial evaluator GREEN: `rtk npx vitest run test/unit/m1-evaluation.test.ts` passed 1 file / 3 tests.
- Initial composed M1 gate: `rtk npm run test:m1` passed 12 files / 263 tests.
- Initial `rtk npm run typecheck` passed.

### Mutation coverage

- Removing contributor visibility filtering makes the admin-only or disabled cases leak and fails `permissionLeaks` plus the explicit outcomes.
- Returning a fabricated citation fails the real cited-answer allowlist before a report can pass and is also counted by the wrong-citation gate.
- Breaking citation decode/authorization/location makes `citationLocationRate` fail.
- Calling the provider on empty or partial-match no-result evidence fails the explicit refusal cases.
- Removing every returned answer makes citation precision/recall/location fail closed rather than pass on a zero denominator.
- Losing degraded state or disabled denial fails the explicit case outcomes independently of the aggregate metrics.

### Review-round 1 RED → GREEN

- Evaluator RED: the tightened 4-test contract failed all 4 tests against the prior harness: missing `partial-match-refusal`, missing citation recall/denominators, answer cases treated as refusals, and the former label-driven case still present.
- Evaluator GREEN: removing the `lowRelevance` branch, using actual AND/token coverage, adding exact citation recall/location/outcome summarization, and making zero ratios fail closed passed 1 file / 4 tests.
- Automation RED: `rtk node --test scripts/automation-probe.test.mjs` failed 5/5 because the dedicated probe did not exist.
- Automation GREEN: the probe contract passed exact `401`/`403`, status/network/TLS/redirect failure, signature/body, fresh nonce, and redaction cases.
- Migration RED: `rtk node --test scripts/m1-release-contract.test.mjs` failed 4/4 because the verifier, pinned runbook hashes, exact D1 ledger query, and scripts were absent.
- Migration GREEN: all 4 provenance/ledger/runbook contract tests passed with reviewed SHA-256 values and exact before/after ledger fixtures.

### Review-round 2 RED → GREEN

- RED: `rtk node --test scripts/m1-release-contract.test.mjs` retained 3 passing migration tests and failed all 4 new document-contract tests because `verify-m1-docs.mjs` did not exist, the hash assignments were not executable commands, and the report still conflated atoms with the gate.
- GREEN: the focused contract passed 7/7 after adding the executable-fence parser, required-command/hash ordering rules, forbidden-command policy, comment/prose mutation cases, and derived `76 = 53 + 23` atom plus one-gate truth check.
- Mutation proof moves every required hash and migration/ledger/probe command into both an HTML comment and a shell `#` comment and requires failure. Executable forbidden commands fail; the same illustrations in prose, HTML comments, shell comments, or an unaccepted `sh` fence do not count as execution.

### Review-round 3 RED → GREEN

- RED: the focused release contract retained 7 passing tests and failed the 3 new mutation cases because the line-oriented verifier accepted a required probe after a continued `printf`, accepted it inside a heredoc body, missed a split `wrangler deploy`, and did not order the probe after migration verification.
- Probe RED: the new one-stage contract failed because the original script always made both requests.
- GREEN: the focused release contract passed 10/10 after replacing required-line discovery with 11 exact, visibly named, single-physical-line evidence blocks in a fixed release graph; the probe contract passed 6/6 after adding exact `--invalid-health` and `--admin-forbidden` modes while preserving the ordered combined mode.
- Mutation proof rejects the required probe as a continued argument, inside a heredoc body, or moved before migration provenance; it also joins backslash-newline in executable `bash`/`zsh` fences before rejecting a split forbidden deploy. Prose, HTML comments, full-line shell comments, and `sh` illustrations remain non-executable evidence.

### Review-round 4 RED → GREEN

- RED: the focused release contract retained 10 passing tests and failed 4 reviewed behaviors: `r\\` plus newline plus `tk` bypassed the forbidden scan, indented/tilde executable fences were ignored, a mandatory triple-backtick block nested inside an outer four-backtick fence was accepted, and version commands still used angle-bracket shell redirection syntax.
- GREEN: the focused release contract passed 14/14 after applying shell backslash-newline deletion, parsing top-level CommonMark backtick/tilde fences with matching character/length and up to three spaces of indentation, requiring one entire exact command line per mandatory block, and replacing version placeholders with a safely read/exported `M1_VERSION_ID`, an explicit nonempty precondition, and quoted arguments.
- Mutation proof inserts backslash-newline at every internal character boundary of every forbidden command token; wraps required execution in `if false`, a function, command substitution, braces, and a compound command; nests it in an outer four-backtick fence; and checks all 12 exact lines with `bash -n` and `zsh -n` using harmless environment placeholders without executing them.

## Evaluation contract

The corpus covers Chinese, English, code identifiers, title, Tag, body, no result, a partial-match refusal under the real AND/token-coverage contract, contributor/admin visibility, disabled member, prompt injection, exact citation location, and degraded-but-readable search. It includes 24 cases (more than the required 20). It does **not** claim a calibrated semantic low-relevance threshold; `CHAT-008` remains unchecked.

The gate passed these assertions:

- fixed IDs/case count `= 24`;
- expected retrieval citations `= 20`, required answer citations `= 20`, returned citations `= 20`;
- answer-expected cases `= 20`, refusal-expected cases `= 3`, denied cases `= 1`;
- Recall@5 `= 1` (gate minimum `0.85`);
- citation precision `= 1`;
- citation recall `= 1`;
- citation location rate `= 1`;
- exact required authorized citation IDs and locations for every answer-expected case;
- exact no-evidence/provider-free behavior for every refusal-expected case;
- positive retrieval, answer, returned-citation, and refusal denominators;
- wrong citations `= 0`;
- permission leaks `= 0`.

The `no-result`, `partial-match-refusal`, and contributor `admin_only` cases return no evidence and never call the provider. The disabled principal is denied before retrieval/provider use. The degraded case remains readable and cited. The injection source is serialized as inert data and the provider-authored answer cannot reproduce `EXFILTRATE` or `SYSTEM_OVERRIDE`.

This is a deterministic local gate, not a remote D1 ranking, semantic-support, real-provider, billing, or production permission claim.

## Operations, migration, secret, and rollback safeguards

The M1 runbook:

- requires a restricted remote D1 export before migration;
- pins and locally verifies the reviewed SHA-256 bytes of migrations `0001`, `0002`, and `0003` before any remote action;
- proves hash verification, before/after ledger capture and verification, forward migration apply, version upload/ID precondition/inspect/deploy, invalid `401`, and valid M1-admin `403` from 12 exact named blocks, each containing one exact physical command line;
- queries Wrangler's actual `d1_migrations` table and requires the exact two-name pre-apply and three-name post-apply ledger, with no missing, renamed, reordered, or extra state;
- runs `test:m1`, the full gate, audit, and diff checks before remote change;
- reads all of `0003`, requires upgrade/FK preservation evidence, and applies it only forward;
- preserves applied `0001`/`0002`, GitHub OAuth identities, D1 sessions, `KnowledgeBase`, DO `v1`, VFS/index/journal data, and existing bindings/routes;
- constructs one complete seven-secret JSON bundle outside the repository using hidden reads, `set +x`, restrictive permissions, and cleanup traps;
- forbids `secret put`, `versions secret bulk`, plain deploy, npm deploy, Wrangler rollback, reverse migration, D1/DO deletion, and old Access-era builds;
- uploads with `versions upload --secrets-file ... --strict`, inspects the exact ID/bindings/routes, and deploys only the quoted `${M1_VERSION_ID}@100%` argument with separate authorization;
- captures the exact upload ID through shell input, rejects an empty `M1_VERSION_ID`, and quotes the ID in current `versions view` and `versions deploy` syntax;
- keeps every production checkbox in the template unchecked;
- records request IDs without source/answer bodies, cookies, OAuth codes, headers, secrets, callback URLs, or provider bodies;
- runs separately recorded one-request stages, first exact invalid-signature health `401`, then exact valid-signature M1 recovery-route `403`, with fresh timestamp/nonce/HMAC, no redirect/retry/body logging, and redacted request IDs/credentials;
- requires a normal, non-destructive cross-activation read;
- records remote D1 `rows_read`/`rows_written` for bounded synthetic list/search operations; and
- allows rollback only to an inspected forward-compatible Worker that reads the current `0003` schema and preserved DO state.

## Free-tier and local fault evidence

The runbook and template reference the existing bounded evidence for request bodies, parser/chunker size, default/max pagination, `LIMIT + 1`, cursor scope, fixed eight-hit answer retrieval, bounded context/output/timeout, bounded recovery, selective D1 indexes, D1 batch rollback, ambiguous DO response replay, degraded FTS readability, and index-job recovery.

They explicitly leave current Cloudflare official-limit review, target account plan/quota, remote D1 cost, provider availability, and production recovery unchecked. Historical quota snapshots are not accepted as current evidence.

## Checklist reconciliation

Task 11 compared the plan's ranges to the current checklist instead of bulk-checking them. Twenty-three current P0/M1 atoms remain unchecked because their exact acceptance exceeds current implementation/evidence:

- `SRC-003`;
- `PAR-001`;
- `GOV-004`, `GOV-005`, `GOV-007`, `GOV-010`;
- `IDX-001`, `IDX-002`, `IDX-004`, `IDX-006`;
- `SRCH-002`, `SRCH-003`, `SRCH-004`, `SRCH-007`;
- `READ-003`, `READ-009`;
- `CHAT-002`, `CHAT-008`;
- `COL-001`;
- `AUTH-015`;
- `EVAL-001`, `EVAL-002`; and
- `OPS-015`.

`GATE-M1` remains unchecked. The release runbook treats these atoms as blockers rather than weakening their acceptance wording or inferring completion from adjacent tests.

## Final local verification

- Focused evaluator/citation/real-D1 library gate:
  - `rtk npx vitest run test/unit/m1-evaluation.test.ts test/unit/cited-answer-service.test.ts test/worker/m1-library.test.ts`
  - passed 3 files / 66 tests.
- Final evaluator-only gate:
  - `rtk npx vitest run test/unit/m1-evaluation.test.ts`
  - passed 1 file / 4 tests.
- Focused operational contract gate:
  - `rtk node --test scripts/automation-probe.test.mjs scripts/m1-release-contract.test.mjs`
  - passed 20/20 tests.
- Final M1 gate:
  - `rtk npm run test:m1`
  - passed 20/20 operational contracts plus 12 files / 264 Vitest tests.
- `rtk npm run typecheck` passed.
- Final repository gate:
  - `rtk npm run check`
  - generated types current;
  - TypeScript passed;
  - smoke/operational contracts passed 28/28;
  - unit passed 447/447 across 26 files;
  - Workerd passed 215/215 across 12 files;
  - Wrangler dry-run passed with unchanged `KNOWLEDGE`, `DB`, `AI`, `ASSETS`, and local configuration bindings.
- No-network production dependency audit:
  - `rtk npm audit --omit=dev --offline`
  - `found 0 vulnerabilities`.
- `rtk git diff --check` passed.
- `rtk npm run verify:m1:migrations -- --files` passed with `migration-files count=3`.
- `rtk npm run verify:m1:docs` passed with `m1-runbook evidence_blocks=12` and `m1-truth atoms=76 checked=53 unchecked=23 gates=1 unchecked_items=24`.
- Local `rtk npx --no-install wrangler versions view --help` and `versions deploy --help` confirmed the installed Wrangler 4.119.0 positional forms `view <version-id>` and `deploy [version-id@percentage]`; no provider request was made.
- Local Markdown link check passed for README, Roadmap, Checklist, M1 runbook, and evidence template.
- Runbook command-policy check passed: 12 visible evidence labels each bind to one exact top-level physical `bash`/`zsh` command in the required release order; comments/prose/nested fences/continued arguments/heredocs/compound wrappers cannot satisfy them; shell-normalized executable fences contain no migration-list, secret put/bulk, plain deploy, npm deploy, Wrangler rollback, reverse/restore, or destructive D1 command.
- Package-script check passed: all required M1 slices are present and the full gate remains additive.
- Secret-pattern scan returned no matches.
- Acceptance static check passed: exactly 23 P0/M1 atoms plus one unchecked `GATE-M1` remain, for 24 unchecked items total including the gate; the production evidence template contains no checked box.

The full Workerd gate retains the expected invalid pending-note journal fixture diagnostics and local AI-binding warnings; the command exited zero. No Workers AI call occurred. The automation probe was executed only against local loopback mocks; the migration verifier read only checked-in local files and controlled local JSON fixtures.

## Explicit remote omissions and review checkpoint

The following were not run and have no claimed evidence: remote D1 export/migration/ledger query, version upload/view/deploy, routes/binding inspection against production, GitHub OAuth/browser session journey, M1 submit/publish/search/read/chat journey, permission denial against production, bad/valid remote automation probe, cross-activation read, D1 rows read/written, provider response/quota, rollback, or evidence archive.

The plan requires an independent correctness/security review after Task 11. The parent instruction explicitly prohibited subagents/reviewers for this implementation, so that checkpoint remains for the parent/controller. It must distinguish local/Workerd evidence from production evidence before any continuation or M1 completion claim.
