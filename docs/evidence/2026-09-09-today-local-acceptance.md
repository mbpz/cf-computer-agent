# Today 聚合本地验收证据（2026-09-09）

## 范围

本记录覆盖 P2-C C4 的本地纵向切片：成员私有 Today 聚合 API、前端 Today 页面、`/today` 路由能力、双语文案和有界数据合同。

## 实现

- API：`GET /api/today`，只接受已认证 member，拒绝 query 参数。
- 聚合：今日任务（20 条）、任务状态摘要、Inbox（10 条）、活动项目（10 条）、当日日程（20 条）。
- 前端：`frontend/pages/today-page.tsx` 展示日期、四项指标、任务列表和日程列表，加载/失败/空态不输出 `undefined`。
- 约束：所有查询由认证 principal 推导 `member_id`；不引入 R2、Vectorize、Queues、第三方分析或新鉴权。

## 本地验证

- `test/unit/today-service.test.ts`：聚合结构和固定上限。
- `test/unit/frontend-today-page.test.tsx`：双语页面和无 `undefined` 输出。
- `test/worker/today.test.ts`：D1 + Worker 路由、成员隔离、query 拒绝。
- `npm run typecheck`、`npm run verify:i18n`：通过。

## 边界

本证据只代表当前隔离工作树的本地实现，不代表 main 已合并、生产 D1 migration、Worker 部署、生产 smoke 或 signed browser acceptance。
