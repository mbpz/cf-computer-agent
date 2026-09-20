# Work Graph implementation red-run evidence

- Date: 2026-09-20
- Scope: `GR-TEMPORAL-01` / `GR-MIND-01`
- Method: temporary detached worktrees at the pre-feature baseline commits; current implementation branch was not modified.

## Task 1: temporal graph filters

Baseline: `b4a7fd7`.

Command:

```bash
rtk npx vitest run test/unit/graph-temporal-service.test.ts test/worker/graph-temporal.test.ts --pool=workers --maxWorkers=1
```

Result: expected failure. The baseline produced 3 failed tests and 1 passing test: temporal default-seven-day filtering and ninety-day validation were absent, and the Worker request returned `GRAPH_QUERY_INVALID` for the new temporal query.

## Task 2: Mindmap → Graph DTO adapter

Baseline: `f12cb2b`.

Command:

```bash
rtk npx vitest run test/unit/graph-mindmap-adapter.test.ts test/worker/graph-mindmap.test.ts --pool=workers --maxWorkers=1
```

Result: expected failure. Both test files failed during module loading because `src/graph/mindmap-adapter.ts` did not exist at the baseline.

## Boundary

- The temporary worktrees and copied test fixtures were removed after the runs.
- No source file in the main worktree was changed by the red-run.
- No remote migration, production deployment, browser acceptance, or `SECRETS_FILE` operation was performed.
