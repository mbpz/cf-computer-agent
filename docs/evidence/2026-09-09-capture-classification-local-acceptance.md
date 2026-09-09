# Capture 分类建议本地验收证据（2026-09-09）

## 范围

本记录覆盖 P3-A 的最小安全纵向切片：Inbox 内容分类建议、成员隔离、幂等保存和显式 dismiss；promotion 不自动执行，继续由用户确认后调用现有转任务/转知识接口。

## 实现

- `POST /api/capture/:inboxId/classify` 返回 `task`、`knowledge` 或 `note` 建议、置信度和理由。
- 当前免费层默认使用可解释启发式分类，避免无提示的 AI 写回和额外服务成本；后续可在同一 service seam 接入 Workers AI。
- `POST /api/capture/:inboxId/dismiss` 只更新当前成员的建议状态。
- D1 `inbox_classifications` 以 `(member_id, inbox_id)` 唯一键收敛重复分类。

## 本地验证

- `test/unit/capture-service.test.ts`：行动文本分类和重复读取。
- `test/worker/capture.test.ts`：D1 migration、session、成员私有分类路由。
- `npm run typecheck`：通过。

## 边界

本切片不自动创建任务、知识或发布内容；必须由用户显式确认并调用既有 promotion API。本证据不代表生产 migration、部署或 signed browser acceptance。
