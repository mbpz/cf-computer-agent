# 知识创建任务的原子性与同编号回放（本地）

基线 `adf8e287`；2026-10-10；分支 `codex/functional-checklist-completion`。归属 B09/C01，覆盖 A02 图谱动作接线，不关闭父项。

## 缺陷与处理

原创建流程先插入任务和 task.created 审计，再检查/插入知识关联；同 ID 任务存在时直接返回成功。不存在的知识会留下任务，关联失败后的重试会报告完成但没有关联，撤权后的回放也跳过知识授权。

- 新增 repository 原子写入：任务、初始知识关联、task.created 与 task.linked 两条成功审计在同一 D1 batch 中提交。SQL 内重新校验成员/知识/空间可见性及任务额度；冲突败方不补链、不产生成功审计。关联或任一审计失败整体回滚。
- 同编号回放重新授权并返回相同 task/link；同编号不同知识目标冲突，不让并发败方追加关联。跨成员编号返回 404。
- 旧半成品、普通既有任务和主动移除的关联无法可靠区分，返回 TASK_CREATE_CONFLICT（409），不自动补链、不宣称成功。不以本次修复自动修理历史数据。
- 图谱客户端必须同时验证 task.id 与 link.taskId/knowledgeItemId。缺失/错误关联回执仍为未知状态，页面保持成员分区 sessionStorage 记录和离开锁；重挂载不自动发出请求，显式重试沿用原 ID/载荷。
- 只比较不可变身份，不要求标题等可编辑内容仍与创建时相同。

## 实测证据

- 隔离导出已提交 HEAD，并加入当前 15 条真实 Worker/D1 故障回归：**13 失败 / 2 通过**。失败为错误状态/残留写入/缺失关联等行为断言，不是导入或 fixture 错误。
- 初始开发 RED 曾包含一个重复 source_version_id 的 fixture 错误；该 fixture 已修正，不将其算作产品缺陷。以上隔离 HEAD 重跑使用修正后的 fixture。
- 最终任务/图谱/时间线相关 **33 文件 507/507** 通过，包括 15 条真实 D1 用例：不存在/撤权目标、三处事务故障及重试、完整回放、旧无关联记录、同 ID 同/异目标并发、跨成员拒绝、过期授权/额度预检、关联 ID 冲突、真实 dispatcher→HTTP→精确 GET。
- 新增前端拒绝缺失/异目标 link 的用例；实际 React 页面用例验证跨重挂载保留原操作，直到完整回执才清除记录。
- 清单/成熟度/操作清点契约 **34/34**，操作清点无漂移（270 源文件 / 1165 候选），清单审计仍为 29/5/24。
- Worker/前端类型检查、UI 构建及 VM 静态构建隔离检查通过。既有大 chunk 警告仍在，不据此宣称性能验收。

```sh
rtk proxy npx vitest run test/unit/*task*.test.ts test/unit/*task*.test.tsx test/unit/*graph*.test.ts test/unit/*graph*.test.tsx test/worker/*task*.test.ts test/worker/graph-actions.test.ts test/unit/project-timeline-service.test.ts
rtk proxy npm run typecheck
rtk proxy npm run build:ui
rtk proxy node --test scripts/frontend-operation-inventory.test.mjs scripts/functional-checklist-audit.test.mjs scripts/workbench-maturity-contract.test.mjs
rtk proxy npm run audit:frontend-operations
rtk proxy npm run audit:functional-checklist
```

## 边界与下一步

原30 / 范围29 / 已关闭5 / 未关闭24，D08排除。B09真实双账号跳转撤权、C01原生完整任务旅程仍开放。精确查询已经通过本地 API GET 验证，不代表图谱页面已有只读查询按钮；该入口是下一条待补链路。

没有迁移、push、部署或生产验收。普通不带初始知识关联的任务创建保持原流程，不能把此事务保证扩展成所有任务写入均原子。测试使用本地 Worker/D1；运行配置自动加载开发变量，但不作为线上身份或生产结果证据，未读取/上传 SECRETS_FILE。

## 后续增量：2026-10-10 精确查询入口

上述基线后已本地挂载查询入口，并修复未决重试404/409误清编号；不再以这类拒绝推断原写入未保存。新鲜验证与边界见 [精确查询证据](./navigation-graph-exact-result-evidence.md)。保留本文原批次数字，不将增量视作原生或生产验收。
