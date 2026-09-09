# Projects vertical slice local acceptance

日期：2026-09-09  
分支：`codex/memory-garden-2.0-workbench-core`

## Scope

本记录覆盖 Project 的本地纵向切片：D1 schema、成员隔离、Goal/Task 关系、幂等、摘要 API、双语 `/projects` 页面和本地回归。没有生产 D1 migration、Worker 部署、域名 smoke 或 signed browser 验收。

## Evidence

- `0040_workbench_projects.sql` 创建 `projects`、`project_goals`、`project_tasks`、索引和 `/projects` 菜单入口。
- `src/projects/repository.ts` 的项目与关系读写都包含 `member_id` 条件；summary 只返回拥有者的有界计数和最多 10 个目标。
- `src/projects/service.ts` 在关系写入前调用 Goal/Task owner lookup；重复关系由唯一键和 `INSERT OR IGNORE` 收敛。
- `/api/projects` 只从认证 principal 取得 member id；客户端传入 `memberId` 或未知字段会被拒绝。
- `/projects` 页面提供创建、状态、归档/恢复、进度摘要、关联目标标题和任务完成计数；文案通过 en/zh-CN catalog 输出。

## Local commands

```bash
rtk npx vitest run test/unit/projects-service.test.ts test/unit/projects-route.test.ts test/unit/frontend-projects-page.test.tsx test/worker/projects.test.ts --pool=workers
rtk npm run typecheck
rtk npm run verify:i18n
rtk npm run verify:m1:migrations -- --files
rtk npm run test:smoke
```

结果：Project 专项 12 tests passed；typecheck、i18n、migration file verification 和 smoke/delivery contracts passed。

## Known boundaries

项目成员管理、时间线、会议、决策、Project home 聚合以及生产 migration/deploy 不在本切片内。
