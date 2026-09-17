# Task 2 report: Graph projection service

Date: 2026-09-17

## Changes

- Added `GraphProjectionRepository` as a read-only adapter for the existing D1 authority tables. Every private-domain query binds the supplied `memberId` in its owner predicate; relation queries also join both endpoints back to the same member-owned records.
- Added `GraphProjectionService.get(memberId, query)`, which loads authorized records, emits stable `kind:id` node IDs, applies scope/type/root/depth selection, removes edges whose endpoints are not visible, filters citation IDs to the authorized knowledge-source citation set, and delegates final bounded deterministic normalization to the graph contract.
- Added the `graph` projection service to the request service container in `src/app.ts`; no graph write endpoint or graph-owned business table was introduced.
- Added focused unit coverage for member isolation, hidden-edge removal, stable IDs, deterministic ordering, scope/type/root/depth filters, citation authorization, and public metadata not exposing member IDs.

## Domain/adaptation decisions

- Existing authoritative data currently supports knowledge, task, project, goal, inbox, calendar event, and calendar focus nodes. `meeting`, `decision`, and `action_item` are not projected because this repository has no corresponding authoritative domain repository/table in the current schema; fabricating fields would violate the graph boundary.
- Knowledge is read using the existing library visibility model: active members can see shared knowledge and admins can additionally see admin-only revisions. It is not treated as a private `member_id`-owned table because the existing knowledge contract is workspace visibility based.
- Project relation listing has no existing owner-scoped list method, so the projection adapter reads `project_goals` and `project_tasks` directly with explicit member predicates and endpoint joins. This is a minimal read-only compatibility adapter; it does not add or mutate domain data.
- Citation IDs are produced only for active chunks of revisions visible to the requesting member. Relation-provided citation IDs are intersected with this authorized set before returning the snapshot.

## Verification

Commands and original results:

```text
rtk npx vitest run test/unit/graph-service.test.ts
```

Initial sandbox run could not start Wrangler's worker pool because the sandbox denied the local listener and Wrangler log path (`EPERM`, `listen 127.0.0.1`, 2026-09-17). The same command was rerun with the required local test permission and passed:

```text
Test Files  1 passed (1)
Tests       4 passed (4)
```

Final focused verification:

```text
rtk npx vitest run test/unit/graph-service.test.ts test/unit/graph-contract.test.ts
Test Files  2 passed (2)
Tests       10 passed (10)

rtk npx tsc --noEmit
TypeScript: No errors found

rtk git diff --check
passed (no output)
```

Wrangler emitted the existing local warning that AI bindings can access remote resources; no production deployment or remote migration was performed.

## Risks / follow-ups

- Knowledge citation loading is one chunk query per visible knowledge item. It is bounded by the eventual graph node limit but should be consolidated or cached if graph usage grows.
- The current projection intentionally omits unsupported node kinds and relations rather than exposing incomplete records. A later task can add meeting/decision/action-item repositories and map them here once those authorities exist.
- This task does not implement the `/api/graph` route, opaque graph pagination, or browser acceptance; those remain in the subsequent route/acceptance tasks.

## Review fixes (2026-09-17)

- Added authorized projections for project timeline `meeting`, `decision`, and `action_item` records. `milestone` remains intentionally omitted because it is not a graph node kind in the public contract. Timeline records are loaded through the existing `ProjectsRepositoryPort.listOwned` and `ProjectTimelineRepositoryPort.listOwned` seams when app-wired, and their relation to the owning project is guarded by member-bound D1 joins.
- Added early loader selection for query types/root/scope and bounded every node/relation loader with a query-derived limit plus one sentinel row. Citation loading is now one bounded batch query (maximum 200 citations), rather than one chunk query per knowledge item. The knowledge revision join now explicitly requires `r.knowledge_item_id = k.id`.
- Added a real `cloudflare:test` D1 adapter contract test. It inserts active contributors, an active admin, a disabled member, cross-member private projects/tasks/timeline rows, and shared/admin-only knowledge, then verifies actual adapter results—not pre-filtered fake data. The test also verifies the bounded task loader.

Fix verification:

```text
rtk npx vitest run test/unit/graph-service.test.ts test/unit/graph-contract.test.ts
Test Files  2 passed (2)
Tests       12 passed (12)

rtk npx tsc --noEmit
TypeScript: No errors found
```
