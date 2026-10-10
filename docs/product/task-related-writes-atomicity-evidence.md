# 任务标签和知识链接：原子写入及写入时校验证据

日期：2026-10-10。范围：A02 / C01 共享任务编辑器的标签替换、知识链接添加与删除。本地证据，不是原生或生产验收。

## 问题及真实复现

原路径调用 `claimVersion` 后再独立写标签/链接。新增真实 Workerd/D1 测试最初 15 项为 **10 失败 / 5 通过**，失败包括：

- 三条写入路径失败后父版本已被消耗，无法用相同参数安全重试。
- 服务预检后父任务被并发更新，旧请求仍能修改三种关系。
- 链接插入前知识改为 admin_only、知识被移入回收站、空间禁用时，预检权限仍被沿用。
- 链接插入前其他写者填满 5 个链接容量，仍能写入第 6 个链接。

日志：`/private/tmp/cf-task-related-red.log`。失败均为实际断言反例，不是网络或测试环境失败。

## 实现链路

- 前端：`frontend/pages/tasks/task-editor.tsx` 的 tags/link/unlink 意图，经 `frontend/lib/task-write-intent.ts` 和 `frontend/lib/tasks-data.ts` 调用现有 API。本次没有改前端/API 请求格式或增加自动重试。
- 路由：`src/routes/tasks.ts` 使用会话 memberId，服务层继续验证任务归属、目标和 expectedUpdatedAt。
- `src/tasks/service.ts`：移除独立的 `claimVersion` 写入，向 repository 传递版本条件；CAS 未命中后只读核对并返回已有的冲突/未找到/不可见/容量错误。相同目标/标签重放仍收敛。
- `src/tasks/repository.ts`：标签 DELETE、所有 INSERT 和父版本推进放在同一 batch，各语句使用同一个父版本条件；支持空列表和原列表为空。
- 链接关系的版本条件放入 INSERT/DELETE SQL，随后在同一 batch 内仅对实际变更推进父版本。沿用依赖修复的辅助方法，现命名 `mutateRelation`。
- 链接添加 SQL 同时验证知识和空间状态、当前可见性、父任务成员归属及容量。未命中不写链接、不消耗版本。
- 旧 API 未传 expectedUpdatedAt 时仍允许写入；标签/链接仍按既有语义推进版本，并保证单调递增。这不等于旧调用已具备用户读取版本的 CAS 保护。

## 验证

新增 `test/worker/task-related-writes-atomicity.test.ts` **24 项**：

1. 标签/链接添加/链接删除的关系故障回滚及原参数重试；标签在第二个 INSERT 故障，证明已执行的 DELETE 和第一个 INSERT 同样回滚。
2. 三路径父任务推进失败，关系整体回滚。
3. 三路径预检后版本变更：包括竞争者版本恰好等于本请求拟写入的新版本，不用新版本相等冒充 CAS 成功。
4. 空标签、原列表为空、相同请求并发和重放、不同标签请求竞争同一版本。
5. 知识可见性/状态/空间撤回及容量竞态。
6. 未携带版本的兼容路径、duplicate/no-op、会话成员和 repository 级跨成员拒绝。

先完成的四文件回归 **70/70**；补充边界后的扩大回归 **43 文件 / 709 项全部通过**，含原依赖原子性、现有真实 HTTP、图谱、专注及任务前端恢复测试。

```sh
rtk proxy npx vitest run test/worker/task-related-writes-atomicity.test.ts test/worker/task-dependency-atomicity.test.ts test/worker/tasks.test.ts test/unit/tasks-service.test.ts
rtk proxy npx vitest run test/unit/*task*.test.ts test/unit/*task*.test.tsx test/unit/*graph*.test.ts test/unit/*graph*.test.tsx test/unit/*focus*.test.ts test/unit/*focus*.test.tsx test/worker/*task*.test.ts test/worker/graph-actions.test.ts test/worker/focus.test.ts test/unit/project-timeline-service.test.ts
rtk proxy npm run typecheck
rtk proxy npm run audit:frontend-operations
rtk proxy npm run audit:workbench-domain
```

Worker + frontend 类型检查通过；操作清点仍为 270 sources / 1168 candidates，领域审计匹配。checklist、成熟度、交付和前端操作清点四组契约 64/64 通过，`git diff --check` 通过。日志：

- `/private/tmp/cf-task-related-green.log`
- `/private/tmp/cf-task-related-expanded.log`
- `/private/tmp/cf-task-related-types.log`
- `/private/tmp/cf-task-related-audits.log`
- `/private/tmp/cf-task-related-contracts.log`

## 本轮全量门禁

同一轮最终代码执行 `rtk proxy npm run check`，退出码 **0**。日志：`/private/tmp/cf-task-related-full-check.log`。

- 单元测试：**355 文件 / 4857 项全部通过**。
- Worker 测试：**68 文件 / 1150 项全部通过**。
- vendor、类型生成一致性、Worker/frontend/landing 类型检查及 smoke 检查通过。
- 前端构建、landing 校验、构建产物凭据扫描及 legacy UI 引用审计通过。
- Wrangler 以 `--dry-run` 退出；未实际上传、部署、迁移或改动生产数据。

这补充当前提交的本地全量回归证据，不替代 D07 的功能完备前置条件，也不替代 D04–D06 的真实环境验收。

## 保留边界

- A02/C01 及任务/收件箱共享编辑器 gap 不整体关闭；其余操作、真实成员旅程、原生设备交互仍需逐项验证。
- 写后审计仍是原有服务层调用；本次只证明业务关系与父版本的原子性，不宣称审计与业务写入同事务。
- 未建立永久历史操作账本；现有只读核对仍核对目标当前状态。
- 未执行 schema 迁移、push、merge 或 Cloudflare 发布，未修改生产数据。
- 父 checklist：纳入 29 / 完成 5 / 剩余 24；D08 排除。
