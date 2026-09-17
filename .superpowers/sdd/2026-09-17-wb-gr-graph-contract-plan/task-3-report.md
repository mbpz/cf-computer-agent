# Task 3 report: Graph API route and pagination

Date: 2026-09-17

## Changes

- Added `GET /api/graph` in `src/routes/graph.ts`.
- Required a member principal and the existing `tasks:use` capability before graph projection.
- Parsed only the contract query keys through `parseGraphQuery`; unknown keys, duplicate keys, invalid depth/limit/types/root values, and empty cursor values use `GRAPH_QUERY_INVALID`.
- Enforced hidden-root behavior as a uniform `NOT_FOUND` response after the owner-scoped projection, so cross-member root guesses do not disclose object existence.
- Added graph cursor validation using the existing opaque cursor and scope-key mechanism. The cursor binds `memberId`, `scope`, `rootId`, `depth`, and `types`; malformed or mismatched values map to `GRAPH_PAGE_INVALID`.
- Routed the graph endpoint through the existing app dispatcher and `jsonResponse`, preserving `x-request-id` plus the standard JSON error envelope. No graph write endpoint was added.
- Kept the app graph service wiring on the repository's direct owner-scoped D1 fallback. The existing project/timeline adapters require the general 1..50 page limit while the graph projection uses a bounded sentinel (`limit + 1`, up to 101), which otherwise made every graph request fail with `PAGE_INVALID` before projection.
- Added a delivery-status contract test that checks graph authorization, strict parsing, cursor error mapping, and app route wiring remain explicit.

## Verification

Initial RED verification:

```text
rtk npx vitest run test/worker/graph.test.ts --pool=workers
```

The first sandbox attempt was blocked before test execution because Wrangler could not open its local log path or listen on `127.0.0.1` (`EPERM`). With the required local test permission, the expected RED result was observed: the suite could not import the missing `src/routes/graph.ts` module.

Final focused verification:

```text
rtk npx vitest run test/worker/graph.test.ts --pool=workers
Test Files  1 passed (1)
Tests       5 passed (5)

rtk npx vitest run test/worker/graph.test.ts test/unit/graph-service.test.ts test/unit/graph-contract.test.ts --pool=workers
Test Files  3 passed (3)
Tests       17 passed (17)

rtk node --test scripts/delivery-status-contract.test.mjs
tests 29
pass 29
fail 0

rtk npx tsc --noEmit
TypeScript: No errors found

rtk git diff --check
passed (no output)
```

Wrangler emitted the existing local warning that AI bindings can access remote resources. No `SECRETS_FILE` was read or uploaded, and no remote D1 migration or deployment was performed.

## Risks / follow-ups

- `GraphSnapshot` currently has no `nextCursor` field and the existing projection service does not apply a cursor offset. This task validates and binds continuation cursors at the route boundary; full multi-page continuation should be added when the graph snapshot contract grows a continuation field and the projection query gains stable offset/keyset support.
- Graph route release and signed browser/production acceptance remain separate from this local worker evidence.
