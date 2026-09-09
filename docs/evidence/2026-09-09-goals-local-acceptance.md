# Goals vertical slice local acceptance

日期：2026-09-09  
分支：`codex/memory-garden-2.0-workbench-core`

## Scope

本记录只覆盖 Goal 的本地纵向切片：D1 schema、成员隔离、client key 幂等、opaque cursor、Worker API、双语 `/goals` 页面和本地回归。没有生产 D1 migration、Worker 部署、域名 smoke 或 signed browser 验收。

## Evidence

- `0039_workbench_goals.sql` 创建 Goal 表、成员/幂等索引和 `/goals` 菜单入口。
- `src/goals/repository.ts` 所有查询和写入都包含 `member_id` 条件；cursor 同时绑定 member 与 status。
- `src/goals/service.ts` 校验标题、说明、日期、状态和 0–100 进度；重复 client key 返回已有 Goal。
- `/api/goals` 只从认证 principal 取得 member id；客户端传入 `memberId` 会被拒绝。
- `/goals` 页面提供创建、进度、完成、归档、恢复和加载更多；文案通过 en/zh-CN catalog 输出。

## Local commands

```bash
rtk npx vitest run test/unit/goals-service.test.ts test/unit/goals-route.test.ts test/unit/frontend-goals-page.test.tsx test/worker/goals.test.ts --pool=workers
rtk npm run typecheck
rtk npm run verify:i18n
rtk npm run verify:m1:migrations -- --files
```

结果：Goal 专项 12 tests passed；typecheck、i18n、migration file verification passed。

## Known boundaries

Goal 与 Project、Task 的关联尚未实现；0039 仍是待评审的本地追加 migration，不得据此执行生产迁移或部署。
