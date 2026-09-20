# Production D1 backup preflight — 2026-09-17

## Outcome and authorization

Task 3 preflight only; **independent backup not created, restoration not verified, migration blocked**. The user's next-step approval followed the request to export `memory-garden-control-plane` into `/private/tmp/workbench-d1-catchup-20260917/`. This does not authorize dropping virtual tables, pausing deployed writers, applying migrations, restoring the database, or deploying a Worker.

No export was attempted. The destination did not exist when checked and was not created. There is no backup file, byte count or checksum to report. No user content or local secret file was read. The CLI returned account metadata while inspecting the deployment; this record omits it and all secret values.

## Fresh read-only evidence

Recorded on 2026-09-17; evidence write-up timestamp `2026-09-17T15:09:50Z` is not an exact export/snapshot time.

| Check | Observed result |
| --- | --- |
| Wrangler | 4.119.0 |
| Worktree | `codex/admin-audit-recovery`, HEAD `cef7625be5432b8925ded08fb483e8f4edb73529` |
| Other local refs | main `4f3f013d889b4734d3b196db34fef1888f2439b2`; origin/main `cef7625be5432b8925ded08fb483e8f4edb73529`; no fetch performed |
| Ref drift | main advanced with six graph planning/specification documents; no source or migration diff in `git diff --stat HEAD main`; no merge/reset performed |
| Database | `memory-garden-control-plane`, `653c9e43-c7ad-45b8-a109-bc144843bee7` |
| Deployed binding | Worker version below binds DB to this exact database ID |
| Deployment | `cee1cc08-b61c-4257-bff3-8f1952a365d7`, created `2026-09-17T11:09:51.978422Z`, 100% version below |
| Worker version | `162a3831-fbe6-4b65-aa11-4ab977f92236`; metadata does not establish a Git SHA |
| Applied ledger | 32 rows, IDs 1–32; last `0032_workspace_tasks.sql`, applied `2026-08-27 23:37:13` |
| Fresh pending list | 19 migrations, `0033_numbered_pagination_indexes.sql` through `0051_calendar_reference_detach.sql` |
| Local manifest verification | `npm run verify:m1:migrations -- --files`: pass, count=51 |
| Aggregate counts | tasks=0, assets=0, members=1 |
| Virtual tables | `chunks_fts`, `chunks_fts_shared` |
| Foreign key check | No returned violations |
| SQL effects | All four metadata/aggregate queries: success=true, changed_db=false, rows_written=0 |

The fresh pending range is not production migration approval. The local ref drift and absent Worker-to-Git provenance require another check before any release action.

Read-only `wrangler d1 time-travel info ... --json` returned:

```text
000000d5-00000000-000050e9-8e1a54066e2855a695eb39a20ff2f18e
```

This is a time-specific recovery bookmark, not an independent backup or proof that recovery works. No restore was executed. Refresh it immediately before an approved operation; do not assume indefinite availability.

## Why export did not proceed

Cloudflare's official **Import and export data**, “Known limitations” under export, was retrieved directly as Markdown on this date (page last updated 2026-04-21):

`https://developers.cloudflare.com/d1/best-practices/import-export-data/index.md`

It states that export does not support virtual tables, including databases containing them, and that an export blocks other database requests. Its suggested workaround removes and recreates the virtual tables. That production mutation is outside this authorization and is **not** an approved backup procedure here. The presence of the two tables was independently confirmed with a schema-only production query. This is a documented compatibility blocker, not a failed export experiment. A table-scoped export is not assumed to bypass the database-level limitation.

Installed Wrangler 4.119.0 also displays an explicit database-unavailability warning in its remote-export confirmation. No confirmation was bypassed and `--skip-confirmation` was not used.

Separately, no maintenance/write-freeze window has been confirmed. Local configuration defines a five-minute asset sweep; fresh assets=0 is not proof of a global write freeze. The deployed version exposes a scheduled handler, but its binding metadata alone does not establish the active cron schedule or all background writers. Nothing was disabled.

## Next gate

- [x] Refresh target, deployment/binding, migration ledger, pending range, aggregate counts, FKs and local manifest.
- [x] Obtain a read-only recovery bookmark and check virtual-table/export compatibility.
- [ ] Design and locally validate a **non-destructive** backup/recovery alternative using synthetic data first; cover FTS reconstruction, complete relational data, consistency across tables, foreign keys, triggers, migration ledger and numeric fidelity. Do not declare selective exports supported without evidence.
- [ ] Agree on a maintenance window and handling of every writer; obtain separate approval for any new production mechanism.
- [ ] Create and verify an authorized independent backup without exposing its contents; validate the agreed recovery procedure.
- [ ] Only then seek approval for the precise 0033–0051 migration batch and perform same-version acceptance.

No migration, restore, export, business-data write, deployment, commit or push was performed during this preflight. The production notifications/messages issue remains open.
