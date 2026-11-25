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

- 环境：正式站、已登录管理员会话；记录的前端入口资源名 `index-BTPd7MtI.js` 与本地 `404aec3b` 相同。该比对不能确认 Worker、D1 或部署 SHA。
- 临时夹具：测试成员 `c9395e00-8018-4e77-afb8-587bb1ebe985`；临时角色 `role-897ccc1c-dabc-435a-b941-4db3e5b05b81`，`allowBits=0x1600c7`、`baselineBits=0x1600c3`、`effectiveBits=0x1600c7`（知识库读取与编辑：读取同时由角色行和 Contributor 基线授予，编辑仅由角色授予）。
- 取消“读取知识”和“编辑知识”后：预览显示存储 `0x1600c2`、实际 `0x1600c3`；确认框显示 `0x1600c7 → 0x1600c2` 并移除读取/编辑。保存后刷新角色详情：存储 `0x1600c2`、实际 `0x1600c3`；角色 API 回读 `allowBits=0x1600c2`、`effectiveBits=0x1600c3`。
- 成员会话：`permissionMask=0x1600c3`，capabilities 含 `knowledge:read`、不含 `knowledge:edit`；重叠读取位保留，仅角色编辑位移除。未单独截取成员菜单；该角色不含菜单位，菜单应与 Contributor 基线一致。
- 清理：已移除成员角色关联、删除临时角色、停用测试成员；复核角色列表无该角色、成员状态 `disabled`。未创建投稿或执行批审写入。

**结论：** WP03 的预览、保存回读和成员侧授权通过；菜单对照未单独取证，因此 handoff 中 WP03 保持待验/部分，不据此关闭父项。WP02/WP13 仍待隔离待审队列与可控丢响应。

## 2026-11-24 WP01/WP13 线上续验（Ego Browser，部分）

- 临时成员 `c9395e00-8018-4e77-afb8-587bb1ebe985` 重新启用，创建专用 `review_pending` 投稿 `19ea4e67-7a41-409f-8238-eb04ec389c5e`（标题以 `Handoff recovery` 开头）。
- 用管理员会话提交一次驳回（operationId `batch.handoff.f66dfd92-e10f-452e-afe6-03fe4ab5a919`），服务端返回成功；随后在浏览器 sessionStorage 写入该批次的 `unknown` 冻结意图（没有真正阻断生产响应，属于受控模拟）。
- 刷新/进入 `/admin/submissions/batch` 显示“批量结果未知”，保留原操作编号；点“核对原回执”得到 `1:1`，明确该条目已有回执；无审核权限的测试成员读取同一回执为 `403`。
- 点“重试原批量请求”后按原编号重放，成功并自动返回审核队列；再次查询回执仍为 `200`，该条目 rejection 审计只出现 1 次；待审队列变为空。该单条样本的回执及审计符合幂等预期；此证据未覆盖部分成功批次或失败子集的二次恢复。
- 清理：测试成员已停用；未通过产品流程清理 3 条据报已驳回的验收样本。本记录只列出其中 1 个已知投稿 ID；`Handoff ...` 标题前缀不构成清理名单。后续先逐条核对并批准保留或清理，不按前缀删除。
- 未验证真正的“服务端已提交但浏览器完全收不到响应”（本次是提交成功后手工注入 unknown 状态）；也未验证 50/100 行第二页、20 条上限、未知旧记录 v1 恢复等浏览器路径。因此 WP01/WP13 只记部分，不勾完成。

## AC-00 遗留样本登记（2026-11-24 Ego Browser）

