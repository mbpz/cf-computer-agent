# SDD ledger — plan: docs/superpowers/plans/2026-08-10-phase-0-foundation.md

Baseline: 61d5e9f; npm test passed (1 file, 4 tests).

## Task 1 — Cloudflare runtime test infrastructure

- Status: complete; independent review PASS.
- Commits: `5f7f14c`, `fd32e34`.
- Verification: `npm run test:unit` (4/4), `npm run test:worker`, `npm test`, `npm run typecheck`, and `npm run check` passed.
- Dependency drift: `@cloudflare/vitest-pool-workers` 0.20.3 requires Vitest 4 and exposes `cloudflareTest()` from the package root instead of the removed `/config` entrypoint.
- Safety correction: local tests set `remoteBindings: false`; the empty future Worker-test slice uses scoped `--passWithNoTests` until Task 3+ adds Worker tests.

## Task 2 — Binding types and configuration

- Status: complete; independent review PASS.
- Commits: `f26befe`, `5656f82`.
- Verification: `npm run types:check`, `npm run typecheck`, `wrangler deploy --dry-run`, and `npm run check` passed.
- Wrangler generated `Env` includes `KNOWLEDGE`, `AI`, `ASSETS`, and literal `ALLOW_INSECURE_LOCAL: "false"`; `APP_TOKEN` remains declaration-merged only.
- Sequencing correction: added `public/.gitkeep` because Wrangler validates the configured asset directory before Task 6 installs real assets.
- Contract correction: Task 3 uses widened `AuthEnvironment` so tests can exercise explicit local mode without falsifying generated deployment types.

## Task 3 — Stable errors and authentication

- Status: complete; independent security review PASS.
- Commit: `d92ed3e`.
- Verification: focused auth/HTTP tests 5/5, unit tests 9/9, typecheck, and full `npm run check` passed.
- Security evidence: both credentials are SHA-256 digested before a fixed 32-byte XOR loop; missing/malformed credentials fail closed; only literal local `"true"` bypasses a missing token.
- HTTP evidence: stable codes, request IDs and security headers are emitted without stack traces.

## Task 4 — Knowledge domain and repository

- Status: complete; independent review PASS after fixes.
- Commits: `886447a`, `c347024`.
- Verification: 17 unit tests, typecheck, full `npm run check`, and diff check passed.
- Compatibility: `src/search.ts` remains a temporary re-export until Task 6 rewires the legacy entry point.
- Review fixes: reject null/primitives/arrays as stable `NOTE_INVALID` 400 responses; centralize workspace paths and 128 KiB limit in `src/config.ts`.

## Task 5 — Grounded AI answer service

- Status: complete; independent review PASS after hardening.
- Commits: `fd1e0b5`, `bdfce21`.
- Verification: focused 13/13, unit 30/30, typecheck, full `npm run check`, and diff check passed; no remote AI calls.
- Security: retrieved sources are JSON-delimited untrusted inert data; prompt forbids following embedded source instructions.
- Unicode: question, excerpt, and total-context limits count code points and do not split surrogate pairs.

## Task 6 — Worker composition and static assets

- Status: complete; high-rigor independent review PASS after fixes.
- Commits: `b96e70c`, `25b6a6b`.
- Verification: 33 unit tests, 5 real workerd/DO tests, generated types, typecheck, Wrangler assets dry-run, and full `npm run check` passed.
- Computer VFS root cause: repeated workspace RPC clients across list/save and absent `/workspace` root broke first writes; repository is request-scoped, explicitly disposed, and initializes root before child directories.
- Compatibility/security fixes: all assets run Worker-first for dynamic headers; note POST preserves 201-create/200-update and legacy tag normalization; directory creation tolerates only EEXIST races.

## Task 7 — Persistence and error boundaries

- Status: complete; high-rigor independent review PASS after recovery hardening.
- Commits: `49161d9`, `b916746`, `43c6769`, `a2eeb3b`.
- Verification: 38 unit tests, 19 real workerd/DO tests, type drift, typecheck, Wrangler dry build, and diff check passed.
- Consistency: DO-level serialized commit plus app-owned SQL intent journal replays Markdown/index mutations before reads; unexpected failures escape and reset the DO.
- RPC/security: expected AppErrors cross RPC as a serializable union; corrupt journal diagnostics use a fixed content-free error.
- Limits: request envelope covers worst-case JSON escaping while service enforces 128 KiB UTF-8 content and bounded id/title/tags/16 KiB aggregate metadata.

## Task 8 — Remote smoke and operations

- Status: complete; independent review PASS after transport/docs fixes.
- Commits: `23f9b57`, `2ca3e9a`.
- Verification: 2 local smoke contract tests, 38 unit tests, 19 workerd tests, types, dry build, and full `npm run check` passed.
- Safety: remote smoke requires HTTPS; HTTP is opt-in and loopback-only; token and note content are not logged.
- Operations: rollback preserves DO migrations/data and gates target compatibility; README requires APP_TOKEN for deployed API.
- Evidence boundary: no deploy or remote smoke/provider call was performed.

## Final integrated review fixes

- Status: implementation complete; fresh full gate PASS.
- Restored documented `dev`/`deploy` scripts and legacy title/tag normalization.
- Unicode-generated IDs now obey both 64-code-point and 192-byte bounds without unpaired surrogates.
- Journal insertion occurs only after note/index path validation; workerd proves a supplementary-Unicode create is followed by healthy reads and writes.
- Verification: 2 smoke contract tests, 38 unit tests, 20 workerd tests, generated types, typecheck, and dry build passed.
