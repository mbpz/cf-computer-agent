# Handoff CR batch (2026-11-24, local)

Scope: updated handoff work packages WP01/WP02/WP03/WP04 and audit findings CR01–CR05. Baseline: `a7bb0379` (handoff work-package breakdown) on top of `d759f94d`. This is local implementation/regression evidence; it is not signed-browser acceptance and does not close the 17 parent checklist items.

## CR01 — transport failure is unknown, not a rejection

- `frontend/lib/admin-batch-review-data.ts` now separates a pre-send validation refusal (`BatchReviewRequestError`) from a sent-but-unconfirmed result (`BatchReviewUnknownOutcomeError`). A transport `TypeError` is never treated as “nothing was sent”.
- `useReviewBatch` keeps the frozen actions, operation numbers and expected versions when the fetch itself fails; the page restores the unknown state and offers “Retry the original batch”. Explicit non-retryable HTTP refusals still clear the intent; retryable/5xx/malformed 200 keep it.
- Tests: `test/unit/frontend-review-batch.test.tsx` covers a `TypeError("Failed to fetch")`, recovery with identical operation ids, and malformed-200/unknown handling.

## WP01 — exact receipt lookup

- New admin-only `GET /api/admin/submissions/:id/decisions/operations/:operationId` (read-only; `knowledge:review`), backed by `PublicationService.findDecisionReceipt` and the existing `review_decision_receipts` row. No list-state inference.
- The batch unknown panel can now “Check original receipts”: it reads each original submission + operation number and shows how many have a recorded receipt; missing receipts remain eligible for retry under the same numbers.
- Tests: `test/worker/admin-knowledge-lifecycle.test.ts` asserts the receipt is returned for a committed item, 404 for a missing operation, 403 for a contributor; `test/unit/frontend-review-batch.test.tsx` asserts the receipt check performs only those reads.

## CR02 — batch identity isolation

- `StoredBatchIntent` carries a unique `batchId`. `saveBatchIntent` refuses to overwrite an unresolved (`unknown`/`pending`) batch, `clearBatchIntent` only removes the matching batch, and late old responses are ignored unless the component still owns that batch id. A new batch is refused while an unknown attempt is unresolved; the reviewer must check receipts, retry or discard it.
- Tests: `test/unit/review-batch-intent.test.ts` covers unresolved overwrite, cross-batch clear refusal and done-batch supersession; the batch DOM tests cover unknown-blocks-new-send and transport retry identity.

## CR03 / WP02 — shared batch ceiling

- UI selection and submission share `MAX_BATCH_ACTIONS = 20`; 50/100-row pages remain browsable, Select-all selects at most 20 and explains the limit, and a 21st manual selection is refused with the same message rather than truncated silently.
- Tests: new DOM case loads 25 rows at pageSize 100, selects all, asserts exactly 20 checked and a 20-action request; the worker test posts 21 actions and expects `400 BATCH_REVIEW_REQUEST_INVALID` before any item runs.

## CR04 / WP03 — baseline-aware role preview

- `RoleRecord` now exposes `baselineBits` separately from `effectiveBits` (both backend and frontend DTO). The role editor preview is `draftMask | baselineBits`, so a permission granted by both the role row and the built-in baseline remains effective after unchecking the row bit; a record-only edit is labelled.
- Tests: `test/unit/frontend-admin-role-confirmation.test.tsx` covers record-only edits and the overlap case (uncheck keeps effective permission); `test/worker/admin-roles.test.ts` asserts baseline/effective values.

## CR05 / WP04 — production manuals

- `docs/operations/production-settings-manual.md` now states the required order: backup D1 → apply `0078`–`0081` → verify `d1_migrations` lists `0081` → switch the Worker. It explains that the new Worker queries `password_registration_attempts.member_id` and the recovery tables, so skipping `0081` breaks even invitation registration.
- `docs/operations/production-environment-handbook.md` names all four migrations, fixes the “three migrations” wording, repeats the pre-switch requirement, and aligns OAuth-only password set/recovery wording. “Remote already has 0081” is explicitly not the same as a new/rebuilt environment satisfying the deployment prerequisite.

## 2026-11-24 复审后执行清单（R1–R5 / WP04-R1）

