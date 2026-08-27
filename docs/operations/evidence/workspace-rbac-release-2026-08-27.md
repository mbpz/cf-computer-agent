# Workspace RBAC release evidence — 2026-08-27

## Current state

| Field | Evidence |
| --- | --- |
| Candidate branch | `main` |
| Local candidate | `144d4f4` (working tree clean; 13 commits ahead of `origin/main`) |
| Worker | `memory-garden-agent` |
| Custom domain | `https://memory.crgmhrc.asia` |
| D1 | `memory-garden-control-plane` (`653c9e43-c7ad-45b8-a109-bc144843bee7`) |
| Production version before release | `302b312e-6e1b-45be-bbf7-7eeb47630694` (remote deployment listing) |

## Preflight backup

The native whole-database export was attempted and rejected by Cloudflare because the database contains FTS5 virtual tables. A fallback logical export was completed for 18 ordinary application tables (`audit_events`, `auth_sessions`, `automation_nonces`, `chunks`, `collections`, `d1_migrations`, `jobs`, `knowledge_items`, `members`, `publication_intents`, `reviews`, `revision_tags`, `revisions`, `source_versions`, `sources`, `spaces`, `submissions`, `tags`).

| Field | Evidence |
| --- | --- |
| Backup file | Restricted temporary directory outside repository |
| File mode | `600`; parent directory mode `700` |
| Size | 11 KB (Wrangler output) |
| SHA-256 | `cc9738f00844c59dc5b9db3a8f53c2c311bcc8885de774706b3d0b1e8fd86757` |
| Row contents | Not copied into repository or evidence |

## Remote migration preflight

`wrangler d1 migrations list --remote` reported `0005_m2_asset_ingestion.sql` through `0029_workspace_rbac.sql` as pending. No migration was applied in this evidence window: the production-write command was rejected by the execution approval boundary because the prior authorization explicitly covered only the earlier `0004` release.

Required next action after explicit authorization:

```bash
rtk npm run db:migrate:remote
```

Do not mark this evidence as a successful production migration. The new Worker version has not been uploaded or deployed in this window; production still serves the previous bundle until the migration and version release are separately approved.

## Local verification

- `rtk npm test`: PASS — smoke/contracts, i18n, 152 unit files / 1170 tests, 24 Worker files / 372 tests.
- `rtk npm run test:m2`: PASS — 11 files / 139 tests.
- `rtk npm run test:auth-compat`: PASS — 5 files / 151 tests.
- `rtk npm run typecheck`: PASS.
- `rtk npm run vendor:check`: PASS.
- `rtk npm run types:check`: PASS.
- `rtk npm run verify:i18n`: PASS.
- `rtk npm run verify:wcag`: PASS.
- `rtk npm run build`: PASS (Wrangler dry-run only).
