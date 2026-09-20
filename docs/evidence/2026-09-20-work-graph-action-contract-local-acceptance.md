# Work Graph Action Contract 本地验收证据

日期：2026-09-20

范围：`WB-GR-001` / `GR-ACT-01` 的 Graph → Action dispatcher 契约切片。此切片只验证前端根据节点类型生成成员无关的请求，并保留调用方提供的稳定 `clientKey`；不代表 Graph Inspector 已完成按钮接入，也不代表生产部署或浏览器验收完成。

## 已验证

```bash
rtk npx vitest run test/unit/frontend-graph-actions.test.ts --pool=threads --maxWorkers=1
rtk npm run typecheck
rtk node --test scripts/frontend-app-contract.test.mjs scripts/delivery-status-contract.test.mjs
git diff --check
```

结果：Graph Action dispatcher 6/6；TypeScript 通过；交付契约 36/36；差异检查通过。实现提交：`8f3e7c6`。

已覆盖：

- knowledge 节点 → `/api/tasks`，创建任务时只发送知识条目标识，不接受客户端 `memberId`；
- decision 节点 → 项目 timeline `action_item`；
- task 节点 → `/api/focus`，重试时保持同一 `clientKey`；
- project 节点 → 项目 timeline；
- 不支持的节点类型返回 `deferred`，不发起请求；
- 空 `clientKey` 被拒绝，不临时生成重试身份。

## 边界与下一步

- 当前 dispatcher 仍未接入 `GraphInspector` 的可见 action button；
- 尚未添加 Worker 级 action route/幂等回读 fixture；
- 尚未完成 Graph Action 的生产部署、远程 migration 或 signed browser acceptance；
- 下一切片为 Inspector action button、请求中/成功/失败/重试状态，以及键盘可达性测试。