- **WP01-R1**：存储层拆成 `beginBatchIntent`（仅空槽或已完成批可创建）、`updateBatchIntent`（仅当前 batchId 可更新，记录不存在不重建）、`clearBatchIntent`（仅当前 batchId 可清理）。未知/失败子集重试先确认仍持有存储批次，否则只提示不发请求。测试覆盖旧回调在清理后不能重建、跨批清理拒绝、未被替换批次仍可结算。
- **WP01-R2**：`loadBatchIntent` 接受 `0bf412a0` 的无 `batchId` v1 记录，生成并持久化稳定标识一次，旧 `pending` 迁移为 `unknown`，保留原 operationId/expectedUpdatedAt/决定/原因/备注/已知结果；损坏记录不触发补发。测试覆盖刷新两次标识不变和旧记录迁移。
- **WP01-R3**：新确认使用 `new Map()` 规划，必然生成新 operationId；未知重试继续使用冻结 attempts，已知失败子集只发失败条目。DOM 测试覆盖同负载新确认编号不同、未知重试编号一致。
- **WP01-R4**：回执查询状态绑定 `batch.batchId`，切换批次清空展示与错误，迟到查询结果仅在仍持有该批次时落地；查询只读，无回执保持未知。
- **WP01-R5**：DOM 集成用例覆盖“首发传输失败 → 刷新 → 查原回执（404）→ 同编号重试”，断言两次请求编号一致、只读查询不触发 POST。Worker 侧已有回执查询 + 同编号重放与 21 条上限回归。
- **WP04-R1**：两份手册改为 `list` 显示待应用迁移，看到 0081 必须阻断切流；必须按完整文件名查询 `d1_migrations` 看到精确行。本地 SQL 夹具：有 0081 行输出 `0081_password_recovery.sql`；无行输出空；缺 `d1_migrations` 表直接报错。三种结果均按阻断/允许规则记录，未运行 `--remote`。

## 2026-11-24 WP03 线上角色验收（Ego Browser）

- 环境：正式站、已登录管理员会话；生产构建与本地 `404aec3b` 页面资源一致（`index-BTPd7MtI.js`）。
- 临时夹具：测试成员 `c9395e00-8018-4e77-afb8-587bb1ebe985`；临时角色 `role-897ccc1c-dabc-435a-b941-4db3e5b05b81`，`allowBits=0x1600c7`、`baselineBits=0x1600c3`、`effectiveBits=0x1600c7`（知识库读取与编辑：读取同时由角色行和 Contributor 基线授予，编辑仅由角色授予）。
- 取消“读取知识”和“编辑知识”后：预览显示存储 `0x1600c2`、实际 `0x1600c3`；确认框显示 `0x1600c7 → 0x1600c2` 并移除读取/编辑。保存后刷新角色详情：存储 `0x1600c2`、实际 `0x1600c3`；角色 API 回读 `allowBits=0x1600c2`、`effectiveBits=0x1600c3`。
- 成员会话：`permissionMask=0x1600c3`，capabilities 含 `knowledge:read`、不含 `knowledge:edit`；重叠读取位保留，仅角色编辑位移除。未单独截取成员菜单；该角色不含菜单位，菜单应与 Contributor 基线一致。
- 清理：已移除成员角色关联、删除临时角色、停用测试成员；复核角色列表无该角色、成员状态 `disabled`。未创建投稿或执行批审写入。

**结论：** WP03 的预览、保存回读和成员侧授权通过；菜单对照未单独取证，因此 handoff 中 WP03 保持待验/部分，不据此关闭父项。WP02/WP13 仍待隔离待审队列与可控丢响应。

## Work packages not executed here

`WP05–WP15` cannot be completed by static source changes alone. They require browser/identity journeys, two real accounts, usable storage/AI bindings, a test VM, or production acceptance. This batch does not mark them done; it leaves those blockers explicit and does not update the 17 parent checklist items. `WP02`/`WP03` code portions are covered by CR03/CR04, but their browser acceptance remains open.

## Local verification

From the repository root on the fixed working tree:

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run verify:m1:migrations -- --files` | exit 0; 81 local migration files |
| `npm run verify:delivery-status` | exit 0; 30/30 |
| `npm run verify:workbench-maturity` | exit 0; 15/15 |
| `npm run audit:workbench-domain` | exit 0 |
| `npm run audit:frontend-operations` / inventory tests | exit 0; 481 files / 1820 candidates; 171 unassigned unchanged; 10/10 |
| `npm run check` | exit 0; unit 415 files / 5647 tests, worker 81 files / 1327 tests, smoke 88, i18n 14, delivery 30, landing 100; build upload 1747.08 KiB / gzip 330.93 KiB |

No browser/identity journey, storage/AI-backed upload, VM or production acceptance was executed. WP05–WP15 remain open with the blockers named above; no parent checklist item was closed.
