# Calendar local acceptance

日期：2026-09-09  
分支：`codex/memory-garden-2.0-workbench-core`

## Scope

本记录覆盖 P2-C2 的内部日程与时间块后端纵向切片：D1 schema、owner-scoped repository/service/route、任务/项目关联、时间范围限制和本地回归。没有 Calendar 页面、生产 D1 migration、Worker 部署、域名 smoke 或 signed browser 验收。

## Evidence

- `0042_workbench_calendar.sql` 创建 `calendar_events`，用 `kind` 区分 `event` 和 `focus`，并以复合外键保护成员任务/项目关联。
- `src/calendar/service.ts` 校验标题、时间顺序、31 天范围、时区、关联 owner 和 client key 幂等。
- `/api/calendar/events` 支持 owner-scoped 日期范围列表、创建、读取、更新和取消；成员 id 只来自认证 principal。
- C2 不引入 R2、Queues、Vectorize 或第三方日历连接器。

## Local commands

```bash
rtk npx vitest run test/unit/calendar-service.test.ts test/worker/calendar.test.ts --pool=workers
rtk npm run typecheck
rtk npm run verify:m1:migrations -- --files
```

结果：4 tests passed；typecheck 通过；migration file verification `count=42` 通过。

## Known boundaries

Calendar 页面、Today 聚合、Focus lifecycle、Daily/Weekly Review、外部日历连接器、生产 migration、部署和 signed browser 验收不在本切片内。
