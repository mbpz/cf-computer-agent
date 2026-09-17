# Personal Work Graph 总实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在个人 AI 工作台中引入 Personal Work Graph，用 Cytoscape.js 连接知识、任务、项目、目标、会议、决策、行动项、日历和复盘，同时保持现有私有、免费层和安全边界。

**Architecture:** 图谱是跨领域只读投影，不拥有业务数据；服务端从各领域权威表生成经过 `member_id` 和对象可见性过滤的 GraphSnapshot，前端用动态加载的 Cytoscape.js 展示并通过现有领域服务执行写操作。3D Landing 继续独立运行，图谱只服务已登录工作台。

**Tech Stack:** Cloudflare Workers、D1、Durable Objects、Workers AI、React、TypeScript、Vite、Cytoscape.js、Vitest、Cloudflare Vitest Pool Workers、Tailwind/shadcn UI。

**Spec:** `docs/superpowers/specs/2026-09-17-personal-ai-work-graph-design.md`

## Global Constraints

- 仅支持 5–20 名受邀成员的私有工作台。
- 继续使用 Cloudflare 免费层，不引入新的付费基础设施。
- 保留 GitHub OAuth、D1 Session、HMAC Automation 和现有角色边界。
- 每个用户的数据查询和写入必须由认证 principal 推导 `member_id`。
- 所有列表和图谱结果必须有界；默认分页/限深，最大结果数由服务端强制。
- 所有创建和重试写入必须使用 client key 或等价幂等键。
- AI 只能返回草稿、建议或带证据的关系；不得自动发布、删除、改权限或调用任意外部工具。
- 不读取、不上传、不写入 `SECRETS_FILE`；生产迁移、部署和验收保持单独审批。

## 执行顺序

1. [后端合同与 Graph Projection](./2026-09-17-wb-gr-graph-contract-plan.md)
2. [Cytoscape Canvas 与工作图页面](./2026-09-17-wb-gr-cytoscape-canvas-plan.md)
3. [Evidence Path 与 Graph to Action](./2026-09-17-wb-gr-evidence-action-plan.md)
4. [时间变化、AI 编排与发布闸门](./2026-09-17-wb-gr-temporal-ai-release-plan.md)

每份子计划都包含独立可运行的测试和提交点；下一份只消费上一份已经提交的接口。

## 总体依赖

```text
GR-Backend → GR-Canvas → GR-Evidence/Action → GR-Temporal/AI/Release
```

## 完成定义

- 4 份子计划逐项完成并各自提交。
- `npm run typecheck`、`npm run test:unit`、`npm run test:worker`、`npm run build`、`npm run test:smoke` 全部通过。
- 具备成员隔离、分页、幂等、citation、键盘访问、移动端降级和无 `undefined` 证据。
- 生产 migration、部署、生产 smoke 和 signed browser acceptance 仍需单独明确批准。
