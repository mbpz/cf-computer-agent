# 任务依赖关系：版本与写入的原子性证据

日期：2026-10-10。范围：A02 / C01 的本地任务依赖添加、移除链路。

## 复现与修复

原实现先由 `TasksService.claimVersion` 更新父任务，再独立 INSERT / DELETE 依赖。
本地真实 Workerd/D1 测试证实两个问题：

1. 依赖 INSERT / DELETE 抛错时，关系未改变，但父任务版本已被消耗。使用相同 taskId、dependsOnTaskId、expectedUpdatedAt 重试会冲突。
2. 服务层版本检查完成后、实际关系写入前发生并发更新，旧请求仍能修改关系。

现改为在关系 SQL 内检查 member_id、task_id、expectedUpdatedAt；关系变更和仅在实际变更后发生的父版本推进使用同一 D1 batch。任一语句失败均不留下部分变更。重复添加、缺行删除和未命中 CAS 不推进版本。服务层保留原有成员隔离、重复添加收敛以及版本冲突语义，不新增自动重试。

## 操作绑定

| 环节 | 实际代码 |
| --- | --- |
| 用户入口 | `frontend/pages/tasks/task-editor.tsx` 的 dependency-add 表单和 dependency-remove 按钮 |
| 持久化重试意图 | `frontend/lib/task-write-intent.ts` 保留 taskId / dependsOnTaskId / expectedUpdatedAt；本次未改动 |
| API 请求 | `frontend/lib/tasks-data.ts` 的 addDependency / removeDependency |
| HTTP 路由 | `src/routes/tasks.ts` 的 POST `/api/tasks/:taskId/dependencies`、DELETE `/api/tasks/:taskId/dependencies/:dependsOnTaskId` |
| 授权及业务 | `src/tasks/service.ts` 的会话成员归属检查及 addDependency / removeDependency |
| 持久化 | `src/tasks/repository.ts` 的带版本条件关系写入与 mutateRelation 原子 batch（原名 mutateDependency） |
| 读取核对 | 原有 GET `/api/tasks/:taskId/dependencies` 按成员和父任务读取，再匹配 dependsOnTaskId；不是不可变历史操作账本 |

## 测试证据

新增 `test/worker/task-dependency-atomicity.test.ts` 共 12 项：

- INSERT / DELETE 关系失败，各自确认版本及关系回滚；移除故障后原请求可成功重试。
- 父任务更新失败，各自确认此前的关系变更也回滚。
- 在服务预检后注入并发父任务更新，两种关系变更均拒绝并保留原关系。
- 不同目标竞争同一版本仅一方成功；相同目标竞争收敛为一条关系、一次版本推进。
- 同请求重放、正常移除、再次移除、duplicate / absent-row no-op、成员隔离。
- 保留历史未携带 expectedUpdatedAt 的 API 行为；此兼容路径不宣称具有版本 CAS 保护。

最初 9 项在修复前为 **4 失败 / 5 通过**，失败直接来自版本被消耗和旧请求越过并发写入，不是环境失败。修复后最初三文件 **52/52**；加上额外边界覆盖后的扩大回归 **42 文件 / 685 项全部通过**。

```sh
rtk proxy npx vitest run test/worker/task-dependency-atomicity.test.ts
rtk proxy npx vitest run test/worker/task-dependency-atomicity.test.ts test/worker/tasks.test.ts test/unit/tasks-service.test.ts
rtk proxy npx vitest run test/unit/*task*.test.ts test/unit/*task*.test.tsx test/unit/*graph*.test.ts test/unit/*graph*.test.tsx test/unit/*focus*.test.ts test/unit/*focus*.test.tsx test/worker/*task*.test.ts test/worker/graph-actions.test.ts test/worker/focus.test.ts test/unit/project-timeline-service.test.ts
rtk proxy npm run typecheck
rtk proxy npm run audit:frontend-operations
rtk proxy npm run audit:workbench-domain
```

Worker + frontend 严格类型检查通过；操作清点保持 270 sources / 1168 candidates，领域审计证据仍匹配。真实 HTTP 版本冲突和重复提交测试包含在扩大回归中。checklist、成熟度、交付状态、前端操作清点四组文档契约共 64/64 通过，`git diff --check` 通过。

本机日志：

- `/private/tmp/cf-dependency-atomic-red.log`
- `/private/tmp/cf-dependency-atomic-green.log`
- `/private/tmp/cf-dependency-atomic-expanded.log`
- `/private/tmp/cf-dependency-atomic-types.log`
- `/private/tmp/cf-dependency-atomic-audit.log`
- `/private/tmp/cf-dependency-atomic-contracts.log`

## 未关闭的边界

- A02、C01 父项及任务/收件箱 11 个共享编辑器操作 gap 仍保持开放。本次只证明依赖写入的原子性与相关本地回归，不证明所有入口的原生身份旅程、撤权、未知结果与离页体验全部验收。
- 未修复/验收标签和知识链接路径中独立版本声明与写入的其余原子性风险；下一步需分别复现、修复及验证，不能据此扩大结论。
- 本次没有 schema 变更、SQL 迁移执行、push、merge、Cloudflare 发布或生产写入。
- checklist 仍为纳入 29 / 完成 5 / 剩余 24；D08 按用户要求排除。

## 后续关联修复

2026-10-10 标签及知识链接三路径的原子性和链接写入时校验已补充本地实现与测试，见[后续证据](./task-related-writes-atomicity-evidence.md)。上文保留当时未关闭边界；此次补充不提升整体 A02/C01 或原生验收状态。
