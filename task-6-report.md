# Task 6 report: modular routes and static assets

## Delivered

- Composed the Worker in `src/app.ts`; `src/index.ts` now only exports the v1-compatible `KnowledgeBase` Durable Object and the app handler.
- Preserved `/workspace/.memory/index.json` and the single `personal` workspace. The repository now owns one lazily-created Workspace client for the request and disposes it at the app boundary.
- Preserved all five public API paths while adding authenticated API routing, stable errors, request IDs, security headers, API-specific JSON 404s, method handling, and asset fallback for browser paths.
- Moved the embedded Memory Garden UI into the Wrangler asset directory without changing its flows. Browser errors now prefer `error.message` from the structured error response and retain the old string-error fallback.
- Added a local-binding workerd regression for authentication, first-write/list/search through the deployed workspace paths, API 404 JSON behavior, and asset fallback. It does not invoke remote AI.

## TDD and diagnosis evidence

`test/worker/app.test.ts` failed against the legacy entry because it returned flat errors and omitted request/security headers. It passed after route and asset composition.

The first-write regression exposed a Computer VFS boundary issue. A focused probe established that fresh VFS storage has no `/workspace`, but root-level mutation works. A second probe proved that creating `/workspace` before its child directories preserves the deployed paths. The final fix also kept the Workspace RPC client request-scoped across `list -> save -> list`; opening and disposing a client per repository call caused the mutation failure.

## Verification

Executed successfully:

- `rtk npx vitest run test/worker/app.test.ts` — 3 tests passed.
- `rtk npm run test:worker` — 3 tests passed.
- `rtk npm run test:unit` — 30 tests passed.
- `rtk npm run typecheck` — passed.
- `rtk npm run check` — generated types, typecheck, all tests, and Wrangler dry-run passed. The dry-run found four public assets and the KNOWLEDGE, AI, ASSETS, and ALLOW_INSECURE_LOCAL bindings.

## Remaining boundary

These are local workerd checks only. The Workers AI binding emits its standard local warning, but this task's tests do not call it. Remote provider, deployed persistence, and production smoke evidence remain out of scope for Task 6.

## P1 review follow-up

- Changed the Wrangler asset routing rule to `run_worker_first: true`, so every static asset passes through the Worker before `env.ASSETS.fetch`. The root page and stylesheet regression both require dynamic request and security headers.
- Restored POST note compatibility: a new ID returns 201, an existing ID returns 200, and missing or non-array tags normalize to an empty array. The response body remains `{ note }`.
- Made directory initialization safe for concurrent request-scoped Workspace clients: only the documented `EEXIST` code or the observed RPC `WorkspaceFsError: path exists:` shape is treated as success. The focused unit test also proves unrelated storage errors propagate, and the workerd suite sends two fresh-note POSTs concurrently.

Follow-up verification passed:

- `rtk npx vitest run test/unit/workspace-repository.test.ts` — 3 tests passed.
- `rtk npx vitest run test/worker/app.test.ts` — 5 tests passed.
- `rtk npm run typecheck` — passed.
