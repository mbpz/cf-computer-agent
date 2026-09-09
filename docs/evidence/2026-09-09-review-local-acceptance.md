# Daily/Weekly Review 本地验收证据（2026-09-09）

## 范围

本记录覆盖 P2-C C6：成员私有的每日/每周复盘快照、任务与 Inbox/项目/Focus 聚合、确定性 period key 和双语页面。

## 实现

- `GET /api/workbench/review?period=daily|weekly` 只接受认证 member，拒绝未知 query key。
- Daily 聚合完成项、逾期项、阻塞项、任务摘要、未处理 Inbox、活动项目和 Focus 投入时间。
- Weekly 使用固定 7 天范围和稳定的 `YYYY-Www` key。
- D1 `workbench_review_snapshots` 以 `(member_id, period, period_key)` 唯一键幂等保存。
- `/review` 页面支持每日/每周切换，展示完成、逾期、阻塞和专注分钟。

## 本地验证

- `test/unit/workbench-review-service.test.ts`：确定性快照和重复读取。
- `test/unit/frontend-workbench-review-page.test.tsx`：双语指标和无 `undefined` 输出。
- `test/worker/workbench-review.test.ts`：D1 migration、成员会话和 query 边界。
- `npm run typecheck`：通过。

## 边界

本证据只代表当前隔离 worktree 的本地实现，不代表 main 合并、生产迁移、Worker 部署、生产 smoke 或 signed browser acceptance；本阶段不自动使用 AI 写回任务或知识。
