# 图谱动作回执身份与丢失恢复（本地）

基线 `aa40bf0f`；2026-10-10；分支 `codex/functional-checklist-completion`。归属 A02/C04，不关闭父项。

## 问题与修复

图谱四个动作复用三个创建端点，但 dispatchGraphAction 此前接受任意成功 HTTP 的 JSON，甚至 `{}`；GraphPage 随即清除未决记录并解锁，用户下一次点击会生成新编号。页面关于畸形回执保持未知的注释此前没有对应实现。

现在任务创建核对 `task.id`，专注启动核对 `session.id/clientKey/taskId`，项目与决策时间线核对 `item.id/clientKey/projectId`，全部要求 `created` 为布尔值。错误结构、编号或目标均抛出未知回执错误，沿用已有离开锁、标签页持久化与原意图显式重试；不自动重发。只比较不可变身份，不要求可编辑标题、状态等仍等于创建时值。

任务创建回放目前不返回 link，因此此处不声称回执证明知识关联仍然存在，也不改变任务创建与关联的服务端事务边界。任务创建中的插入/关联失败及重放修复是下一项需核验的链路。

## 接线证据

| 动作 | 前端与 API | 授权及持久化 | 本轮真实验证 |
| --- | --- | --- | --- |
| 知识创建任务 | GraphPage → dispatchGraphAction → POST /api/tasks | src/routes/tasks.ts 的 tasks:use/member；TasksService/TasksRepository；tasks 与知识关联 | 客户端接真实 Worker；成功写入后隐藏回执、按原 ID GET、原请求重发返回 created:false、另一成员 GET 404、记录数为 1 |
| 任务启动专注 | 同上 → POST /api/focus | src/routes/focus.ts 的 tasks:use/member；FocusService；focus_sessions | 同上，核对任务与操作身份 |
| 项目里程碑 | 同上 → POST /api/projects/:id/timeline | src/routes/project-timeline.ts 的 tasks:use/member；ProjectTimelineService.requireProject；project_timeline_items | 同上，核对项目与操作身份 |
| 决策行动项 | 同上 → 同一 timeline 端点 | 同上；项目来自节点项目链接 | 同上；独立编号与 action_item 路径 |

## RED → GREEN 与回归

- 新增 7 个动作客户端反例、1 个实际 React 页面反例：修复前 **8 失败 / 25 通过**。客户端将畸形/异目标回执报告 completed；页面在 `200 {}` 后消失未确认提示。
- 修复后同组 **33/33**。页面验证原记录跨重挂载保留、不自动重发、显式重试发送原载荷，仅匹配回执清除记录并允许离开。
- 旧成功 fixture 曾使用顶层 `{id:"focus-1"}` 或不相符编号；改为完整、带域类型约束的真实响应结构，没有放宽异常断言。
- 新增 4 个 Worker/D1 完整链路用例；扩展图谱全组最终 **14 文件 104/104**。
- Worker/前端 typecheck、UI 构建和 VM 静态隔离检查通过。构建仍提示既有大 chunk 警告；不等于运行时/性能验收。
- 操作清点无漂移：270 源文件、1165 候选，不等于运行时覆盖。

```sh
rtk proxy npx vitest run test/unit/*graph*.test.ts test/unit/*graph*.test.tsx test/worker/graph-actions.test.ts test/unit/project-timeline-service.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy npm run audit:frontend-operations
rtk proxy node --test scripts/frontend-operation-inventory.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs
rtk proxy npm run audit:functional-checklist
```

## 剩余与边界

原30、范围内29、已关闭5、未关闭24，D08排除。A02逐项完整映射、C04真实身份/原生浏览器旅程仍未关闭；本轮精确 GET 为真实本地 API 验证，不冒充图谱页面新增了只读查询按钮。未 push、部署、迁移或生产验收；测试使用本地 Worker/D1，当前运行配置自动加载开发变量，不作为线上身份凭证。

## 2026-10-10 后续：知识任务事务与完整回放

上述基线中的任务插入/关联失败缺口已在后续本地修复：任务、关联与成功审计同批提交，回放重新授权并返回 link，前端同时核对 task/link。33 文件 507/507，见[原子性证据](./navigation-knowledge-task-atomicity-evidence.md)。此前段落保留为历史边界；图谱页面只读查询入口仍未实现，不将精确 API GET 替代页面验收。

## 后续增量：2026-10-10 精确查询入口

上述基线后已本地挂载查询入口，并修复未决重试404/409误清编号；不再以这类拒绝推断原写入未保存。新鲜验证与边界见 [精确查询证据](./navigation-graph-exact-result-evidence.md)。保留本文原批次数字，不将增量视作原生或生产验收。
