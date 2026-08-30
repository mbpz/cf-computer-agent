# Workbench collaboration local acceptance evidence

Evidence date retained from the approved plan: 2026-08-30. Reconciliation and final gate execution: 2026-08-31 (Asia/Shanghai).

## Scope and candidate

- Branch: `codex/roadmap-status-reconciliation`.
- Task 1–8 implementation range: `38d8f45..17ae81a`.
- This document records the exact local source/test state only. It is not a release record.
- Product scope: localized shared pagination; compact independently scrollable shell; desktop/mobile sidebar account controls; member-isolated Tasks; task-backed Boards; recipient-owned Notifications; task/knowledge contextual Messages.
- Runtime correctness for these collaboration surfaces uses Cloudflare Workers, D1, and static assets. Queue, KV, Durable Objects, Workflows, WebSockets, per-user schedulers, and paid Cloudflare services are not required.

## Structured delivery boundary

| Surface | Local implementation | Local verification | Main integration | Push/PR | Deployment | Remote migrations | Production smoke | Secrets operations | Signed browser acceptance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tasks | done | done | pending | not performed | not performed | not performed | not performed | not performed | not performed |
| Boards | done | done | pending | not performed | not performed | not performed | not performed | not performed | not performed |
| Notifications | done | done | pending | not performed | not performed | not performed | not performed | not performed | not performed |
| Messages | done | done | pending | not performed | not performed | not performed | not performed | not performed | not performed |

`ready` in the route registry means the local API/UI vertical is executable. It does not mean merged to `main`, pushed, submitted as a PR, deployed, remotely migrated, production-smoked, or signed-browser accepted.

## Migration evidence

- `0035_workbench_collaboration_menus.sql`: deterministic first-level collaboration menu ordering; existing menu status is preserved and prior migrations remain unchanged.
- `0036_workbench_notifications.sql`: recipient-owned notifications, deduplication, bounded read indexes, and retryable task notification intents.
- `0037_workbench_discussions.sql`: contextual threads/messages, stable sequence/idempotency constraints, and bounded authorization projections.
- Menu readiness comes from the shared route registry and frontend navigation merge, not from `0035`.
- Local migration verifier and Worker migration/query-plan tests cover 37 migrations. No remote migration was applied.

## Implemented contracts

- Pagination: shared English/Simplified Chinese total, visible range, rows-per-page, previous/next, numbered-page accessibility labels, and mobile summary; numbered surfaces use server totals and deterministic ordering.
- Shell: navigation and content scroll independently; content spacing is compact; account identity, role, settings, theme, logout, pending/error states are in the desktop/mobile sidebar footer; top-right retains language only; the old Cloudflare free-tier UI label is absent.
- Isolation: Tasks and Boards use authenticated task ownership; Notifications always scope to the recipient; Discussions recheck the current task/knowledge authorization and do not let participants widen access.
- Idempotency: task creation/status replay, notification recipient/dedupe keys and persisted task intents, bounded read replay, and discussion author/client keys converge without duplicate logical events.
- Product model: Boards project Tasks and add no second task table; Messages are contextual discussions only, with no general direct-message recipient picker.

## Verification

### RED → GREEN delivery reconciliation

- RED: `rtk npm run verify:delivery-status` exited 1 with three expected stale-state failures: route expectation order/readiness, `BRD-001` local implementation still `pending`, and Roadmap R2 still `planned`.
- GREEN: the same command exited 0 with 27/27 structured delivery-contract tests passing after the ledger, Roadmap, README, AI checklist, frontend checklist, and evidence boundary were synchronized.

### Focused final gates

- `rtk npm run verify:i18n`: PASS; 434 keys, 55 placeholders, 6 files, hardcoded-copy AST/DOM checks passed.
- `rtk npm run test:unit -- test/unit/frontend-pagination.test.tsx test/unit/frontend-boards-page.test.tsx test/unit/frontend-notifications-page.test.tsx test/unit/frontend-messages-page.test.tsx`: PASS; because the package script roots at `test/unit`, the command executed the full unit suite: 177 files, 1,443 tests.
- `rtk npm run test:worker -- test/worker/tasks.test.ts test/worker/notifications.test.ts test/worker/discussions.test.ts test/worker/migrations.test.ts`: PASS; the package script roots at `test/worker`, so the command executed the full Worker suite: 28 files, 440 tests. The pre-Worker production UI build also passed (4,712 modules transformed).
- The first sandboxed unit/Worker attempt was environment-blocked before assertions by `listen EPERM 127.0.0.1` and Wrangler log-path `EPERM`. The identical commands were rerun with local loopback/log access and produced the PASS results above; the blocked attempt is not counted as a test failure or PASS.

### Complete gate

- First `rtk npm run check` run: FAIL in smoke/contracts before unit/Worker because `scripts/m1-release-contract.test.mjs` still pinned migration count 36 and omitted 0037 from its reviewed-byte/ledger-suffix assertions. This was a real stale contract exposed by the new append-only migration, not a product assertion failure.
- Contract RED → GREEN: after adding the exact 0037 SHA-256 (`4d83024757ebac00514c3e0d2800f1c0021f8ccdf852f60a5d5a2382a895c1ec`), count 37, and both complete ledger suffixes, `rtk node --test scripts/m1-release-contract.test.mjs` passed 24/24.
- Corrected `rtk npm run check`: PASS, exit 0.
  - Vendor browser dependency hashes: PASS.
  - Wrangler generated types and `tsc --noEmit`: PASS.
  - Smoke/static/release/frontend/WCAG contracts: 48/48 PASS.
  - i18n contract: 13/13 PASS; verifier: 434 keys, 55 placeholders, 6 files.
  - Delivery-status contract: 27/27 PASS.
  - Unit: 177 files, 1,443 tests PASS.
  - Production UI build: 4,712 modules transformed; PASS.
  - Worker/Workerd: 28 files, 440 tests PASS.
  - Build secret scan and legacy UI audit: PASS.
  - Wrangler deploy dry-run: PASS; 7 asset files read and `--dry-run: exiting now` with no upload/deployment performed.

## Known non-failure output

The test/build suites may print intentional error-path diagnostics from failure fixtures and existing Cloudflare AI/local-binding warnings. Vite may print its existing JavaScript chunk-size warning. These are reported separately from assertion/process failures; only exit code 0 and the exact test summaries count as PASS.

## Remaining product and release work

- Task soft-delete/retention/recovery/final cleanup remains `TSK-009`.
- Notification retention/deletion/dedicated audit policy remains the unfinished portion of `NTF-005`.
- Message retention/deletion/dedicated audit policy remains the unfinished portion of `MSG-005`.
- Production role matrices remain `TSK-010`, `BRD-007`, `NTF-006`, and `MSG-006`.
- Main integration, push/PR, deployment, remote migrations 0033–0037, production requests/smoke, secrets operations, and signed browser acceptance were not performed.
