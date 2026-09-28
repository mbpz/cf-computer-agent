# C07 删除、恢复、保留与清理核对

日期：2026-09-28 UTC（本地 2026-09-29）。源码基线 `63fa1a4`。

## 交付边界与结论

C07 原文是“核对删除、恢复、保留期与清理是否已有实现；缺失部分单独设计”。本文件交付现状核对，[缺口设计](../superpowers/specs/2026-09-28-lifecycle-gaps-design.md)交付缺失部分的独立设计提案。**可以关闭 C07 核对任务，不能因此关闭 KB-012、TSK-009、NTF-005、MSG-005 或 D04 的功能交付。** 设计提案未等同用户批准实施，本轮没有新增删除接口、迁移或自动清理。

核对方法：逐个阅读下列 route/service/repository、迁移和前端调用点，再运行现有本地测试。关键字未命中仅作为定位辅助，不把“没有命中”当作全仓不存在的充分证明。没有执行真实用户删除、生产清理、备份或加密操作。

## 现状矩阵

| 对象 | 删除 / 隐藏 | 恢复 | 保留与清理 | 权限、入口和准确边界 |
| --- | --- | --- | --- | --- |
| 已发布知识 | `PublicationService.trash` 改为 trashed，保留版本，索引任务更新可见性；不是硬删除 | `restore` 回 active 并处理索引任务 | `TRASH_RETENTION_MS` 已是 30 天；`purge` 按 trashed 项的 `updated_at` 校验截止时间，清外部内容后才 finalize D1；`knowledge.purged` 审计支持已清理重放 | `src/routes/admin-review.ts` 的 trash 列表 GET、trash/restore/purge POST 均要求管理员；不是成员自助回收站。前端代码未发现这些路径的调用；完整 UI 未实现。不能写成“后端尚无回收站”。 |
| 任务 | `TasksRepository.delete` 按 member_id/id 硬删除；标签和链接等有数据库级关联删除 | 当前服务/路由无任务恢复方法 | 无软删保留期或任务 purge 队列；`TaskService.delete` 的审计在删除后调用，并非同一事务 | `src/tasks/service.ts`、`src/tasks/repository.ts`、`src/routes/tasks.ts`、`migrations/0032_workspace_tasks.sql`；跨成员仍 404。TSK-009 所需完整策略尚未实现。 |
| 通知 | 已读/批量已读不是删除；失效目标不再提供可访问深链 | 已读回读不是恢复已删除通知 | 当前 repository/service/route 无保留期、删除或清理接口；去重键仍与通知记录共存 | `src/notifications/{service,repository}.ts`、`src/routes/notifications.ts`；按 recipientMemberId。不能以目标失效处理完成代替 NTF-005 保留策略。 |
| 上下文讨论 | 任务或知识撤权/删除会收缩访问投影，不等于删除 thread/message | 重新授权可见不等于数据恢复 | 当前讨论服务/路由无消息删除/保留清理操作；多态 context_id 不是对任务/知识的删除级联外键；author/client key 重放语义不能在清理中丢失 | `src/discussions/{service,repository,authorization}.ts`、`src/routes/discussions.ts`、`migrations/0037_workbench_discussions.sql`；消息不扩展为私聊。MSG-005 保持 partial。 |
| 附件 / R2 对象 | queued 或 failed_retryable 上传可由 owner cancel；先删除 D1 记录，再 best-effort 删除对象，失败可能遗留孤儿 | 不支持取消后的用户恢复 | 已有管理员 orphan preview/reclaim，默认 24 小时宽限期；单次最多 50 个 key，限定 staging/parsed、检查年龄及引用后显式删除 | `src/assets/{service,repository}.ts`、`src/routes/admin.ts`；年龄/引用检查和 R2 delete 非跨资源原子事务。`src/worker-entry.ts:sweepAssets` 实际执行 `processDue(3)` 解析，不是定时孤儿清理。 |
| 浏览器环境元数据 | member/version/operationId 条件删除；同批保存 operation receipt 和 tombstone | 元数据删除后普通历史接口不得复活环境 | 墓碑由按账户隔离的前端 reconciler 分页重放；实际本地清理依赖注入 `removeLocalCopy` | `src/environments/{service,repository}.ts`、`frontend/features/environments/deletion-reconciler.ts`；当前前端未发现 reconciler 的生产调用/真实存储适配器。测试回调不是 OPFS/IndexedDB 物理擦除证明，D04 仍开放。 |
| Inbox / 目标 / 项目 / 日历 / 专注 | Inbox archived、目标/项目状态更新、日历 canceled、专注 abandoned/completed 是状态转换，不是数据物理清理 | Inbox 可回 inbox（promoted 不可按普通归档恢复）；其他按现有状态机，不承诺统一回收 | 所读模块没有统一 TTL/purge；项目移除关联不等于删除项目实体 | `src/inbox/service.ts`、`src/goals/service.ts`、`src/projects/{service,repository}.ts`、`src/calendar/service.ts`、`src/focus/service.ts`；沿用成员 scope 和各域版本条件，不能用“归档”代替“已删除”。 |
| 收藏 / 已保存视图 / 最近访问 | 收藏和视图的删除是 member 范围硬删除 | 再收藏/新建视图不是找回删除历史 | 最近访问写入后只保留该成员最新 200 项；是数量上限，不是天数保留策略 | `src/favorites/repository.ts`、`src/saved-views/{service,repository}.ts`、`src/recent-visits/repository.ts`；最近访问写入与裁剪是先后两条语句，不宣称同时写入时严格原子上限。 |
| 私有笔记 / 投稿 / AI 会话 / 研究产物 | 本次读取的现有服务/存储没有通用用户删除回收流程；投稿 reject、研究结果引用失效不是硬删除 | 未发现统一恢复 API | 未发现这些模块的统一保留清理策略；不从 API 分页/只取最近 N 条推导底层已删除旧行 | `src/private-notes`、`src/submissions`、`src/chat`、`src/research`；更细的版本/研究产物导出与恢复由 D03 逐项核对，不为 C07 扩建备份系统。 |

