# 子任务删除后新增、位置冲突与原请求恢复证据

日期：2026-10-10。范围：A02 / C01 的共享任务编辑器子任务写入链路；本地实现及回归，不是原生或生产验收。

## 问题与 RED

- 前端把 `subtasks.length` 当成位置。删除非末尾项后，剩余位置不是连续下标；新增可能撞上已有位置。稀疏位置同样会被误判。
- 数据库有 `UNIQUE(task_id, position)`。创建遇到占位时 `INSERT OR IGNORE` 不插入，服务却返回 404；更新占用位置则触发未转换的数据库异常，客户端把确定拒绝误当成未知结果。
- 创建预检后父任务被删除时，原 INSERT 触发外键错误，而不是按当前归属返回 404。

新增行为测试首次实际执行：**10 失败 / 6 通过**。日志 `/private/tmp/cf-subtask-ordering-red.log`。之前的沙箱 `listen EPERM` 是环境失败，不计为 RED。复现均来自 DOM 断言或真实 Workerd/D1 的状态与数据断言。

## 修改链路

- `frontend/lib/tasks-data.ts`：`nextSubtaskPosition` 优先选最大位置之后的空位；达到既有 API 上限 10000 时重用空位，不改写已有位置。全部 0–10000 均被占用时返回 null，表单不发请求。
- `frontend/pages/tasks/task-editor.tsx`：提交前选择空位，并将位置和唯一子任务 ID 一起存入既有写入意图。未知请求恢复/重试不重新计算位置、不换 ID。
- `src/routes/tasks.ts`：沿用会话成员校验和现有路由，无请求格式变化。
- `src/tasks/repository.ts`：创建 SQL 同时校验父任务成员归属，防预检后删除；移动位置在 UPDATE 同一语句内排除其他子任务占位，并保留 expectedUpdatedAt 条件。
- `src/tasks/service.ts`：创建占位以及更新未命中但目标仍存在时返回既有 409 冲突；删除或跨成员目标仍为 404。409 由现有前端冲突链路重新读取，保留草稿，等待用户显式提交。
- 不重新排序既有记录，不新增迁移，不自动重试、不修改 API 兼容语义。位置上限处的空位复用不保证新项在列表末尾。

## 测试覆盖

新增 **26 项**：真实 D1 11 项、任务页 DOM 7 项、空位选择单元测试 8 项。

- 删除非末尾项后新增；稀疏/乱序位置、边界 10000、边界空位复用与满容量。
- 创建/更新占位返回 409，不改变任何原记录字段/版本；预检后占位竞态、同位置不同请求竞争。
- 相同 ID 并发创建及原参数重放只保留一行；存储失败后的同编号、同位置重试。
- 同版本竞争移动只有一个胜者；同字段旧版本重放不再次推进版本。
- 父任务预检后删除及跨成员、跨父任务 ID 冲突不暴露记录。
- 未知请求刷新后重试保留原 ID/位置；重试被 409 拒绝也保留未知记录，不能用后一次拒绝断言第一次没写入。
- 写入已经提交但响应丢失：刷新后只读精确核对或同请求重试，均不重复创建。
- 首次确定 409 保留草稿、读取新列表；用户再次提交才选择新位置及新 ID。

初步五文件回归 **61/61 通过**（后续又补充边界用例）；最终扩大回归 **44 文件 / 735 项全部通过**。扩大测试中发现新测试的 UUID mock 被导航初始化提前消耗，调整为只在提交前设置；原实现不因此改动。全量 `npm run check` 已完成，退出码 **0**：单元测试 **355 文件 / 4872 项**、Worker 测试 **69 文件 / 1161 项**全部通过；包含类型、smoke/i18n/交付契约、前端构建、landing 校验、构建产物凭据扫描、legacy 引用审计和 Wrangler `--dry-run`。不是实际部署。

命令：

```sh
rtk proxy npx vitest run test/unit/frontend-task-structure.test.tsx test/worker/task-subtask-ordering.test.ts test/unit/tasks-service.test.ts test/worker/task-structure.test.ts test/worker/tasks.test.ts
rtk proxy npx vitest run test/unit/*task*.test.ts test/unit/*task*.test.tsx test/unit/*graph*.test.ts test/unit/*graph*.test.tsx test/unit/*focus*.test.ts test/unit/*focus*.test.tsx test/worker/*task*.test.ts test/worker/graph-actions.test.ts test/worker/focus.test.ts test/unit/project-timeline-service.test.ts
rtk proxy npm run typecheck
rtk proxy npm run audit:frontend-operations
rtk proxy npm run audit:workbench-domain
rtk proxy npm run check
```

类型检查通过；前端操作清点已按改动重新生成，仍为 270 sources / 1168 candidates，领域审计通过。checklist、成熟度、交付和操作清点四组文档契约 **64/64** 通过，`git diff --check` 通过。

日志：
- `/private/tmp/cf-subtask-ordering-green.log`
- `/private/tmp/cf-subtask-ordering-expanded.log`
- `/private/tmp/cf-subtask-ordering-types.log`
- `/private/tmp/cf-subtask-ordering-audits.log`
- `/private/tmp/cf-subtask-ordering-full-check.log`
- `/private/tmp/cf-subtask-ordering-contracts.log`

## 未关闭范围

- A02/C01 父项及共享编辑器全部 gap 不因本次局部测试自动关闭；收件箱入口逐路径撤权/恢复及真实成员旅程仍需完整证据。
- 只读核对的是原 ID 的当前字段，不是永久历史操作账本；不声称证明某次历史写入在任意后续修改之后的精确结果。
- 子任务编辑/删除、其他任务操作的全部未知结果/权限边界不由本次用例替代。
- 无 push、merge、生产发布或远程迁移。本地构建/dry-run 不代表生产验收。
- 父 checklist 纳入 29 / 完成 5 / 剩余 24；D08 用户排除。目标仍在进行。
