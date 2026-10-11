# Runbook: deploy D1 migrations before the Worker (2026-10-11)

Scope: making the automatic production deploy apply pending remote D1 migrations
before it publishes Worker code. This runbook is **preparation only**; it does not
itself change the Cloudflare dashboard, and nothing in this repository runs it
automatically.

## Incident

Production shipped current Worker code while the remote D1 database
(`memory-garden-control-plane`, binding `DB`, id
`653c9e43-c7ad-45b8-a109-bc144843bee7`) stayed at migration `0050`. The deploy
path only ran `wrangler deploy`, so the schema and the code diverged.

Measured evidence (2026-10-11):

| Check | Remote (stale) | Expected | Delta |
| --- | --- | --- | --- |
| `d1_migrations` ledger rows | 50 | 61 | 11 migrations pending (`0051`–`0061`) |
| `GET /api/admin/menus` rows | 26 | 32 | 6 menus missing |
| `GET /api/navigation` paths | 23 | 29 | 6 paths missing |

The six menus registered by `migrations/0060_workbench_route_menu_registration.sql`
were absent from remote: `menu-graph`, `menu-calendar`, `menu-today`,
`menu-focus`, `menu-workbench-review`, `menu-environments`.

Root cause: this repository has **no CI configuration** (`.github/workflows/` is
empty, there is no other workflow file). The "deploy on merge to main" behavior
comes from the **Cloudflare Workers Builds** dashboard Git integration, which
runs the repository's `deploy` script:

```json
"deploy": "wrangler deploy"
```

That script never applies migrations, so every merge deployed code against an
un-migrated database.

## Required dashboard change

In the Cloudflare dashboard: **Workers & Pages → the `memory-garden-agent`
project → Settings → Builds → Deploy command**, set it to:

```bash
npm run release
```

This is the fix. **This repository cannot verify the dashboard setting** — the
Workers Builds configuration lives in Cloudflare, not in the repo. An operator
must make this change in the dashboard; until then, merges to `main` will keep
deploying code without migrations.

## What `npm run release` does

```json
"release": "npm run db:migrate:remote && npm run deploy"
```

1. `npm run db:migrate:remote` → `wrangler d1 migrations apply memory-garden-control-plane --remote`
   applies every pending migration in `migrations/`, in order, and records it in
   the `d1_migrations` ledger. Migrations are append-only; there is no down path.
2. `npm run deploy` → `wrangler deploy` publishes the Worker **only if step 1
   exited 0** (the `&&`). A failed migration aborts the deploy.

`db:migrate:local` (`--local`) is the local dev equivalent and touches only the
local workerd D1, never production.

## Pre-flight rollback point

Before the first release under the new command (and before any risky migration),
capture a D1 Time Travel bookmark:

```bash
npx wrangler d1 time-travel info memory-garden-control-plane --json
```

Record the returned `bookmark` value in the release evidence. It is the recovery
point for the whole database.

## Post-deploy verification

After the release, confirm there is nothing left pending:

```bash
npx wrangler d1 migrations list memory-garden-control-plane --remote
```

The command must report no pending migrations (all applied). Then, while
authenticated as an admin, confirm the newly registered menus are live:

```bash
# GET /api/navigation       → must include the six new paths (/graph, /calendar,
#                             /today, /focus, /review, /environments)
# GET /api/admin/menus      → must return 32 rows, including menu-graph,
#                             menu-calendar, menu-today, menu-focus,
#                             menu-workbench-review, menu-environments
```

If `/api/navigation` still returns 23 paths or `/api/admin/menus` still returns
26 rows, the migrations did not reach remote: stop and investigate before
re-running the deploy.

## Rollback

Time Travel restore to the pre-flight bookmark:

```bash
npx wrangler d1 time-travel restore memory-garden-control-plane --bookmark <bookmark> --remote
```

Note: `wrangler d1 export --remote` **cannot** be used as the SQL backup path on
this database — it fails with:

```text
D1 Export error: cannot export databases with virtual tables (like FTS5)
```

The knowledge base uses FTS5 virtual tables, so a whole-database SQL export is
unavailable. **Time Travel is the recovery path.** For ordinary (non-FTS5)
tables, a logical per-table export remains a supplementary option; it is not a
substitute for the bookmark.

## Boundary

- This runbook and the `release` script are **preparation**: they define and
  document the correct deploy command. They do not change the Cloudflare
  dashboard and they never run automatically from this repository.
- The guard test `scripts/deploy-migration-contract.test.mjs` (in `test:smoke`)
  protects the two repo-side invariants only: migrations run before deploy, and
  this runbook keeps documenting the dashboard command, verification, and
  rollback. It cannot observe or verify the dashboard setting.
