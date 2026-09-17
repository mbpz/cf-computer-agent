# Task 4 report: Graph backend contract gate

Date: 2026-09-17

Status: DONE_WITH_CONCERNS

## Scope

Completed the documentation and local verification gate for `WB-GR-001` on `main` at `d2519b3`. The work was limited to `ROADMAP.md`, `docs/product/delivery-status-ledger.md`, the dated local evidence, and the delivery-status contract parser needed to recognize the multi-segment atom ID `WB-GR-001`. No Graph business implementation or production configuration was changed.

## Changes

- Added `WB-GR-001` to the delivery ledger with implementation and verification `done`, release and acceptance `pending`, and dependencies on the existing member, pagination, and domain authorities.
- Updated the Roadmap date, R2 ownership scope, and maturity summary from 94 to 95 atoms. The Roadmap records the local backend contract result while explicitly retaining release, production, and signed browser acceptance as pending.
- Added `docs/evidence/2026-09-17-work-graph-backend-local-acceptance.md` with exact commands, results, contract boundaries, deferred items, and the no-production-action statement.
- Updated `roadmapBacktickIds` in `scripts/delivery-status-contract.test.mjs` to accept IDs with more than one hyphenated segment. This is a contract-test-only change required for the new `WB-GR-001` Roadmap ownership mapping.

## Verification

All commands were run from the repository root with the `rtk` prefix.

```text
rtk npx tsc --noEmit
TypeScript: No errors found

rtk npx vitest run test/unit/graph-contract.test.ts test/unit/graph-service.test.ts
Test Files  2 passed (2)
Tests       12 passed (12)

rtk npx vitest run test/worker/graph.test.ts --pool=workers
Test Files  1 passed (1)
Tests       5 passed (5)

rtk npm run test:smoke
scripts/* smoke: 49 passed, 0 failed
test:i18n: 13 passed, 0 failed
verify:i18n: pass (keys=434, placeholders=55, files=6)
verify:delivery-status: 29 passed, 0 failed

rtk node --test scripts/delivery-status-contract.test.mjs
29 passed, 0 failed

rtk git diff --check
passed (no output)
```

The first sandbox attempts for the Graph Vitest suites and smoke suite were blocked before test execution. The original errors were Wrangler log-file `EPERM` while opening `/Users/doug/Library/Preferences/.wrangler/logs/...` and loopback listener `listen EPERM` on `127.0.0.1`. The same local commands were rerun with permission for the local Wrangler/workerd runtime and passed. The final smoke rerun also passed after the delivery-status parser/documentation updates.

## Contract gate coverage

- Member access comes from the authenticated principal and `tasks:use`; client-supplied `member_id`/`memberId` is not trusted.
- `scope` is limited to `knowledge`, `project`, or `workspace`; `rootId`, `types`, `depth`, and `limit` are strictly parsed. Depth defaults to 1 and caps at 2; the node limit defaults to 50 and caps at 100.
- The graph normalizer bounds edges to `min(limit * 2, 200)`, provides deterministic IDs/order, removes duplicates and dangling endpoints, and marks truncation when a cap is exceeded.
- Opaque cursors bind member, scope, root, depth, and types. Malformed or mismatched cursors map to `GRAPH_PAGE_INVALID`; an unauthorized root yields uniform `NOT_FOUND` without object-existence leakage.
- Local D1/workerd fixtures cover active members, disabled members, cross-member records, mismatched relation owners, hidden edges, and public metadata without member identifiers.
- Authorized projection includes knowledge, tasks, projects, goals, inbox, calendar/focus, and available project timeline meeting/decision/action-item records. Timeline rows are guarded by the owning project/member join.
- Node/relation loaders are bounded with sentinel limits. Citation IDs come from authorized source records in a bounded batch (maximum 200), with unauthorized/cross-member citations excluded.

## Concerns and deferred follow-ups

- `GraphSnapshot` has no `nextCursor` field and the projection does not yet apply stable offset/keyset continuation. Full multi-page graph reads remain deferred.
- A malformed/cross-linked citation fixture remains a minor follow-up; current citation authorization and batch bounds are covered.
- Local Vitest emits the existing warning that AI bindings can access remote resources. No AI request was made by this gate.
- Release, remote D1 migration, deployment, production smoke, signed browser acceptance, and current-main acceptance remain pending. No Wrangler deploy, remote migration, push, or browser action was performed.
- `SECRETS_FILE` was not read, uploaded, or modified. The test harness mentioned local `.dev.vars` in its own output; its contents were not inspected.

## Final review fixes — 2026-09-17

The final review identified two important bounded-projection issues. Both were fixed locally without changing production configuration, migrations, deployment state, or the progress ledger.

### Fixes

- Authorized-root preservation: `normalizeGraphSnapshot` now pins the authorized requested root into the bounded node result and fills the remaining slots in stable ID order. Root matching is shared with `/api/graph`, so a valid short or canonical root remains visible at `limit=1` while an unauthorized cross-member root still maps to uniform `NOT_FOUND`.
- Canonical-root neighbor loading: canonical `kind:id` values are now used only to locate the root. They no longer suppress loaders for other allowed node kinds, so depth-1 and depth-2 neighborhoods retain authorized knowledge, project, task, and timeline neighbors while existing type/scope filtering and loader bounds remain in place.

### Regression and verification results

The original focused command could not start in the restricted sandbox because Wrangler/workerd attempted to write its user log and open a loopback listener (`EPERM` for `/Users/doug/Library/Preferences/.wrangler/logs/...` and `127.0.0.1`). After local runtime permission was granted, the newly added regressions were red against the old implementation: the root-at-limit test returned `leaf` instead of `root`, and the canonical task root returned only itself instead of its authorized neighbors.

Final local results:

```text
rtk npx vitest run test/unit/graph-contract.test.ts test/unit/graph-service.test.ts test/worker/graph.test.ts --pool=workers
Test Files  3 passed (3)
Tests       19 passed (19)

rtk npx tsc --noEmit
TypeScript: No errors found

rtk git diff --check
passed (no output)
```

No Wrangler deploy, remote D1 migration, production smoke, browser acceptance, push, or other production action was executed. `SECRETS_FILE` was not read, uploaded, or modified.