## 需要明确保留的风险

1. **知识跨存储竞态**：`PublicationService.purge` 先 `contentRemover.remove(plan.contentPaths)`，后 `finalizePurge`。D1 finalize 的条件检查能拒绝中途状态变化，但不能撤销已执行的外部内容删除。现有“item changes between planning and finalization”测试只证明 D1 行未删，其 remover 仅改状态，不证明真实内容在并发 restore 时安全。设计中的 purge claim/恢复互斥是缺失能力，不标成已修复。
2. **附件取消可能留下孤儿**：对象删除失败被通知后吞掉；已有孤儿回收提供补救路径，但没有本轮验证的自动调度。不能把 `sweepAssets` 名称当成自动回收证明。
3. **授权收缩不等于保留策略**：任务/知识消失后消息和通知可能留存，读取受限仍不代表正文已擦除；清理正文时还要保留必要的去重和回复结构，不能盲目删行。
4. **环境删除不等于擦盘**：元数据原子性、墓碑遍历与真正的本地副本清理是三个层次；本轮仅前两层有实现/测试。
5. 不宣称所有子能力已验证。小模块的 TTL 缺失来自源码核对；下面已跑文件也不自动证明每项竞态、原生界面或部署后的行为。

## 本次执行的验证

```sh
rtk proxy npx vitest run test/unit/publication-service.test.ts test/worker/m1-publication.test.ts test/unit/assets-service.test.ts test/worker/m2-assets.test.ts test/worker/tasks.test.ts test/worker/environments.test.ts test/unit/environment-deletion-reconciler.test.ts test/worker/recent-visits.test.ts test/worker/saved-views.test.ts
```

结果：**9 文件 382/382，通过，exit 0**。本地 Workerd/D1/DO 和 mock bucket，不调用生产删除或真实 AI provider。知识 purge 测试预期读取已删除路径失败，日志出现 `WorkspaceFsError: no such file`；对应拒绝断言通过，未将异常输出隐去或当成失败后跳过。

重点覆盖：知识 trash/restore、管理员边界、未到期限拒绝、过期 purge/tombstone/重放、清理失败手动重试与 D1 finalize 竞态；附件权限和有界孤儿回收；任务 owner 删除边界；环境删除 CAS/收据/墓碑与账户代次隔离；视图 owner 隔离与最近访问私有回读。文件级通过不替代上节列出的缺失测试。

同轮前一切片消息/通知/共享前端联合 12 文件 308/308，包括授权收缩和分页恢复；这两组数字有交叉领域，不相加宣称全仓覆盖。

## 后续归属

- KB-012：已有后端应记 partial，验证也仅 partial；补管理员生命周期 UI 与跨存储 purge/restore 互斥设计后才实施。
- TSK-009：保持 pending；软删除、恢复、到期清理、同事务审计和旧硬删除兼容未实现。
- NTF-005 / MSG-005：保持 partial；目标失效/授权收缩已做，数据保留、显式删除和防重放 tombstone 缺失。
- D04：环境真实副本 adapter 和正式入口仍开放；不引入云端备份。
- D03：继续版本/回收入口/导出恢复/研究产物对账，直接复用本表，不重复把已存在的知识后端称为未实现。
- C07 关闭仅表示本表和独立缺口设计已交付。原生验收仍需解锁 Mac 与真实身份会话；本地其他步骤允许继续。
