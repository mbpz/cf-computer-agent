# Workspace RBAC release evidence — 2026-08-27

## Current state

| Field | Evidence |
| --- | --- |
| Candidate branch | `main` |
| Local candidate | `e97b24f` (working tree changes documented below) |
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

## Production migration and deployment follow-up

The first remote migration attempt failed before changing schema with
`SQLITE_ERROR: incomplete input`. Local D1/workerd accepted the SQL, and the
failure was isolated to the three compound trigger definitions in
`0028_asset_submission_pairing.sql` (`submissions_asset_pairing_guard`,
`submissions_asset_pairing_link`, and `submissions_asset_pairing_immutable`).
The migration now uses portable partial uniqueness on
`submissions.asset_id`; the Worker performs owner/status validation and writes
the reciprocal `assets.submission_id` after a successful submission batch.

| Field | Evidence |
| --- | --- |
| Fix commit | `e97b24f` (`fix: make asset pairing migration D1-compatible`) |
| Replacement backup | 11,746 bytes; SHA-256 `d255713ab3decc42df7d649257c5fe15dfb60e3f574fc55af4c845d73c0f84b4` |
| Remote migration | `0028` and `0029` applied successfully; subsequent list returned `No migrations to apply!` |
| Uploaded Worker version | `04587d04-c0dc-4e68-aa67-15b33f05bf67` |
| Deployment | 100% production traffic; deployment message `Promote D1 0028-0029 compatibility release` |
| Current observed deployment | `34935221-d19b-4816-a6bf-d3d7c9f2219b` (automatic upload of the same pushed commit) |
| Production assets | `/assets/index-BHqR52HZ.js`, `/assets/index-BTlA2OqI.css` |

## Production smoke and access-control evidence

- Smoke rerun passed: health `200`, create `201`, list `200`, search `200`, chat with citations `200`.
- One initial search request returned transient `500`; an immediate signed reproduction and full rerun returned `200` and completed successfully.
- Automation invalid-signature probe passed with `401`; automation admin-forbidden probe passed with `403`.
- Anonymous request to `/api/admin/analytics/overview?days=7` returned `401` with request ID `a31bc053196a079f`.
- Production D1 read-only schema check returned `duplicate_candidates`, `menus`, `role_members`, `roles`, and `site_visit_events`; `PRAGMA index_list('submissions')` returned `submissions_asset_id_unique` (`unique=1`, `partial=1`).
- The administrator-only analytics page still requires a browser session for positive (`200`) evidence; no browser session was available in this CLI run.
- Final `rtk npm test`: PASS — 45 contract/smoke tests, 13 i18n tests, 152 unit files / 1170 tests, 24 Worker files / 372 tests.
