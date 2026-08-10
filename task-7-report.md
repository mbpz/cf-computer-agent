# Task 7 report: Durable Object persistence and error boundaries

## Delivered

- Added `KnowledgeBase.commitNote()` as a typed Durable Object RPC coordinator. It obtains the local `@cloudflare/computer` workspace inside `ctx.blockConcurrencyWhile()`, validates and merges the current index, then writes Markdown before the index.
- Replaced RPC-thrown application errors with serializable `{ ok, value/error }` results. The Worker reconstructs expected domain errors; non-`AppError` failures deliberately escape the concurrency block and reset the Durable Object.
- Added an app-owned SQLite journal row in the existing `KnowledgeBase` storage. It records an idempotent pending upsert before VFS mutation, then is synchronously deleted only after Markdown and index writes. Every Worker VFS read invokes DO recovery before opening its workspace client, so a restarted object replays the journal before exposing data.
- Preserved the deployed `KnowledgeBase` class, `v1` migration, `personal` workspace, VFS paths, and create/update response statuses. Worker note mutations now delegate to the typed RPC rather than running a cross-request read-modify-write sequence in the Worker.
- Added a separate JSON-envelope limit derived from the 128 KiB content cap, worst-case JSON escaping, and a bounded metadata budget. It returns `REQUEST_TOO_LARGE`, while validated note content retains the 128 KiB `NOTE_TOO_LARGE` limit.
- Added real workerd coverage for direct RPC local-workspace use, three concurrent write rounds followed by Durable Object eviction, journal replay at each VFS boundary, exact UTF-8 limits, invalid payloads and routing errors, corrupt-index redaction, request IDs, generic error redaction, and a local fake-AI failure boundary.

## TDD and diagnosis evidence

The direct-RPC probe failed first because `KnowledgeBase` did not expose `commitNote`. After implementation it passed in workerd, proving that `getWorkspace(this)` and local VFS operations complete inside `blockConcurrencyWhile()` without deadlock or Durable Object reset.

The review regression tests first showed that Error subclass fields do not form a reliable RPC contract, a 128 KiB parser cap rejected valid 128 KiB UTF-8 content once JSON framing was included, and a corrupt index thrown from the RPC degraded to `INTERNAL_ERROR`. The serializable union, separate envelope cap, and Worker-side union decoding resolve those boundaries.

Recovery tests seed the actual app-owned journal in workerd at journal-only, post-Markdown/pre-index, and post-index/pre-delete boundaries, evict the object, and verify recovery exposes matching VFS state then clears the journal. A malformed journal intentionally produces a workerd broken-input-gate diagnostic and a generic redacted response, demonstrating unexpected errors escape rather than being encoded as domain failures.

Review follow-up: the envelope limit is now derived from the worst JSON escape expansion (`128 KiB * 6`, because one control byte can serialize as `\\u00XX`) plus a named 16 KiB metadata budget, rather than a 144 KiB literal. The workerd boundary case fills exactly 128 KiB with control characters plus quotes and backslashes; it is accepted despite JSON expansion, while one additional content byte returns `NOTE_TOO_LARGE`. A separate exact absolute-envelope case still returns `REQUEST_TOO_LARGE` above the derived cap.

Journal parse failures now discard `JSON.parse`'s raw syntax error and throw the fixed non-domain `Invalid pending note journal` error. The test seeds a unique sensitive marker, captures application diagnostics, and asserts the marker is absent from both logs and the HTTP error; workerd's reset diagnostic likewise contains only the fixed message.

The existing concurrent first-write regression was not a flake: two Worker-side `list -> save` sequences could both read an empty index and overwrite each other's one-record index. The new coordinator keeps the full mutation inside the single Durable Object. The regression executes three concurrent pairs, then evicts the object and confirms all six records remain.

## Verification

Executed successfully:

- `rtk npx vitest run test/worker/app.test.ts` — 18 real workerd tests passed, including post-concurrency eviction, recovery replay, union error mapping, exact escaped UTF-8 content, and absolute-envelope limits.
- `rtk npm run check` — generated-type drift check, TypeScript, 33 unit tests, 18 Worker tests, and Wrangler dry build passed.
- `rtk git diff --check` — passed.

## Remaining boundary

All persistence and AI-failure evidence is local workerd only. The AI failure test uses a local fake binding and makes no provider request; Wrangler still prints its standard warning because the project declares an AI binding. Remote Durable Object activation, deployed persistence, and provider smoke checks remain out of scope.
