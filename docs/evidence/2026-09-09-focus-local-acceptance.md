# Focus 专注模式本地验收证据（2026-09-09）

## 范围

本记录覆盖 P2-C C5：专注状态机、成员隔离、幂等、Calendar focus block 和刷新恢复。

## 实现

- `POST /api/focus`：启动专注并绑定 member/task，创建统一 Calendar focus block。
- `GET /api/focus/current`：只返回当前成员的 active/paused session。
- `POST /api/focus/:id/pause|resume|complete|abandon`：状态迁移可重复调用，重复终态不会产生额外写入。
- `focus_sessions` 使用 partial unique index 保证同一成员最多一个 open session。
- 前端 `/focus` 页面支持启动、暂停、继续、完成、放弃；刷新时重新读取 current。

## 本地验证

- `test/unit/focus-service.test.ts`：幂等、暂停、恢复、elapsed 累计。
- `test/unit/frontend-focus-page.test.tsx`：状态文案和无 `undefined` 输出。
- `test/worker/focus.test.ts`：D1 migration、Calendar 联动、成员隔离和跨成员拒绝。
- `npm run verify:m1:migrations -- --files`：`count=43`。
- `npm run typecheck`：通过。

## 边界

本证据只代表当前隔离 worktree 的本地实现，不代表 main 合并、生产迁移、Worker 部署、生产 smoke 或 signed browser acceptance。
