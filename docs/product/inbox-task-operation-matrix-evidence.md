# 收件箱共享任务编辑器：逐操作恢复矩阵

日期：2026-10-10。基线 `31d1bf38`；分支 `codex/functional-checklist-completion`。
范围：本地 App 路由、TaskEditor、Worker/D1 回归与缺口证据绑定。无 push、merge、部署、远程迁移或原生浏览器验收。

## 本次交付

新增 `test/unit/frontend-inbox-task-operation-matrix.test.tsx`，使用实际 App → Inbox 已转任务行 → Open task → TaskEditor → 表单/按钮。不是直接调用 intent helper 的单元测试，也不是仅预填 sessionStorage 的恢复测试。每条写入在网络开始前断言当前成员、目标和原意图已持久化；API 路径、方法、字段与版本期望独立列举，没有复用被测 run/check 函数生成期望。

| Gap slug | 实际操作 | 首次请求约束 | 当前结果读取 |
| --- | --- | --- | --- |
| target-update-task | PATCH 详情 | expectedUpdatedAt + 标题/备注/优先级/截止时间 | 原 taskId 详情 |
| target-task-status | POST 状态 | expectedStatus + 新状态 | 原 taskId 状态 |
| target-append-progress | POST 进度 | expectedUpdatedAt + 绝对进度 | 原 taskId 进度 |
| target-replace-tags | PUT 标签 | expectedUpdatedAt + 标签集合 | 原 taskId 标签集合，顺序无关 |
| target-create-link | POST 知识关联 | expectedUpdatedAt + knowledgeItemId | 原 taskId 中精确知识 ID |
| target-delete-link | DELETE 关联 | expectedUpdatedAt + 原 linkId | 原 taskId 中原关联是否存在 |
| target-create-subtask | POST 子任务 | 一次生成的 subtaskId + 稀疏位置后继 8 | 原 taskId 中精确 subtaskId/字段/位置 |
| target-update-subtask | PATCH 子任务 | 原 subtaskId + 子项 expectedUpdatedAt | 原 taskId 中精确子项/字段/位置 |
| target-delete-subtask | DELETE 子任务 | 原 subtaskId + 子项 expectedUpdatedAt | 原 taskId 中原子项是否存在 |
| target-create-dependency | POST 依赖 | expectedUpdatedAt + dependsOnTaskId | 原 taskId 的精确依赖目标 |
| target-delete-dependency | DELETE 依赖 | expectedUpdatedAt + dependsOnTaskId | 原 taskId 中原依赖是否存在 |

所有 slug 前缀均为 `workbench-inbox:query_or_idempotency:`。缺口账的这 11 条 Focused test 已绑定新矩阵；稳定 gap 身份、主责 atom、优先级及父项状态不变。

## 每个操作的 10 项行为验证

1. 实际表单提交、同事件双击只发一次；503 后强制刷新恢复原意图，无自动重发；显式重试同事件双击也只发一次，409 保留原请求参数；最终精确 GET 确认当前结果，无额外写入。
2–3. 精确结果 GET 返回 401/403，清除任务表单和私有 Inbox 行，保留原记录，允许离页。
4–5. 同意图重试返回 401/403，清除私有界面但不能据后一次拒绝抹除先前未知记录。
6. 核对 GET 503 保留原记录和离页锁；恢复后只用 GET 收敛。
7. 首次明确 409 清理失败写入记录、读取新版本并保留独立编辑；只有显式再次提交才发新请求，携带新版本。
8. 写入成功后详情 GET 失败，恢复按钮只重读，不重复写。
9. 当前资源尚未匹配意图时不展示“已保存”，无额外写入。
10. 模拟服务端状态已更新但传输抛 TypeError，刷新后仍保留原记录；明确 GET 核对原对象后清理，没有第二次写入。

初轮 6 个失败是测试夹具选中了非输入节点；修正为 input/select 精确选择器后 66/66，通过扩大冲突与后读矩阵到 99/99。这些不是业务缺陷 RED，不声称本轮修改了业务代码。

最终 11 × 10 = **110 项新矩阵测试通过**；任务/收件箱扩大回归 **37 文件 / 790 项通过**（包含上述 110 项及真实 Worker/D1）；Worker 与前端类型检查通过；四组文档契约 **64/64 通过**。本轮只改测试与证据，不重跑全量 `npm run check`，不将前一提交的全量结果表述为本轮新结果。

复现命令：

```sh
rtk proxy npx vitest run test/unit/frontend-inbox-task-operation-matrix.test.tsx
rtk proxy sh -c 'npx vitest run test/unit/*task*.test.ts test/unit/*task*.test.tsx test/unit/*inbox*.test.ts test/unit/*inbox*.test.tsx test/worker/*task*.test.ts test/worker/inbox.test.ts'
rtk proxy npm run typecheck
rtk proxy node --test scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs scripts/delivery-status-contract.test.mjs scripts/frontend-operation-inventory.test.mjs
```

实际扩大回归日志 `/private/tmp/inbox-task-matrix-regression.log`，类型 `/private/tmp/inbox-task-matrix-types.log`，文档契约 `/private/tmp/inbox-task-matrix-contracts.log`。

## 后端证据边界

DOM 测试的网络是独立夹具，不证明 SQL 原子性或服务端授权。单独运行以下现有真实 Worker/D1 回归作为后端证据：

- `test/worker/tasks.test.ts`：HTTP 同版本冲突、相同请求重放、跨成员 404；当前成员和知识可见性投影。
- `test/worker/task-related-writes-atomicity.test.ts`：标签/关联真实关系写入时版本竞态、事务回滚、同请求收敛和跨成员拒绝。
- `test/worker/task-dependency-atomicity.test.ts`：依赖关系及父版本原子性、并发重复与成员边界。
- `test/worker/task-subtask-ordering.test.ts`：稀疏位置、重复子项 ID、事务/位置冲突和跨成员拒绝。
- `test/worker/task-structure.test.ts`：仅 schema 排序/依赖约束；不再单独把它作为 Inbox 入口恢复的证明。
- `test/worker/inbox-task-promotion.test.ts` 与原 `frontend-inbox-promotion-recovery.test.tsx`：转换、归属、页面恢复和创建分支不可达的独立证据。

## 尚未关闭

- 原始 checklist 30，D08 排除；纳入 29 / 完成 5 / 剩余 24。A02/C01/C04/R4 父项不因本矩阵通过自动完成。
- 共 13 条 Inbox target gap 中，本次绑定 11 条直接表单写入；`target-editor-create` 仍由原入口不可达测试负责，`target-delete-task` 属于 R4-010 的删除/软删除/恢复工作，不把无删除按钮当成功能完成。
- 这是当前状态核对而非永久历史操作账本。后续修改可能改变被核对资源，不能宣称永久精确历史结果。
- 真正两账号原生 UI、完整二级对象撤权时序、所有字段/状态组合及生产环境没有被本矩阵替代；DOM 与 Worker 测试分层运行，不声称是同一浏览器直连真实 Worker 的端到端测试。
