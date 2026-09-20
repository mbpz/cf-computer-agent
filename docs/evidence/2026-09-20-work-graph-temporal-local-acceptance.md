# Work Graph Temporal 本地验收证据

日期：2026-09-20

范围：`WB-GR-001` / `GR-TEMP-01` 的 Temporal Work Graph 本地切片。

## 已验证

```bash
rtk npx vitest run test/unit/graph-temporal-service.test.ts test/worker/graph-temporal.test.ts --pool=workers --maxWorkers=1
rtk npx vitest run test/unit/graph-contract.test.ts test/unit/graph-service.test.ts test/unit/frontend-graph-data.test.ts test/unit/frontend-graph-page.test.tsx --pool=threads --maxWorkers=1
rtk npx vitest run test/worker/graph.test.ts test/worker/graph-temporal.test.ts --pool=workers --maxWorkers=1
rtk npx vitest run test/unit/frontend-graph-page.test.tsx test/unit/frontend-graph-a11y.test.tsx test/unit/frontend-graph-canvas.test.tsx --pool=threads --maxWorkers=1
rtk npm run typecheck
rtk node --test scripts/frontend-app-contract.test.mjs scripts/delivery-status-contract.test.mjs
rtk git diff --check
```

结果：Temporal service/Worker focused tests 4/4；原有 Graph Worker 回归 7/7；GraphPage/Canvas/A11Y 回归 18/18；Temporal 契约、service 与前端 query tests 26/26；TypeScript、结构契约 36/36、差异检查均通过。

已覆盖：

- `from` / `to` 时间范围参数；
- 单边界缺失时默认补齐 7 天窗口；
- 双边界超过 90 天或倒置时返回 `GRAPH_QUERY_INVALID`；
- `added`、`updated`、`completed`、`archived` 变化类型；
- 结果只来自当前成员授权投影，跨成员对象不会进入 Graph snapshot；
- Graph cursor scope 包含时间过滤条件；
- 前端时间范围与变化类型双语控件；
- 现有无时间参数 Graph 行为保持兼容。

## 边界

- 当前变化类型基于现有状态与 `updatedAt` 投影，不新增 D1 表；
- 未执行远程 migration、生产部署或 signed browser acceptance；
- 仍需后续完成 Mindmap adapter、AI suggestions 与最终 release gate。