- 测试作者：临时成员 `c9395e00-8018-4e77-afb8-587bb1ebe985`（已停用），邮箱为 `apples398+accept1795531355792@gmail.com` 的验收别名。
- 3 条遗留投稿均 `status=rejected`，各自 `submission.rejected` 审计 1 条：
  - `19ea4e67-7a41-409f-8238-eb04ec389c5e`，`Handoff recovery ...`；回执 operation `batch.handoff.f66dfd92-e10f-452e-afe6-03fe4ab5a919` 已核对 `200`。
  - `d03a686f-c2ba-4eef-bfdc-eed5fc41195e`，`Handoff receipt sample ...`；回执 operation 未保留。
  - `7239f49d-2ad3-4a7c-a33b-a8d3f019f3ed`，`Handoff acceptance sample ...`；回执 operation 未保留。
- 清理：没有产品删除投稿 API，未按标题前缀删除；精确 ID/测试作者/关联范围需交给获授权 D1 操作者，或作为隔离样本保留。测试成员已停用。
- 未关联部署 ID/候选源 SHA；`index-BTPd7MtI.js` 不足以固定 Worker/D1 状态。AC-00 仍不完整。

## R2-F01 首发/子集恢复生命周期（2026-11-24 本地）

- R2-01：`mergeOutcomes` 改为按原始顺序合并旧结果并追加重放响应中的新条目；首发 unknown（已知结果为空）按原号重放后得到 2/2 逐条结果，不再清空意图或只提交 `done []`。
- R2-02：未知重放遇到明确拒绝（如 403）只提示拒绝并保持 unknown、原 attempts/inflight 与编号，不再写成 done 或清除回执入口；已知失败子集第一次被明确拒绝仍保留上次确定结果。
- 新增 DOM 用例：首发全成功重放 2/2、首发混合结果可读且保留失败重试、重放 403 后存储仍为 unknown 且 attempts/inflight 为 2。
- 定向五文件 **86/86**；`npm run typecheck` 退出 0；操作索引 481 文件/1820 候选且审计通过；功能清单仍 12 已关闭 / 17 未开放。

## R2-F02 / R2-P01 / R2-N01（2026-11-24 本地工程证据）

- R2-F02：`test/worker/admin-knowledge-lifecycle.test.ts` 新增“测试接收方丢弃首发响应”场景：Worker 完成真实批审写入后返回 200，测试不消费响应；按 submissionId + operationId 只读查回执，再用同一 payload/编号重放。断言回执存在、replay 仍 1 成功、reviews 1 条、rejection 审计 1 条、decision receipt 1 条。未加可部署故障开关，未改 sessionStorage。
- R2-P01：新增 `mapWithConcurrency`（上限 4，支持 AbortSignal）；批审回执查询改为最多 4 个待决 GET，换批/离页通过 AbortController 取消；单测覆盖峰值 ≤4、顺序保持、取消后不再排新请求。未做浏览器固定延迟 P95 测量，也未实现 N01 产品交互。
- 定向：worker 批审 9/9；并发单测 2/2；typecheck 通过。

## R2-N01 逐条回执对账（2026-11-24 本地）

- 回执面板按原 attempts 顺序显示每行状态：`found` / `missing` / `unavailable`，并显示三类计数；单行可复制原 operationId。
- 失败读取不再让整轮只剩全局错误：网络/5xx 标记 `unavailable` 并保留已取到的 found/missing 行；401/403 清空细节并显示会话无权提示，不回填旧回执。
- “仅重查读取失败的项”只对 unavailable 行追加一次 GET，已 found/missing 行不重查；查询仍为 0 POST。沿用 P01 的并发 4 与取消。
- 单测：found + unavailable → 仅重查 unavailable 后变为 found + missing，已 found 行保持。
- **线上浏览器验收（2026-11-25，Ego Browser，正式站）**：部署构建 `index-rXvOX0mg.js`（与本地候选一致）。用 3 条已登记样本构造只读回执面板，得到 `found / unavailable / missing` 三行与 `1:3` 计数；点“仅重查读取失败的项”只产生 1 个 GET（仅 d03a 的 operation URL），已 found/missing 行不重查，全程 0 POST；复制按钮显示“已复制”，键盘 Enter 激活复制并保持焦点；390px 下 3 行可见且 `scrollWidth=390` 无横向溢出；切英文后显示 “1 of 3…” 与三行状态，桌面 1280px 无溢出。未做 P01 的固定 100ms 延迟/5 轮 P95 网络时间线。

