# Work Graph Inspector 本地验收证据

日期：2026-09-19

范围：`WB-GR-001` 的 Graph Inspector 本地 UI 切片，包括节点选择状态、nullable metadata 显示、双语文案和无 `undefined` 输出。

## 已验证

```bash
rtk npx vitest run test/unit/frontend-graph-inspector.test.tsx test/unit/frontend-graph-page.test.tsx
rtk npm run typecheck
rtk node --test scripts/frontend-app-contract.test.mjs scripts/delivery-status-contract.test.mjs
rtk npm test
```

结果：Inspector/GraphPage focused tests 10/10；结构与交付合同 36/36；完整 `npm test` 退出码 0。

Evidence Path 最小切片另通过 `test/unit/frontend-graph-evidence.test.tsx` 4/4：citation 详情只回读标题、修订、分块和位置，并生成 Reader 深链；原文正文不进入 Graph snapshot。

## 边界

- Inspector 只读取已授权 GraphNode 投影，不修改 Graph 或任何业务写模型。
- 空值统一降级为 `COMMON_VALUE_UNAVAILABLE` 的本地化文案；未发现 `undefined` 可见文本。
- 当前证据仅代表本地代码与测试，不代表生产部署、远程 migration 或 signed browser acceptance。
- Evidence Path 的 Worker 专用跨成员 citation 404 fixture、生产与 signed browser acceptance 仍待补。
