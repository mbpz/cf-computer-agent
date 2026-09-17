# Personal Work Graph backend local acceptance

Date: 2026-09-17

Scope: `WB-GR-001` backend contract gate on local `main` at `d2519b3`, including the Graph contract/types, authorized projection, `/api/graph` route, focused tests, and delivery-status documentation contract. This is local implementation and verification evidence only; it is not release or production acceptance evidence.

## Verification commands

All commands below were run from the repository root with the `rtk` command prefix.

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
```

The first sandbox attempts for the Vitest worker/unit suites and `rtk npm run test:smoke` were blocked before test execution by the local environment. The original errors were Wrangler log-file `EPERM` for `/Users/doug/Library/Preferences/.wrangler/logs/...` and loopback listener `listen EPERM` on `127.0.0.1`. The same local commands were then rerun with the required permission for the local Wrangler/workerd runtime and completed with the results above. Wrangler also emitted its existing warning that AI bindings can access remote resources; no AI call was requested by this gate.

## Contract coverage

- Authorization is derived from the authenticated member principal and the existing `tasks:use` capability. The route does not accept a client-supplied `member_id` or `memberId`.
- Query coverage includes `scope=knowledge|project|workspace`, optional `rootId`, `depth` default `1` with maximum `2`, `types`, and `limit` default `50` with maximum `100`. Unknown or duplicate query keys and invalid values fail closed.
- Result bounds are enforced by the graph normalizer: at most the requested node limit and at most `min(limit * 2, 200)` edges. Stable IDs, deterministic ordering, node de-duplication, endpoint filtering, and `truncated` behavior are covered.
- Opaque cursors are validated as Graph cursors and bound to the authenticated member, `scope`, `rootId`, `depth`, and `types`. Malformed or mismatched cursors map to `GRAPH_PAGE_INVALID`; hidden roots map to the uniform `NOT_FOUND` response without revealing object existence.
- Member isolation and hidden-edge removal are covered against actual local D1/workerd fixtures, including disabled or mismatched-owner records. Public node metadata does not expose member identifiers.
- The projection covers authorized knowledge, tasks, projects, goals, inbox, calendar/focus, and available project timeline meeting/decision/action-item records. Timeline ownership is guarded by the owning project/member join.
- Node, relation, and citation loaders are bounded with query-derived sentinel limits. Citation IDs are selected from authorized source records in a bounded batch (maximum 200), and unauthorized or cross-member citations are excluded.

## Deferred minor items

- `GraphSnapshot` still has no `nextCursor` field and the projection does not apply a stable continuation offset/keyset. Full multi-page graph reads remain deferred.
- A malformed/cross-linked citation fixture remains a minor follow-up; current authorization and batch-bound checks are covered by the existing focused tests.

## Delivery boundary

`WB-GR-001` is recorded as implementation and local verification done in `docs/product/delivery-status-ledger.md`. Release, production deployment, remote D1 migration, production smoke, signed browser acceptance, and current-main acceptance remain pending. No Wrangler deploy, remote D1 migration, git push, or production/browser action was performed. `SECRETS_FILE` was not read, uploaded, or modified.