## 2026-11-25 AC-01/R2-V01 真实丢响应恢复（Ego Browser）

- 使用 CDP `Fetch` 在 **Response 阶段** 拦截 `POST /api/admin/submissions/batch-review`，服务端已返回 200 后由测试端 `failRequest`，应用自然进入“批量结果未知”，未手工写 sessionStorage。请求操作编号 `batch.5453e601-f1be-4ca5-8177-278cb5409268`，投稿 `bba1f096-271f-414d-af72-d6295af0fcae`。
- 刷新后 unknown 恢复；点“核对原回执”得到 `1:1`、状态 `found`；点“重试原批量请求”按原编号重放成功并返回队列；随后 `GET .../decisions/operations/{operationId}` 返回 200，`submission.rejected` 审计恰好 1 条，待审队列 0。
- 测试成员已重新停用；该样本成为第 4 条遗留 rejected 投稿，需 AC-00 登记/清理授权。

## 2026-11-25 P01 100ms 固定延迟测量（未通过，不作为应用结论）

- 用 20 条回执请求、CDP Response 阶段每请求延迟 100ms，连续 5 轮；页面均显示 20 行。观测全轮耗时 3122–3992ms，高于 ≤800ms 候选预算。
- 该数字包含 ego/CDP 逐请求 `Fetch.continueResponse` 命令的协议开销（命令串行化），不能据此断言应用实现超预算；需要在应用/浏览器 Performance 资源计时或独立网络整形上复测。P01 P95 仍标未验。

## 2026-11-25 R3-F01/F03 与 CR03 快速修复（本地）

- R3-F01：`/admin/submissions/batch` 路由增加成员 id、角色、权限掩码、能力集合 key；身份切 A→B 或撤权会重建页面，旧 owner 的队列/回执/导航回调不再复用。
- R3-F03：回执客户端只把 `404 + REVIEW_RECEIPT_NOT_FOUND` 判为“暂无回执”；通用 404、5xx、无效 200 均归 `unavailable`，可走仅重查。
- R3-CR03：回执轮次收到任意 401/403 时立即 abort 当前 controller，已启动 worker 不再领取下一项；仍清空详情并显示权限提示。
- 未实现 R3-F02 的完整查询轮次/身份/子集绑定，也未做 R3-E01 的隔离真实丢响应工程夹具；R3-F01 仅路由 key 修复，缺少 A→B 延迟回包回归。
- 定向 3 文件 53/53、typecheck 通过；全量门禁见下方。

## Original local run scope (before the Ego Browser follow-ups)

`WP05–WP15` cannot be completed by static source changes alone. They require browser/identity journeys, two real accounts, usable storage/AI bindings, a test VM, or production acceptance. This batch does not mark them done; it leaves those blockers explicit and does not update the 17 parent checklist items. `WP02`/`WP03` code portions are covered by CR03/CR04, but their browser acceptance remains open.

## Original local verification (before the Ego Browser follow-ups)

From the repository root on the fixed working tree:

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run verify:m1:migrations -- --files` | exit 0; 81 local migration files |
| `npm run verify:delivery-status` | exit 0; 30/30 |
| `npm run verify:workbench-maturity` | exit 0; 15/15 |
| `npm run audit:workbench-domain` | exit 0 |
| `npm run audit:frontend-operations` / inventory tests | exit 0; 481 files / 1820 candidates; 171 unassigned unchanged; 10/10 |
| `npm run check` | exit 0; unit 416 files / 5654 tests, worker 81 files / 1327 tests, smoke 88, i18n 14, delivery 30, landing 100; build upload 1747.08 KiB / gzip 330.93 KiB |

The original local run did not include browser or production acceptance. The later Ego Browser observations above are partial and did not close a parent checklist item.
