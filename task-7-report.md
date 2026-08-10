# Task 7 report: Durable Object persistence and error boundaries

## Delivered

- Added `KnowledgeBase.commitNote()` as a typed Durable Object RPC coordinator. It obtains the local `@cloudflare/computer` workspace inside `ctx.blockConcurrencyWhile()`, validates and merges the current index, then writes Markdown before the index.
- Preserved the deployed `KnowledgeBase` class, `v1` migration, `personal` workspace, VFS paths, and create/update response statuses. Worker note mutations now delegate to the typed RPC rather than running a cross-request read-modify-write sequence in the Worker.
- Added bounded JSON parsing: JSON media-type enforcement, content-length and streamed-body bounds, and stable `INVALID_JSON`, `UNSUPPORTED_MEDIA_TYPE`, and `NOTE_TOO_LARGE` errors.
- Added real workerd coverage for direct RPC local-workspace use, three concurrent write rounds followed by Durable Object eviction, cross-request index/Markdown persistence, invalid payloads and routing errors, corrupt-index redaction, request IDs, generic error redaction, and a local fake-AI failure boundary.

## TDD and diagnosis evidence

The direct-RPC probe failed first because `KnowledgeBase` did not expose `commitNote`. After implementation it passed in workerd, proving that `getWorkspace(this)` and local VFS operations complete inside `blockConcurrencyWhile()` without deadlock or Durable Object reset.

The existing concurrent first-write regression was not a flake: two Worker-side `list -> save` sequences could both read an empty index and overwrite each other's one-record index. The new coordinator keeps the full mutation inside the single Durable Object. The regression executes three concurrent pairs, then evicts the object and confirms all six records remain.

## Verification

Executed successfully:

- `rtk npx vitest run test/worker/app.test.ts` — 11 real workerd tests passed, including post-concurrency eviction persistence.
- `rtk npm run check` — generated-type drift check, TypeScript, 33 unit tests, 11 Worker tests, and Wrangler dry build passed.
- `rtk git diff --check` — passed.

## Remaining boundary

All persistence and AI-failure evidence is local workerd only. The AI failure test uses a local fake binding and makes no provider request; Wrangler still prints its standard warning because the project declares an AI binding. Remote Durable Object activation, deployed persistence, and provider smoke checks remain out of scope.
