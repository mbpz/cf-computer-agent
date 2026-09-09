# Task structure local acceptance

日期：2026-09-09  
分支：`codex/memory-garden-2.0-workbench-core`

## Scope

本记录覆盖 P2-C1 的任务子项和任务依赖后端纵向切片：D1 schema、owner-scoped repository/service/route、幂等、自环/跨成员边界和本地回归。没有生产 D1 migration、Worker 部署、域名 smoke、任务页面改造或 signed browser 验收。

## Evidence

- `0041_workbench_task_structure.sql` 创建 `task_subtasks`、`task_dependencies`、索引和成员复合外键；父任务删除会级联清理关系。
- `src/tasks/service.ts` 在关系写入前校验父任务和依赖任务均属于当前 member；重复 client id 或依赖边返回已有结果。
- `src/routes/tasks.ts` 只从认证 principal 取得 member id，并提供子项/依赖的有界 REST 边界。
- 子项 position 唯一、自依赖和跨成员依赖在 D1 层拒绝；服务层重复提交收敛。

## Local commands

```bash
rtk npx vitest run test/unit/tasks-service.test.ts test/worker/task-structure.test.ts --pool=workers
rtk npm run typecheck
rtk npm run verify:m1:migrations -- --files
```

结果：18 tests passed；typecheck 通过；migration file verification `count=41` 通过。

## Known boundaries

任务页面尚未展示子项/依赖；Calendar、Today、Focus、Daily/Weekly Review、生产 migration、部署和 signed browser 验收不在本切片内。
